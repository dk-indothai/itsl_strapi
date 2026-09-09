"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { exports: resolveExports } = require("resolve.exports");

const root = path.resolve(__dirname, "..");
const pluginRoot = path.join(root, "src/plugins/markdown-table");
const packageInfo = require(path.join(pluginRoot, "package.json"));

test("exposes a Strapi-loadable CommonJS server entry", () => {
  const [serverEntry] = resolveExports(packageInfo, "strapi-server", {
    require: true,
  });

  assert.equal(serverEntry, "./dist/server/index.js");
  assert.equal(path.extname(serverEntry), ".js");
  assert.equal(packageInfo.type, undefined);
  assert.equal(
    packageInfo.exports["./strapi-server"].import,
    "./dist/server/index.mjs",
  );
});

test("keeps Overview description on the markdown custom field", () => {
  const schema = require("../src/api/overview/content-types/overview/schema.json");

  assert.equal(schema.attributes.description.type, "customField");
  assert.equal(
    schema.attributes.description.customField,
    "plugin::markdown-table.markdown",
  );
});
