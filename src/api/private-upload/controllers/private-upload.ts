import { errors } from "@strapi/utils";
import type { PrivateUploadPurpose } from "@indothai/private-media/context";
import { withPrivateUpload } from "@indothai/private-media/context";
import {
  getRule,
  isAllowedPrivateFile,
} from "@indothai/private-media/validation";

type IncomingFile = {
  size?: number;
};

const asSingleFile = (value: unknown): IncomingFile | undefined => {
  if (Array.isArray(value)) {
    return value.length === 1 ? (value[0] as IncomingFile) : undefined;
  }
  return value && typeof value === "object"
    ? (value as IncomingFile)
    : undefined;
};

const asPurpose = (value: unknown): PrivateUploadPurpose | undefined =>
  value === "resume" || value === "complaint" ? value : undefined;

export default {
  async create(ctx: any) {
    const purpose = asPurpose(ctx.request.body?.purpose);
    if (!purpose) {
      throw new errors.ValidationError("Purpose must be resume or complaint.");
    }

    const rawFiles = ctx.request.files?.files;
    const file = asSingleFile(rawFiles);
    const fileCount = Array.isArray(rawFiles)
      ? rawFiles.length
      : rawFiles
        ? 1
        : 0;
    if (!file || fileCount !== 1 || !file.size || file.size <= 0) {
      throw new errors.ValidationError(
        "Exactly one non-empty file is required.",
      );
    }

    const rule = getRule(purpose)!;
    if (file.size > rule.maxBytes) {
      throw new errors.PayloadTooLargeError(
        "The " +
          purpose +
          " file exceeds the " +
          rule.maxBytes.toLocaleString("en-US") +
          " byte limit.",
      );
    }

    // Keep the routing marker server-side and let Strapi perform MIME detection.
    ctx.request.body = {};
    const uploadController = strapi.plugin("upload").controller("content-api");
    await withPrivateUpload(purpose, () =>
      uploadController.upload(ctx, async () => undefined),
    );

    const result = Array.isArray(ctx.body) ? ctx.body[0] : ctx.body;
    const id = Number(result?.id);
    const persisted = Number.isInteger(id)
      ? await strapi.db.query("plugin::upload.file").findOne({ where: { id } })
      : undefined;

    if (!persisted || !isAllowedPrivateFile(persisted, purpose)) {
      if (persisted) {
        await strapi.plugin("upload").service("upload").remove(persisted);
      }
      throw new errors.ValidationError(
        "The uploaded file is not an allowed " + purpose + " file.",
      );
    }

    ctx.status = 201;
    ctx.body = [{ id }];
  },
};
