"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PRIVATE_UPLOAD_RULES,
  assertUnusedPrivateMedia,
  isAllowedPrivateFile,
  normalizeMediaId,
} = require("../providers/private-media/validation");

const file = (overrides = {}) => ({
  id: 7,
  provider: "@indothai/private-media",
  ext: ".pdf",
  mime: "application/pdf",
  provider_metadata: {
    visibility: "private",
    purpose: "resume",
    bytes: 2_000_000,
  },
  related: [],
  ...overrides,
});

test("defines the exact server-side limits", () => {
  assert.equal(PRIVATE_UPLOAD_RULES.resume.maxBytes, 2_000_000);
  assert.equal(PRIVATE_UPLOAD_RULES.complaint.maxBytes, 5_000_000);
  assert.equal(normalizeMediaId(7), 7);
  assert.equal(normalizeMediaId("7"), undefined);
});

test("accepts only matching private provider metadata and file types", () => {
  assert.equal(isAllowedPrivateFile(file(), "resume"), true);
  assert.equal(
    isAllowedPrivateFile(
      file({ provider_metadata: { visibility: "public" } }),
      "resume",
    ),
    false,
  );
  assert.equal(
    isAllowedPrivateFile(
      file({
        provider_metadata: {
          visibility: "private",
          purpose: "complaint",
          bytes: 2_000_000,
        },
      }),
      "resume",
    ),
    false,
  );
  assert.equal(
    isAllowedPrivateFile(
      file({
        provider_metadata: {
          visibility: "private",
          purpose: "resume",
          bytes: 2_000_001,
        },
      }),
      "resume",
    ),
    false,
  );
});

test("rejects missing, mismatched, and already-related media", async () => {
  const mock = (record) => ({
    db: {
      query: () => ({
        findOne: async () => record,
      }),
    },
  });

  await assert.rejects(
    () => assertUnusedPrivateMedia(mock(undefined), 1, "resume"),
    /not valid/,
  );
  await assert.rejects(
    () =>
      assertUnusedPrivateMedia(
        mock(file({ related: [{ id: 1 }] })),
        7,
        "resume",
      ),
    /already in use/,
  );
  await assert.rejects(
    () => assertUnusedPrivateMedia(mock(file()), "7", "resume"),
    /valid private/,
  );
  assert.deepEqual(
    await assertUnusedPrivateMedia(mock(file()), 7, "resume"),
    file(),
  );
});
