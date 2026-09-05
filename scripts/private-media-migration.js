"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Storage } = require("@google-cloud/storage");
const { Client } = require("pg");
require("dotenv").config();

const OLD_PROVIDER =
  "@strapi-community/strapi-provider-upload-google-cloud-storage";
const NEW_PROVIDER = "@indothai/private-media";
const mode = process.argv[2] || "dry-run";
const confirmDelete = process.argv.includes("--confirm-delete-public-copies");

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required.");
  return value;
};

const trimSlashes = (value) => value.replace(/^\/+|\/+$/g, "");
const baseUrl = (value, bucket) =>
  value.replace("{bucket-name}", bucket).replace(/\/+$/, "");
const objectUrl = (base, key) => base + "/" + key;
const objectKeyFromUrl = (url, base) => {
  const prefix = base + "/";
  if (!url.startsWith(prefix)) {
    throw new Error(
      "A media URL does not match its configured bucket base URL.",
    );
  }
  return decodeURIComponent(url.slice(prefix.length));
};
const privateObjectKey = (basePath, purpose, hash, extension) =>
  [trimSlashes(basePath), purpose === "resume" ? "resumes" : "complaints", hash]
    .filter(Boolean)
    .join("/") +
  "/" +
  hash +
  (extension || "");

const serviceAccount = () => {
  const configured = process.env.GCS_SERVICE_ACCOUNT_PATH?.trim();
  const filename = configured
    ? path.resolve(process.cwd(), configured)
    : path.resolve(process.cwd(), "gcs_service_account.json");
  return fs.existsSync(filename)
    ? JSON.parse(fs.readFileSync(filename, "utf8"))
    : undefined;
};

const database = () =>
  new Client({
    connectionString: process.env.DATABASE_URL || undefined,
    host: process.env.DATABASE_HOST || "localhost",
    port: Number(process.env.DATABASE_PORT || 5432),
    database: process.env.DATABASE_NAME || "strapi",
    user: process.env.DATABASE_USERNAME || "strapi",
    password: process.env.DATABASE_PASSWORD || "strapi",
    ssl:
      process.env.DATABASE_SSL === "true"
        ? {
            rejectUnauthorized:
              process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
          }
        : false,
  });

const storageClient = () => {
  const account = serviceAccount();
  return new Storage(
    account
      ? {
          projectId: account.project_id,
          credentials: {
            client_email: account.client_email,
            private_key: account.private_key,
          },
        }
      : undefined,
  );
};

const getSensitiveFiles = async (client) => {
  const result = await client.query(
    "select distinct f.id, f.hash, f.ext, f.url, f.formats, " +
      "f.provider, f.provider_metadata, r.related_type, r.field " +
      "from files f join files_related_mph r on r.file_id = f.id " +
      "where (r.related_type = 'api::candidate.candidate' and r.field = 'resume') " +
      "or (r.related_type = 'api::complaint.complaint' and r.field = 'attachment') " +
      "order by f.id",
  );
  return result.rows.map((row) => ({
    ...row,
    purpose:
      row.related_type === "api::candidate.candidate" ? "resume" : "complaint",
  }));
};

const getProviderCounts = async (client) => {
  const result = await client.query(
    "select provider, count(*)::int as count from files group by provider order by provider",
  );
  return result.rows;
};

const metadata = async (bucket, key) => {
  const [value] = await bucket.file(key).getMetadata();
  return {
    bytes: Number(value.size),
    crc32c: value.crc32c,
  };
};

const copyAndVerify = async (
  sourceBucket,
  sourceKey,
  targetBucket,
  targetKey,
) => {
  const source = await metadata(sourceBucket, sourceKey);
  const [exists] = await targetBucket.file(targetKey).exists();
  if (!exists) {
    await sourceBucket.file(sourceKey).copy(targetBucket.file(targetKey));
  }
  const target = await metadata(targetBucket, targetKey);
  if (
    source.bytes !== target.bytes ||
    (source.crc32c && target.crc32c && source.crc32c !== target.crc32c)
  ) {
    throw new Error("A copied object failed size or checksum verification.");
  }
  return target;
};

const migrateFormat = async (
  format,
  purpose,
  publicBase,
  privateBase,
  privateBasePath,
  publicBucket,
  privateBucket,
) => {
  const sourceKey = objectKeyFromUrl(format.url, publicBase);
  const targetKey = privateObjectKey(
    privateBasePath,
    purpose,
    format.hash,
    format.ext,
  );
  const verified = await copyAndVerify(
    publicBucket,
    sourceKey,
    privateBucket,
    targetKey,
  );
  return {
    ...format,
    url: objectUrl(privateBase, targetKey),
    provider_metadata: {
      ...(format.provider_metadata || {}),
      visibility: "private",
      purpose,
      bytes: verified.bytes,
      sourceObjectKey: sourceKey,
    },
  };
};

