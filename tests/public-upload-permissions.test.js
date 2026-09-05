"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  BLOCKED_PUBLIC_UPLOAD_ACTIONS,
  PRIVATE_UPLOAD_ACTION,
  enforcePublicUploadPermissions,
} = require("../providers/private-media/permissions");

const setup = (permissions = []) => {
  const rows = permissions.map((action, index) => ({
    id: index + 1,
    role: 4,
    action,
  }));
  const permissionQuery = {
    async deleteMany({ where }) {
      for (let index = rows.length - 1; index >= 0; index--) {
        if (
          rows[index].role === where.role &&
          rows[index].action === where.action
        ) {
          rows.splice(index, 1);
        }
      }
    },
    async findOne({ where }) {
      return rows.find(
        (row) => row.role === where.role && row.action === where.action,
      );
    },
    async create({ data }) {
      rows.push({ id: rows.length + 1, ...data });
    },
  };
  const strapi = {
    db: {
      query(uid) {
        if (uid === "plugin::users-permissions.role") {
          return { findOne: async () => ({ id: 4, type: "public" }) };
        }
        return permissionQuery;
      },
    },
  };
  return { rows, strapi };
};

test("enables only private upload and removes every normal public Upload API action", async () => {
  const unrelated = "api::software.software.find";
  const { rows, strapi } = setup([unrelated, ...BLOCKED_PUBLIC_UPLOAD_ACTIONS]);

  await enforcePublicUploadPermissions(strapi);

  assert.deepEqual(
    rows.map(({ action }) => action).sort(),
    [PRIVATE_UPLOAD_ACTION, unrelated].sort(),
  );
});

test("permission enforcement is idempotent", async () => {
  const { rows, strapi } = setup([PRIVATE_UPLOAD_ACTION]);

  await enforcePublicUploadPermissions(strapi);
  await enforcePublicUploadPermissions(strapi);

  assert.deepEqual(
    rows.map(({ action }) => action),
    [PRIVATE_UPLOAD_ACTION],
  );
});
