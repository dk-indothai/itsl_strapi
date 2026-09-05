"use strict";

const { errors } = require("@strapi/utils");

const PROVIDER_NAME = "@indothai/private-media";
const PRIVATE_UPLOAD_RULES = Object.freeze({
  resume: Object.freeze({
    maxBytes: 2_000_000,
    extensions: Object.freeze([".pdf"]),
    mimeTypes: Object.freeze(["application/pdf"]),
  }),
  complaint: Object.freeze({
    maxBytes: 5_000_000,
    extensions: Object.freeze([
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".pdf",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
      ".txt",
      ".csv",
    ]),
    mimeTypes: Object.freeze([
      "image/jpeg",
      "image/png",
      "image/gif",
      "application/pdf",
      "application/msword",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
      "text/csv",
    ]),
  }),
});

const getRule = (purpose) => PRIVATE_UPLOAD_RULES[purpose];

const getMetadata = (file) =>
  file?.provider_metadata && typeof file.provider_metadata === "object"
    ? file.provider_metadata
    : {};

const isAllowedPrivateFile = (file, purpose) => {
  const rule = getRule(purpose);
  const metadata = getMetadata(file);
  const bytes = Number(metadata.bytes);
  const extension = String(file?.ext || "").toLowerCase();
  const mime = String(file?.mime || "").toLowerCase();

  return Boolean(
    rule &&
    file?.provider === PROVIDER_NAME &&
    metadata.visibility === "private" &&
    metadata.purpose === purpose &&
    Number.isInteger(bytes) &&
    bytes > 0 &&
    bytes <= rule.maxBytes &&
    rule.extensions.includes(extension) &&
    rule.mimeTypes.includes(mime),
  );
};

const normalizeMediaId = (value) => {
  const id = typeof value === "number" ? value : Number.NaN;
  return Number.isInteger(id) && id > 0 ? id : undefined;
};

const assertUnusedPrivateMedia = async (strapi, value, purpose) => {
  const id = normalizeMediaId(value);
  if (!id) {
    throw new errors.ValidationError(
      "A valid private " + purpose + " upload is required.",
    );
  }

  const file = await strapi.db.query("plugin::upload.file").findOne({
    where: { id },
    populate: ["related"],
  });

  if (!isAllowedPrivateFile(file, purpose)) {
    throw new errors.ValidationError(
      "The selected " + purpose + " file is not valid.",
    );
  }

  if (Array.isArray(file.related) && file.related.length > 0) {
    throw new errors.ValidationError(
      "The selected " + purpose + " file is already in use.",
    );
  }

  return file;
};

module.exports = {
  PRIVATE_UPLOAD_RULES,
  PROVIDER_NAME,
  assertUnusedPrivateMedia,
  getRule,
  isAllowedPrivateFile,
  normalizeMediaId,
};
