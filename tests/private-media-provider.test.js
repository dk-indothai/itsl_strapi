"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createDualProvider,
  PROVIDER_NAME,
} = require("../providers/private-media");
const { withPrivateUpload } = require("../providers/private-media/context");

const setup = () => {
  const calls = [];
  const configs = [];
  const factory = {
    init(config) {
      configs.push(config);
      const bucket = config.bucketName;
      return {
        async upload(file) {
          calls.push(["upload", bucket]);
          file.url = "https://storage.test/" + bucket + "/file";
        },
        async uploadStream(file) {
          calls.push(["uploadStream", bucket]);
          file.url = "https://storage.test/" + bucket + "/file";
        },
        async delete() {
          calls.push(["delete", bucket]);
        },
        async getSignedUrl() {
          calls.push(["sign", bucket]);
          return { url: "https://signed.test/" + bucket };
        },
      };
    },
  };
  const provider = createDualProvider(
    {
      public: { bucketName: "public" },
      private: { bucketName: "private" },
    },
    factory,
  );
  return { calls, configs, provider };
};

test("keeps ordinary uploads public", async () => {
  const { calls, configs, provider } = setup();
  const file = { sizeInBytes: 100 };

  await provider.upload(file);

  assert.deepEqual(calls, [["upload", "public"]]);
  assert.equal(configs[0].publicFiles, true);
  assert.equal(configs[1].publicFiles, false);
  assert.equal(configs[1].expires, 300_000);
  assert.deepEqual(file.provider_metadata, {
    visibility: "public",
    bytes: 100,
  });
  assert.equal(await provider.isPrivate(), true);
});

test("routes request-scoped private uploads and records their purpose", async () => {
  const { calls, provider } = setup();
  const file = { sizeInBytes: 2_000_000 };

  await withPrivateUpload("resume", () => provider.uploadStream(file));

  assert.deepEqual(calls, [["uploadStream", "private"]]);
  assert.equal(file.path, "/resumes");
  assert.deepEqual(file.provider_metadata, {
    visibility: "private",
    purpose: "resume",
    bytes: 2_000_000,
  });
});

test("signs and deletes only through the owning bucket", async () => {
  const { calls, provider } = setup();
  const publicFile = { url: "https://storage.test/public/file" };
  const privateFile = {
    url: "https://storage.test/private/file",
    provider_metadata: { visibility: "private" },
  };

  assert.deepEqual(await provider.getSignedUrl(publicFile), {
    url: publicFile.url,
  });
  assert.deepEqual(await provider.getSignedUrl(privateFile), {
    url: "https://signed.test/private",
  });
  await provider.delete(publicFile);
  await provider.delete(privateFile);

  assert.deepEqual(calls, [
    ["sign", "private"],
    ["delete", "public"],
    ["delete", "private"],
  ]);
  assert.equal(PROVIDER_NAME, "@indothai/private-media");
});

test("keeps replacements in the bucket that owns the existing file", async () => {
  const { calls, provider } = setup();
  const privateFile = {
    provider_metadata: {
      visibility: "private",
      purpose: "complaint",
    },
  };
  const privateReplacement = { sizeInBytes: 250 };
  const publicReplacement = { sizeInBytes: 500 };

  await provider.replace(privateReplacement, privateFile);
  await provider.replaceStream(publicReplacement, {
    provider_metadata: { visibility: "public" },
  });

  assert.deepEqual(calls, [
    ["upload", "private"],
    ["uploadStream", "public"],
  ]);
  assert.equal(privateReplacement.path, "/complaints");
  assert.deepEqual(privateReplacement.provider_metadata, {
    visibility: "private",
    purpose: "complaint",
    bytes: 250,
  });
  assert.deepEqual(publicReplacement.provider_metadata, {
    visibility: "public",
    bytes: 500,
  });
});
