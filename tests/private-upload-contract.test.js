"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("registers one protected private-upload route", () => {
  const route = read("src/api/private-upload/routes/private-upload.ts");
  assert.match(route, /method: ["']POST["']/);
  assert.match(route, /path: ["']\/private-upload["']/);
  assert.doesNotMatch(route, /auth:\s*false/);
});

test("returns only the uploaded numeric ID and uses request-scoped routing", () => {
  const controller = read(
    "src/api/private-upload/controllers/private-upload.ts",
  );
  assert.match(controller, /withPrivateUpload\(purpose/);
  assert.match(controller, /ctx\.body = \[\{ id \}\]/);
  assert.match(controller, /PayloadTooLargeError/);
  assert.match(controller, /isAllowedPrivateFile/);
});

test("Candidate and Complaint creation require matching private media", () => {
  const candidate = read("src/api/candidate/controllers/candidate.ts");
  const complaint = read("src/api/complaint/controllers/complaint.ts");
  assert.match(candidate, /assertUnusedPrivateMedia/);
  assert.match(candidate, /["']resume["']/);
  assert.match(complaint, /assertUnusedPrivateMedia/);
  assert.match(complaint, /["']complaint["']/);
});
