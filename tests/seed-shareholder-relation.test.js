"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  MEDIA_FOLDER_NAME,
  PUBLIC_ACTIONS,
  getOrCreateMediaFolder,
  loadPdf,
  readSeedData,
  setPublicAction,
  uploadPdf,
} = require("../scripts/seed_shareholder_relation");

test("the checked-in shareholder migration data is valid", async () => {
  const categories = await readSeedData(
    undefined,
    undefined,
    async () => new Response("%PDF-1.4 test"),
  );
  assert.ok(categories.length > 0);
  assert.ok(
    categories.every((category) => category.shareholder_relation.length > 0),
  );
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

test("uploads PDFs into the Shareholding Relation folder", async () => {
  const [category] = await readSeedData(
    undefined,
    undefined,
    async () => new Response("%PDF-1.4 test"),
  );
  const [report] = category.shareholder_relation;
  let folder;
  const api = {
    async request(_endpoint, options) {
      folder = JSON.parse(options.body.get("fileInfo")).folder;
      return { id: 7 };
    },
  };

  await uploadPdf(api, report, 42);
  assert.equal(folder, 42);
});

test("file_path can be a PDF URL", async () => {
  const pdf = await loadPdf(
    "https://example.com/report.pdf",
    undefined,
    async () => new Response("%PDF-1.4 test"),
  );

  assert.equal(pdf.fileName, "report.pdf");
  assert.equal(pdf.bytes.subarray(0, 5).toString(), "%PDF-");
});
