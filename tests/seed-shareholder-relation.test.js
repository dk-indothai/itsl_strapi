"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  MEDIA_FOLDER_NAME,
  PUBLIC_ACTIONS,
  buildCategoryData,
  buildReportData,
  createApi,
  findSavedReport,
  getOrCreateMediaFolder,
  inspectFile,
  loadFile,
  normalizeCreatedAt,
  parseServerSentEvents,
  readSeedData,
  runInParallel,
  setPublicAction,
  uploadFile,
  uploadRemoteFile,
  validateReportFiles,
} = require("../scripts/seed_shareholder_relation");

test("the checked-in shareholder migration data is valid", async () => {
  const skipped = [];
  const categories = await readSeedData(undefined, (message) => {
    skipped.push(message);
  });
  assert.ok(categories.length > 0);
  assert.ok(categories.every((category) => typeof category.slug === "string"));
  assert.equal(
    categories.find((category) => category.name === "Annual Reports")?.slug,
    "annual_reports",
  );
  assert.ok(
    categories.every((category) =>
      category.shareholder_relation.every(
        (report) => report.file_path && report.created_at.endsWith("Z"),
      ),
    ),
  );
  for (const category of categories) {
    const reportKeys = category.shareholder_relation.map(
      (report) => `${report.title}\0${report.file_path}`,
    );
    assert.equal(new Set(reportKeys).size, reportKeys.length);
  }
  assert.ok(
    categories.some((category) => {
      const titles = category.shareholder_relation.map(
        (report) => report.title,
      );
      return new Set(titles).size < titles.length;
    }),
    "same-title reports with different files should be retained",
  );
  assert.ok(skipped.every((message) => message.startsWith("Skipped ")));
});

test("category payload carries the migration slug", () => {
  assert.deepEqual(
    buildCategoryData({ name: "Annual Reports", slug: "annual_reports" }),
    { name: "Annual Reports", slug: "annual_reports" },
  );
  assert.deepEqual(buildCategoryData({ name: "Legacy category" }), {
    name: "Legacy category",
    slug: "",
  });
});

test("normalizes migration dates from Asia/Kolkata and rejects invalid dates", () => {
  assert.equal(
    normalizeCreatedAt("2026-07-20 14:53:04", "created_at"),
    "2026-07-20T09:23:04.000Z",
  );
  assert.throws(
    () => normalizeCreatedAt("2026-02-30 14:53:04", "created_at"),
    /not a valid date and time/,
  );
  assert.throws(
    () => normalizeCreatedAt("20 July 2026", "created_at"),
    /must use YYYY-MM-DD HH:mm:ss/,
  );
});

test("report payload carries the original creation date", () => {
  assert.deepEqual(
    buildReportData(
      {
        title: "Annual Report",
        created_at: "2026-07-20T09:23:04.000Z",
      },
      7,
      "category-document-id",
    ),
    {
      title: "Annual Report",
      original_created_at: "2026-07-20T09:23:04.000Z",
      file: 7,
      shareholder_relation_category: {
        connect: [
          {
            id: "category-document-id",
            documentId: "category-document-id",
          },
        ],
        disconnect: [],
      },
    },
  );
});

test("shareholder schema keeps the original date separate from Strapi createdAt", () => {
  const schema = require("../src/api/shareholder-relation/content-types/shareholder-relation/schema.json");

  assert.deepEqual(schema.attributes.original_created_at, {
    type: "datetime",
  });
  assert.equal(schema.attributes.created_at, undefined);
});

test("same-title reports match the saved record for their own source file", () => {
  const category = "category-document-id";
  const savedReports = [
    {
      documentId: "saved-a",
      title: "Repeated title",
      file: { name: "a.pdf", caption: "https://example.com/a.pdf" },
      shareholder_relation_category: { documentId: category },
    },
    {
      documentId: "saved-b",
      title: "Repeated title",
      file: { name: "b.pdf", caption: "https://example.com/b.pdf" },
      shareholder_relation_category: { documentId: category },
    },
  ];
  const claimed = new Set();
  const second = findSavedReport(
    savedReports,
    { title: "Repeated title", file_path: "https://example.com/b.pdf" },
    category,
    "b.pdf",
    claimed,
    2,
  );
  claimed.add(second.documentId);
  const first = findSavedReport(
    savedReports,
    { title: "Repeated title", file_path: "https://example.com/a.pdf" },
    category,
    "a.pdf",
    claimed,
    2,
  );

  assert.equal(second.documentId, "saved-b");
  assert.equal(first.documentId, "saved-a");
});

test("public permission changes preserve unrelated actions", () => {
  const permissions = {
    "api::unrelated": {
      controllers: {
        unrelated: { find: { enabled: true, policy: "" } },
      },
    },
  };

  for (const action of PUBLIC_ACTIONS) {
    setPublicAction(permissions, action);
  }

  assert.equal(
    permissions["api::unrelated"].controllers.unrelated.find.enabled,
    true,
  );
  for (const action of PUBLIC_ACTIONS) {
    const [type, controller, method] = action.split(".");
    assert.equal(
      permissions[type].controllers[controller][method].enabled,
      true,
    );
  }
});

