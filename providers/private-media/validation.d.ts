import type { Core } from "@strapi/strapi";
import type { PrivateUploadPurpose } from "./context";

export const PROVIDER_NAME: "@indothai/private-media";

export interface PrivateUploadRule {
  maxBytes: number;
  extensions: readonly string[];
  mimeTypes: readonly string[];
}

export const PRIVATE_UPLOAD_RULES: Readonly<
  Record<PrivateUploadPurpose, PrivateUploadRule>
>;

export function getRule(purpose: string): PrivateUploadRule | undefined;

export function isAllowedPrivateFile(
  file: unknown,
  purpose: PrivateUploadPurpose,
): boolean;

export function normalizeMediaId(value: unknown): number | undefined;

export function assertUnusedPrivateMedia(
  strapi: Core.Strapi,
  value: unknown,
  purpose: PrivateUploadPurpose,
): Promise<unknown>;
