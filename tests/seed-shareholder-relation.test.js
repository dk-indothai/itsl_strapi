"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  MEDIA_FOLDER_NAME,
  PUBLIC_ACTIONS,
  getOrCreateMediaFolder,
  loadFile,
  readSeedData,
  runInParallel,
  setPublicAction,
  uploadFile,
  validateReportFiles,
} = require("../scripts/seed_shareholder_relation");

test("the checked-in shareholder migration data is valid", async () => {
  const skipped = [];
  const categories = await readSeedData(undefined, (message) => {
    skipped.push(message);
  });
  assert.ok(categories.length > 0);
  assert.ok(
    categories.every((category) =>
      category.shareholder_relation.every((report) => report.file_path),
    ),
  );
  for (const category of categories) {
    const titles = category.shareholder_relation.map((report) => report.title);
    assert.equal(new Set(titles).size, titles.length);
  }
  assert.ok(skipped.every((message) => message.startsWith("Skipped ")));
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

test("uploads files into the Shareholding Relation folder", async () => {
  const report = {
    file_bytes: Buffer.from("spreadsheet data"),
    file_name: "report.xlsx",
  };
  let folder;
  const api = {
    async request(_endpoint, options) {
      folder = JSON.parse(options.body.get("fileInfo")).folder;
      return { id: 7 };
    },
  };

  await uploadFile(api, report, 42);
  assert.equal(folder, 42);
});

test("file_path can be a URL for any file type", async () => {
  const file = await loadFile(
    "https://example.com/report.xlsx",
    undefined,
    async () => new Response("spreadsheet data"),
  );

  assert.equal(file.fileName, "report.xlsx");
  assert.equal(file.bytes.toString(), "spreadsheet data");
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
    async () => new Response("", { status: 404 }),
    (message) => logs.push(message),
  );

  assert.equal(unavailable, 1);
  assert.match(logs[0], /Missing report/);
  assert.match(logs[0], /404/);
});
