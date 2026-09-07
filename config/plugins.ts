import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Core } from "@strapi/strapi";

const allowedMediaTypes = [
  "image/*",
  "video/*",
  "audio/*",
  "application/pdf",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.*",
  "text/html",
  "text/plain",
  "text/csv",
];

const deniedTypes = [
  "image/svg+xml",
  "application/vnd.microsoft.portable-executable",
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-executable",
  "application/x-dosexec",
  "application/x-sh",
  "text/x-shellscript",
  "application/x-mach-binary",
];

const config = ({
  env,
}: Core.Config.Shared.ConfigParams): Core.Config.Plugin => {
  const configuredServiceAccountPath = env("GCS_SERVICE_ACCOUNT_PATH");
  const localServiceAccountPath = path.resolve(
    process.cwd(),
    "gcs_service_account.json",
  );
  const serviceAccountPath = configuredServiceAccountPath
    ? path.resolve(process.cwd(), configuredServiceAccountPath)
    : existsSync(localServiceAccountPath)
      ? localServiceAccountPath
      : undefined;
  const serviceAccount = serviceAccountPath
    ? JSON.parse(readFileSync(serviceAccountPath, "utf8"))
    : undefined;

  return {
    "users-permissions": {
      config: {
        jwtManagement: "refresh",
        sessions: {
          httpOnly: true,
        },
      },
    },
    upload: {
      config: {
        provider: "@indothai/private-media",
        providerOptions: {
          public: {
            bucketName: env("GCS_BUCKET_NAME"),
            basePath: env("GCS_BASE_PATH", ""),
            baseUrl: env(
              "GCS_BASE_URL",
              "https://storage.googleapis.com/{bucket-name}",
            ),
            uniform: env.bool("GCS_UNIFORM", true),
            skipCheckBucket: env.bool("GCS_SKIP_CHECK_BUCKET", false),
            ...(serviceAccount ? { serviceAccount } : {}),
          },
          private: {
            bucketName: env("GCS_PRIVATE_BUCKET_NAME"),
            basePath: env("GCS_PRIVATE_BASE_PATH", ""),
            baseUrl: env(
              "GCS_PRIVATE_BASE_URL",
              "https://storage.googleapis.com/{bucket-name}",
            ),
            uniform: env.bool("GCS_UNIFORM", true),
            skipCheckBucket: env.bool("GCS_SKIP_CHECK_BUCKET", false),
            ...(serviceAccount ? { serviceAccount } : {}),
          },
        },
        security: {
          allowedTypes: allowedMediaTypes,
          deniedTypes,
        },
      },
    },
  };
};

export default config;
