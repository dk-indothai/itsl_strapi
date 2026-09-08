const assert = require("node:assert/strict");
const { test } = require("node:test");

const schemas = [
  [
    "overview",
    require("../src/api/overview/content-types/overview/schema.json"),
  ],
  [
    "disclosure-2015",
    require("../src/api/disclosure-2015/content-types/disclosure-2015/schema.json"),
  ],
  [
    "client-relation",
    require("../src/api/client-relation/content-types/client-relation/schema.json"),
  ],
];

for (const [name, schema] of schemas) {
  test(`${name} has the required integer order field`, () => {
    assert.deepEqual(schema.attributes.order, {
      type: "integer",
      required: true,
      default: 0,
    });
  });
}
