"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  baseUrl,
  objectKeyFromUrl,
  privateObjectKey,
  trimSlashes,
} = require("../scripts/private-media-migration");

test("builds deterministic private object keys without exposing original names", () => {
  assert.equal(trimSlashes("/private/root/"), "private/root");
  assert.equal(
    privateObjectKey("/private/root/", "resume", "resume_hash", ".pdf"),
    "private/root/resumes/resume_hash/resume_hash.pdf",
  );
  assert.equal(
    privateObjectKey("", "complaint", "image_hash", ".png"),
    "complaints/image_hash/image_hash.png",
  );
});

test("resolves bucket placeholders and refuses unrelated source URLs", () => {
  const base = baseUrl(
    "https://storage.googleapis.com/{bucket-name}/",
    "public-files",
  );
  assert.equal(base, "https://storage.googleapis.com/public-files");
  assert.equal(
    objectKeyFromUrl(
      "https://storage.googleapis.com/public-files/path/file.pdf",
      base,
    ),
    "path/file.pdf",
  );
  assert.throws(
    () => objectKeyFromUrl("https://example.invalid/file.pdf", base),
    /does not match/,
  );
});