const apply = async (client, storage, config, files) => {
  const publicBucket = storage.bucket(config.publicBucketName);
  const privateBucket = storage.bucket(config.privateBucketName);
  const migrated = [];

  for (const file of files) {
    if (file.provider_metadata?.visibility === "private") {
      migrated.push(file);
      continue;
    }
    const sourceKey = objectKeyFromUrl(file.url, config.publicBase);
    const targetKey = privateObjectKey(
      config.privateBasePath,
      file.purpose,
      file.hash,
      file.ext,
    );
    const verified = await copyAndVerify(
      publicBucket,
      sourceKey,
      privateBucket,
      targetKey,
    );
    const formats = {};
    for (const [name, format] of Object.entries(file.formats || {})) {
      formats[name] = await migrateFormat(
        format,
        file.purpose,
        config.publicBase,
        config.privateBase,
        config.privateBasePath,
        publicBucket,
        privateBucket,
      );
    }
    migrated.push({
      ...file,
      url: objectUrl(config.privateBase, targetKey),
      formats,
      provider_metadata: {
        ...(file.provider_metadata || {}),
        visibility: "private",
        purpose: file.purpose,
        bytes: verified.bytes,
        sourceObjectKey: sourceKey,
      },
    });
  }

  await client.query("begin");
  try {
    await client.query(
      "update files set provider = $1, " +
        "provider_metadata = coalesce(provider_metadata, '{}'::jsonb) || " +
        '\'{"visibility":"public"}\'::jsonb ' +
        "where provider = $2",
      [NEW_PROVIDER, OLD_PROVIDER],
    );
    for (const file of migrated) {
      await client.query(
        "update files set provider = $1, url = $2, formats = $3::jsonb, " +
          "provider_metadata = $4::jsonb where id = $5",
        [
          NEW_PROVIDER,
          file.url,
          JSON.stringify(file.formats || {}),
          JSON.stringify(file.provider_metadata),
          file.id,
        ],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }

  console.log(
    "Applied: " +
      migrated.length +
      " sensitive media records now reference verified private copies.",
  );
  console.log("Public source objects were not deleted.");
};

const removeIfPresent = async (bucket, key) => {
  const [exists] = await bucket.file(key).exists();
  if (exists) await bucket.file(key).delete();
  return exists;
};

const finalize = async (client, storage, config, files) => {
  if (!confirmDelete) {
    throw new Error(
      "Finalize requires --confirm-delete-public-copies after backup and admin verification.",
    );
  }
  const publicBucket = storage.bucket(config.publicBucketName);
  const privateBucket = storage.bucket(config.privateBucketName);
  let deleted = 0;

  for (const file of files) {
    if (file.provider_metadata?.visibility !== "private") {
      throw new Error(
        "Every sensitive record must be migrated before finalize.",
      );
    }
    const privateKey = objectKeyFromUrl(file.url, config.privateBase);
    await metadata(privateBucket, privateKey);
    const sourceKeys = [
      file.provider_metadata.sourceObjectKey,
      ...Object.values(file.formats || {}).map(
        (format) => format.provider_metadata?.sourceObjectKey,
      ),
    ].filter(Boolean);
    for (const key of sourceKeys) {
      if (await removeIfPresent(publicBucket, key)) deleted += 1;
    }
  }

  console.log(
    "Finalized: deleted " +
      deleted +
      " public source objects after verifying their private destinations.",
  );
};

const main = async () => {
  if (!["dry-run", "apply", "finalize"].includes(mode)) {
    throw new Error("Use dry-run, apply, or finalize.");
  }
  const publicBucketName = required("GCS_BUCKET_NAME");
  const privateBucketName = required("GCS_PRIVATE_BUCKET_NAME");
  if (publicBucketName === privateBucketName) {
    throw new Error("Public and private bucket names must be different.");
  }
  const config = {
    publicBucketName,
    privateBucketName,
    privateBasePath: process.env.GCS_PRIVATE_BASE_PATH || "",
    publicBase: baseUrl(
      process.env.GCS_BASE_URL ||
        "https://storage.googleapis.com/{bucket-name}",
      publicBucketName,
    ),
    privateBase: baseUrl(
      process.env.GCS_PRIVATE_BASE_URL ||
        "https://storage.googleapis.com/{bucket-name}",
      privateBucketName,
    ),
  };
  const client = database();
  await client.connect();
  try {
    const files = await getSensitiveFiles(client);
    const resumes = files.filter((file) => file.purpose === "resume").length;
    const complaints = files.length - resumes;
    const variants = files.reduce(
      (total, file) => total + Object.keys(file.formats || {}).length,
      0,
    );
    console.log(
      "Sensitive records: " +
        resumes +
        " resumes, " +
        complaints +
        " complaint attachments, " +
        variants +
        " generated variants.",
    );
    console.log(
      "Provider counts: " + JSON.stringify(await getProviderCounts(client)),
    );
    if (mode === "dry-run") return;
    const storage = storageClient();
    if (mode === "apply") await apply(client, storage, config, files);
    if (mode === "finalize") await finalize(client, storage, config, files);
  } finally {
    await client.end();
  }
};

if (require.main === module) {
  main().catch((error) => {
    console.error("Private media migration stopped: " + error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  baseUrl,
  objectKeyFromUrl,
  objectUrl,
  privateObjectKey,
  trimSlashes,
};