test("uses one root Shareholding Relation media folder", async () => {
  const calls = [];
  const api = {
    async request(endpoint, options) {
      calls.push({ endpoint, options });
      if (endpoint.startsWith("/upload/folders?")) return { data: [] };
      return { data: { id: 42, name: MEDIA_FOLDER_NAME, parent: null } };
    },
  };

  const folder = await getOrCreateMediaFolder(api);
  assert.equal(folder.id, 42);
  assert.deepEqual(calls[1].options.json, {
    name: "Shareholding Relation",
    parent: null,
  });
});

test("uploads files into the Shareholding Relation folder with their source", async () => {
  const report = {
    bytes: Buffer.from("spreadsheet data"),
    fileName: "report.xlsx",
  };
  let fileInfo;
  const api = {
    async request(_endpoint, options) {
      fileInfo = JSON.parse(options.body.get("fileInfo"));
      return { id: 7 };
    },
  };

  await uploadFile(api, report, 42, "https://example.com/report.xlsx");
  assert.equal(fileInfo.folder, 42);
  assert.equal(fileInfo.caption, "https://example.com/report.xlsx");
});

test("remote file metadata is checked without downloading the body", async () => {
  let method;
  const file = await inspectFile(
    "https://example.com/report.xlsx",
    undefined,
    async (_url, options) => {
      method = options.method;
      return new Response(null, {
        headers: { "content-length": "1600" },
      });
    },
  );

  assert.equal(method, "HEAD");
  assert.equal(file.fileName, "report.xlsx");
  assert.equal(file.size, 1.6);
  assert.equal(file.bytes, undefined);
});

test("remote sources are not loaded into the seed process", async () => {
  await assert.rejects(
    loadFile("https://example.com/report.pdf"),
    /must be a filename from migration_data\/files/,
  );
});

test("parses Strapi server-sent upload events", () => {
  const events = parseServerSentEvents(
    'event: file:complete\ndata: {"file":{"id":7}}\n\n' +
      'event: stream:complete\ndata: {"data":[{"id":7}],"errors":[]}\n\n',
  );

  assert.equal(events[0].event, "file:complete");
  assert.equal(events[0].data.file.id, 7);
});

test("remote files are fetched by Strapi and retain their source caption", async () => {
  const calls = [];
  const api = {
    async request(endpoint, options) {
      calls.push({ endpoint, options });
      if (endpoint === "/upload/actions/upload-from-urls") {
        return (
          'event: file:complete\ndata: {"file":{"id":7,"name":"report.pdf"}}\n\n' +
          'event: stream:complete\ndata: {"data":[{"id":7}],"errors":[]}\n\n'
        );
      }
      return { id: 7, name: "report.pdf" };
    },
  };

  const file = await uploadRemoteFile(
    api,
    "https://example.com/report.pdf",
    42,
  );

  assert.equal(file.id, 7);
  assert.deepEqual(calls[0], {
    endpoint: "/upload/actions/upload-from-urls",
    options: {
      method: "POST",
      json: {
        urls: ["https://example.com/report.pdf"],
        folderId: 42,
      },
      responseType: "text",
      timeoutMs: 600_000,
    },
  });
  assert.equal(calls[1].endpoint, "/upload/files/7");
  assert.equal(calls[1].options.method, "PUT");
  assert.deepEqual(JSON.parse(calls[1].options.body.get("fileInfo")), {
    name: "report.pdf",
    alternativeText: null,
    caption: "https://example.com/report.pdf",
    folder: 42,
  });
});

test("remote upload event failures include the Strapi message", async () => {
  const api = {
    async request() {
      return 'event: file:error\ndata: {"message":"source fetch failed"}\n\n';
    },
  };

  await assert.rejects(
    uploadRemoteFile(api, "https://example.com/report.pdf", 42),
    /source fetch failed/,
  );
});

test("Strapi HTML errors retain endpoint, status and content type", async () => {
  const api = createApi(
    "https://strapi.example.com",
    async () =>
      new Response("<html><head></head><body>Payload Too Large</body></html>", {
        status: 413,
        headers: { "content-type": "text/html" },
      }),
  );

  await assert.rejects(
    api.request("/upload/files", { method: "POST" }),
    /\/upload\/files failed \(413\): expected JSON but received text\/html/,
  );
});

test("file work runs asynchronously with bounded concurrency", async () => {
  let active = 0;
  let highest = 0;

  await runInParallel(Array.from({ length: 12 }), async () => {
    active += 1;
    highest = Math.max(highest, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
  });

  assert.ok(highest > 1);
  assert.ok(highest <= 4);
});

test("unavailable source files are logged and skipped", async () => {
  const logs = [];
  const unavailable = await validateReportFiles(
    [
      {
        shareholder_relation: [
          {
            title: "Missing report",
            file_path: "https://example.com/missing.zip",
          },
        ],
      },
    ],
    async () => new Response(null, { status: 404 }),
    (message) => logs.push(message),
  );

  assert.equal(unavailable, 1);
  assert.match(logs[0], /Missing report/);
  assert.match(logs[0], /404/);
});
