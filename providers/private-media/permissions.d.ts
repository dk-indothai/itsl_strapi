import type { Core } from "@strapi/strapi";

export const PRIVATE_UPLOAD_ACTION: string;
export const BLOCKED_PUBLIC_UPLOAD_ACTIONS: readonly string[];
export function enforcePublicUploadPermissions(
  strapi: Core.Strapi,
): Promise<void>;
