"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  MEDIA_FOLDER_NAME,
  REPORT_MODEL,
  buildReportData,
  findSavedReport,
  getOrCreateMediaFolder,
  inspectRemoteFile,
  readSeedData,
  saveAndPublish,
} = require("../scripts/seed_financial_reports");

test("the checked-in Financial Report migration data is valid", async () => {
  const skipped = [];
  const reports = await readSeedData(undefined, (message) => skipped.push(message));
  assert.equal(reports.length, 87);
  assert.equal(reports.filter((item) => item.report_type === "Quarter").length, 70);
  assert.equal(reports.filter((item) => item.report_type === "Full Year").length, 17);
  assert.ok(reports.every((item) => item.file_path.startsWith("http")));
  assert.deepEqual(skipped, [
    "Skipped report with empty file_path: 2012 Q4 — Corrigendum to Quarterly Yearly Results 17-05-2012",
  ]);
});

test("payload follows the Financial Report content-type contract", () => {
  assert.deepEqual(
    buildReportData(
      { year: 2026, report_type: "Quarter", quarter: 2 },
      7,
    ),
    { year: 2026, report_type: "Quarter", quarter: 2, file: 7 },
  );
  assert.deepEqual(
    buildReportData(
      { year: 2026, report_type: "Full Year", quarter: null },
      8,
    ),
    { year: 2026, report_type: "Full Year", quarter: null, file: 8 },
  );
});

test("financial schema permits null quarter only for Full Year validation", () => {
  const schema = require("../src/api/financial-report/content-types/financial-report/schema.json");
  assert.equal(schema.attributes.quarter.required, undefined);
  assert.deepEqual(schema.attributes.report_type.enum, ["Quarter", "Full Year"]);
  assert.equal(schema.attributes.quarter.min, 1);
  assert.equal(schema.attributes.quarter.max, 4);
});

test("same-period reports match their own source file", () => {
  const saved = [
    {
      documentId: "standalone",
      year: 2015,
      report_type: "Quarter",
      quarter: 3,
      file: { name: "standalone.pdf", caption: "https://example.com/standalone.pdf" },
    },
    {
      documentId: "consolidated",
      year: 2015,
      report_type: "Quarter",
      quarter: 3,
      file: { name: "consolidated.pdf", caption: "https://example.com/consolidated.pdf" },
    },
  ];
  const report = {
    year: 2015,
    report_type: "Quarter",
    quarter: 3,
    file_path: "https://example.com/consolidated.pdf",
  };
  assert.equal(
    findSavedReport(saved, report, "consolidated.pdf", new Set(), 2)?.documentId,
    "consolidated",
  );
});

test("remote files are inspected with HEAD", async () => {
  let method;
  const file = await inspectRemoteFile(
    "https://example.com/report.pdf",
    async (_url, options) => {
      method = options.method;
      return new Response(null, { headers: { "content-length": "1250" } });
    },
  );
  assert.equal(method, "HEAD");
  assert.deepEqual(file, { fileName: "report.pdf", size: 1.25 });
});

test("creates one root Financial Reports media folder", async () => {
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
    name: "Financial Reports",
    parent: null,
  });
});

test("publishes new and existing Financial Report documents", async () => {
  const calls = [];
  const api = {
    async request(endpoint, options) {
      calls.push({ endpoint, options });
      return { data: { documentId: "saved-document" } };
    },
  };
  const data = { year: 2026, report_type: "Full Year", quarter: null, file: 7 };
  await saveAndPublish(api, undefined, data);
  await saveAndPublish(api, "existing-document", data);
  assert.equal(
    calls[0].endpoint,
    `/content-manager/collection-types/${encodeURIComponent(REPORT_MODEL)}/actions/publish`,
  );
  assert.equal(
    calls[1].endpoint,
    `/content-manager/collection-types/${encodeURIComponent(REPORT_MODEL)}/existing-document/actions/publish`,
  );
  assert.deepEqual(calls[1].options, { method: "POST", json: data });
});
