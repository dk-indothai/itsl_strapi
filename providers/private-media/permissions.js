"use strict";

const PRIVATE_UPLOAD_ACTION = "api::private-upload.private-upload.create";
const BLOCKED_PUBLIC_UPLOAD_ACTIONS = Object.freeze([
  "plugin::upload.content-api.upload",
  "plugin::upload.content-api.find",
  "plugin::upload.content-api.findPage",
  "plugin::upload.content-api.findOne",
  "plugin::upload.content-api.destroy",
]);

const enforcePublicUploadPermissions = async (strapi) => {
  const roleQuery = strapi.db.query("plugin::users-permissions.role");
  const permissionQuery = strapi.db.query(
    "plugin::users-permissions.permission",
  );
  const publicRole = await roleQuery.findOne({ where: { type: "public" } });

  if (!publicRole) {
    throw new Error("The Strapi Public role was not found.");
  }

  for (const action of BLOCKED_PUBLIC_UPLOAD_ACTIONS) {
    await permissionQuery.deleteMany({
      where: { role: publicRole.id, action },
    });
  }

  const privateUploadPermission = await permissionQuery.findOne({
    where: { role: publicRole.id, action: PRIVATE_UPLOAD_ACTION },
  });

  if (!privateUploadPermission) {
    await permissionQuery.create({
      data: { role: publicRole.id, action: PRIVATE_UPLOAD_ACTION },
    });
  }
};

module.exports = {
  BLOCKED_PUBLIC_UPLOAD_ACTIONS,
  PRIVATE_UPLOAD_ACTION,
  enforcePublicUploadPermissions,
};
