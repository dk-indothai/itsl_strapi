"use strict";

/**
 * Seed Shareholder Relation categories, reports and files into Strapi.
 *
 * Prerequisites:
 * - Start Strapi first so its database tables exist.
 * - Pass STRAPI_ADMIN_EMAIL and STRAPI_ADMIN_PASSWORD at runtime.
 * - STRAPI_URL is optional and defaults to http://localhost:1337.
 * - Never store administrator credentials in this file or the migration JSON.
 *
 * Migration data:
 * - Reads migration_data/shareholder_relation_category.json.
 * - file_path accepts an HTTP(S) URL or a filename from migration_data/files/.
 * - File types must be permitted by Strapi's Media Library configuration.
 * - Empty file_path entries are logged by title and skipped.
 * - Unavailable, empty or timed-out source files are logged and skipped.
 * - created_at is required in YYYY-MM-DD HH:mm:ss format and is interpreted
 *   as an Asia/Kolkata timestamp before being stored as original_created_at.
 * - Only an exact duplicate title + file_path pair is logged and skipped.
 * - The same title with a different file_path is seeded as a separate report.
 *
 * File processing:
 * - Uses four asynchronous workers so checks/uploads run in parallel without
 *   loading every source file into memory at once.
 * - Remote files are checked with HEAD and are fetched directly by Strapi when
 *   an upload is needed, avoiding production request-body limits.
 * - Remote checks time out after 60 seconds and server-side URL uploads after
 *   ten minutes.
 * - Strapi requests time out after 120 seconds.
 * - Media is stored in the root "Shareholding Relation" Media Library folder,
 *   which is created when missing.
 *
 * Rerunning:
 * - Categories match by exact name.
 * - Reports match by title, category and source file. The source file_path is
 *   stored in the Media Library caption so same-title reports remain distinct.
 * - Remote source headers are checked again to determine filename and size.
 * - Attached media is reused only when its filename, size and folder match.
 * - Missing, changed or misplaced attachments are uploaded again.
 * - Replaced media is retained for manual orphan review and is not deleted.
 * - Records absent from the migration JSON are not deleted.
 * - Public Find and Find One permissions are merged into the existing Public
 *   role without removing unrelated permissions.
 *
 * Failure behavior:
 * - Completed work remains intact after a later failure, so rerunning continues
 *   from records already stored in Strapi.
 * - Upload and record-creation failures are fatal because they indicate a
 *   Strapi configuration, permission or storage problem.
 * - If an upload finishes but its response times out, an unattached media record
 *   may remain and a rerun may upload that source again.
 *
 * Dry run:
 * - Use --dry-run to validate migration data and source availability without
 *   logging in or changing Strapi.
 */

const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DATA_FILE = path.join(
  ROOT,
  "migration_data/shareholder_relation_category.json",
);
const FILES_DIR = path.join(ROOT, "migration_data/files");
const MEDIA_FOLDER_NAME = "Shareholding Relation";
const FILE_CONCURRENCY = 4;
const FILE_INSPECTION_TIMEOUT_MS = 60_000;
const STRAPI_REQUEST_TIMEOUT_MS = 120_000;
const REMOTE_UPLOAD_TIMEOUT_MS = 600_000;

const CATEGORY =
  "api::shareholder-relation-category.shareholder-relation-category";
const RELATION = "api::shareholder-relation.shareholder-relation";
const PUBLIC_ACTIONS = [
  `${CATEGORY}.find`,
  `${CATEGORY}.findOne`,
  `${RELATION}.find`,
  `${RELATION}.findOne`,
];

function required(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

function normalizeCreatedAt(value, name) {
  const input = required(value, name);
  const match = input.match(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/,
  );
  if (!match) throw new Error(`${name} must use YYYY-MM-DD HH:mm:ss.`);

  const [, year, month, day, hour, minute, second] = match.map(Number);
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute ||
    check.getUTCSeconds() !== second
  ) {
    throw new Error(`${name} is not a valid date and time.`);
  }

  return new Date(`${input.replace(" ", "T")}+05:30`).toISOString();
}

function isRemoteSource(source) {
  return /^https?:\/\//i.test(source);
}

function fileSizeInKilobytes(byteLength) {
  return Math.round((byteLength / 1000) * 100) / 100;
}

function validateFileName(fileName, source) {
  if (!fileName || path.basename(fileName) !== fileName) {
    throw new Error(`${source} must point to a named file.`);
  }
  return fileName;
}

async function loadFile(source, filesDir = FILES_DIR) {
  if (isRemoteSource(source) || path.basename(source) !== source) {
    throw new Error(`${source} must be a filename from migration_data/files.`);
  }

  const fileName = validateFileName(source, source);
  const bytes = await fs.readFile(path.join(filesDir, source));

  if (!bytes.length) throw new Error(`${source} is empty.`);

  return {
    bytes,
    fileName,
    size: fileSizeInKilobytes(bytes.length),
  };
}

async function inspectFile(source, filesDir = FILES_DIR, fetchImpl = fetch) {
  if (!isRemoteSource(source)) return loadFile(source, filesDir);

  const url = new URL(source);
  const fileName = validateFileName(
    decodeURIComponent(path.posix.basename(url.pathname)),
    source,
  );
  let response;
  try {
    response = await fetchImpl(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(FILE_INSPECTION_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`Could not inspect ${source}: ${error.message}`);
  }
  if (!response.ok) {
    throw new Error(`Could not inspect ${source} (${response.status}).`);
  }

  const byteLength = Number(response.headers.get("content-length"));
  if (!Number.isSafeInteger(byteLength) || byteLength <= 0) {
    throw new Error(`${source} did not provide a positive Content-Length.`);
  }

  return {
    fileName,
    size: fileSizeInKilobytes(byteLength),
  };
}

async function runInParallel(items, worker) {
  let nextIndex = 0;
  let failure;
  const workers = Array.from(
    { length: Math.min(FILE_CONCURRENCY, items.length) },
    async () => {
      while (!failure && nextIndex < items.length) {
        const item = items[nextIndex++];
        try {
          await worker(item);
        } catch (error) {
          failure = error;
        }
      }
    },
  );
  await Promise.all(workers);
  if (failure) throw failure;
}

async function readSeedData(dataFile = DATA_FILE, log = console.warn) {
  const json = JSON.parse(await fs.readFile(dataFile, "utf8"));
  const categories = json.shareholder_relation_category;
  if (!Array.isArray(categories)) {
    throw new Error("shareholder_relation_category must be an array.");
  }

  const categoryNames = new Set();
  for (const [categoryIndex, category] of categories.entries()) {
    category.name = required(
      category.name,
      `Category ${categoryIndex + 1} name`,
    );
    if (categoryNames.has(category.name)) {
      throw new Error(`Duplicate category: ${category.name}`);
    }
    categoryNames.add(category.name);

    if (!Array.isArray(category.shareholder_relation)) {
      throw new Error(`${category.name} must contain shareholder_relation.`);
    }

    const reports = new Set();
    const reportsWithFiles = [];
    for (const report of category.shareholder_relation) {
      report.title = required(report.title, `${category.name} report title`);
      report.created_at = normalizeCreatedAt(
        report.created_at,
        `${report.title} created_at`,
      );
      if (report.file_path == null || report.file_path.trim?.() === "") {
        log(`Skipped report with empty file_path: ${report.title}`);
        continue;
      }
      report.file_path = required(
        report.file_path,
        `${report.title} file_path`,
      );
      const reportKey = `${report.title}\0${report.file_path}`;
      if (reports.has(reportKey)) {
        log(
          `Skipped exact duplicate report in ${category.name}: ${report.title} (${report.file_path})`,
        );
        continue;
      }
      reports.add(reportKey);

      reportsWithFiles.push(report);
    }
    category.shareholder_relation = reportsWithFiles;
  }
  return categories;
}

async function validateReportFiles(
  categories,
  fetchImpl = fetch,
  log = console.warn,
) {
  const reports = categories.flatMap(
    (category) => category.shareholder_relation,
  );
  let unavailable = 0;
  await runInParallel(reports, async (report) => {
    try {
      await inspectFile(report.file_path, FILES_DIR, fetchImpl);
    } catch (error) {
      unavailable += 1;
      log(`Unavailable file for ${report.title}: ${error.message}`);
    }
  });
  return unavailable;
}

function createApi(baseUrl, fetchImpl = fetch) {
  const base = new URL(baseUrl || "http://localhost:1337");
  if (!["http:", "https:"].includes(base.protocol)) {
    throw new Error("STRAPI_URL must use HTTP or HTTPS.");
  }

  let token = "";
  async function request(endpoint, options = {}) {
    const headers = new Headers(options.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (options.json) headers.set("Content-Type", "application/json");

    let response;
    const timeoutMs = options.timeoutMs || STRAPI_REQUEST_TIMEOUT_MS;
    try {
      response = await fetchImpl(new URL(endpoint, base), {
        method: options.method || "GET",
        headers,
        body: options.json ? JSON.stringify(options.json) : options.body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new Error(`${endpoint} request failed: ${error.message}`);
    }
    const text = await response.text();
    let body = text || null;
    if (text && options.responseType !== "text") {
      try {
        body = JSON.parse(text);
      } catch {
        const contentType =
          response.headers.get("content-type") || "unknown content type";
        const preview = text.replace(/\s+/g, " ").trim().slice(0, 160);
        throw new Error(
          `${endpoint} failed (${response.status}): expected JSON but received ${contentType}${preview ? `: ${preview}` : ""}`,
        );
      }
    }
    if (!response.ok) {
      const responseMessage =
        body && typeof body === "object"
          ? body.error?.message
          : String(body || "")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 160);
      throw new Error(
        `${endpoint} failed (${response.status}): ${responseMessage || response.statusText}`,
      );
    }
    return body;
  }

  return {
    request,
    async login(email, password) {
      const result = await request("/admin/login", {
        method: "POST",
        json: { email, password },
      });
      token = result?.data?.accessToken || result?.data?.token;
      if (!token) throw new Error("Strapi did not return an admin token.");
    },
  };
}

async function listAll(api, model, sort) {
  const records = [];
  for (let page = 1; ; page += 1) {
    const query = new URLSearchParams({
      page: String(page),
      pageSize: "100",
      status: "draft",
      sort: `${sort}:ASC`,
    });
    const result = await api.request(
      `/content-manager/collection-types/${encodeURIComponent(model)}?${query}`,
    );
    records.push(...result.results);
    if (page >= result.pagination.pageCount) return records;
  }
}

async function saveAndPublish(api, model, documentId, data) {
  const id = documentId ? `/${encodeURIComponent(documentId)}` : "";
  const result = await api.request(
    `/content-manager/collection-types/${encodeURIComponent(model)}${id}/actions/publish`,
    { method: "POST", json: data },
  );
  if (!result?.data?.documentId)
    throw new Error(`Strapi did not publish ${model}.`);
  return result.data;
}

async function getOrCreateMediaFolder(api) {
  const result = await api.request(
    "/upload/folders?sort=name%3AASC&populate%5Bparent%5D=true",
  );
  if (!Array.isArray(result?.data)) {
    throw new Error("Strapi did not return the Media Library folders.");
  }

  const existing = result.data.find(
    (folder) => folder.name === MEDIA_FOLDER_NAME && !folder.parent,
  );
  if (existing) return existing;

  const created = await api.request("/upload/folders", {
    method: "POST",
    json: { name: MEDIA_FOLDER_NAME, parent: null },
  });
  if (!Number.isInteger(created?.data?.id)) {
    throw new Error("Strapi did not create the Media Library folder.");
  }
  return created.data;
}

async function uploadFile(api, file, folderId, source) {
  const form = new FormData();
  form.append(
    "files",
    new Blob([file.bytes], { type: "application/octet-stream" }),
    file.fileName,
  );
  form.append(
    "fileInfo",
    JSON.stringify({
      name: file.fileName,
      alternativeText: null,
      caption: source,
      folder: folderId,
    }),
  );

  const uploadedFile = await api.request("/upload/files", {
    method: "POST",
    body: form,
  });
  if (!Number.isInteger(uploadedFile?.id))
    throw new Error("File upload failed.");
  return uploadedFile;
}

function parseServerSentEvents(text) {
  const events = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    let event;
    const dataLines = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (!event || !dataLines.length) continue;

    const dataText = dataLines.join("\n");
    try {
      events.push({ event, data: JSON.parse(dataText) });
    } catch {
      throw new Error(`Strapi returned invalid ${event} event data.`);
    }
  }
  return events;
}

async function uploadRemoteFile(api, source, folderId) {
  const responseText = await api.request("/upload/actions/upload-from-urls", {
    method: "POST",
    json: { urls: [source], folderId },
    responseType: "text",
    timeoutMs: REMOTE_UPLOAD_TIMEOUT_MS,
  });
  const events = parseServerSentEvents(responseText || "");
  const failed = events.find((item) => item.event === "file:error");
  if (failed) {
    throw new Error(failed.data?.message || "Remote file upload failed.");
  }

  const completed = events.find((item) => item.event === "file:complete");
  const uploadedFile = completed?.data?.file;
  if (!Number.isInteger(uploadedFile?.id)) {
    throw new Error("Strapi did not complete the remote file upload.");
  }

  const form = new FormData();
  form.append(
    "fileInfo",
    JSON.stringify({
      name: uploadedFile.name,
      alternativeText: null,
      caption: source,
      folder: folderId,
    }),
  );
  const updatedFile = await api.request(`/upload/files/${uploadedFile.id}`, {
    method: "PUT",
    body: form,
  });
  if (!Number.isInteger(updatedFile?.id)) {
    throw new Error("Strapi did not save the remote file metadata.");
  }
  return updatedFile;
}

function buildReportData(report, fileId, categoryDocumentId) {
  return {
    title: report.title,
    original_created_at: report.created_at,
    file: fileId,
    shareholder_relation_category: {
      connect: [
        {
          id: categoryDocumentId,
          documentId: categoryDocumentId,
        },
      ],
      disconnect: [],
    },
  };
}

function findSavedReport(
  savedReports,
  report,
  categoryDocumentId,
  sourceFileName,
  claimedReports,
  sameTitleCount,
) {
  const matches = savedReports.filter(
    (item) =>
      item.title === report.title &&
      item.shareholder_relation_category?.documentId === categoryDocumentId &&
      !claimedReports.has(item.documentId),
  );
  return (
    matches.find((item) => item.file?.caption === report.file_path) ||
    matches.find(
      (item) => !item.file?.caption && item.file?.name === sourceFileName,
    ) ||
    (sameTitleCount === 1 && matches.length === 1 ? matches[0] : undefined)
  );
}

function setPublicAction(permissions, action) {
  const [type, controller, method] = action.split(".");
  permissions[type] ||= { controllers: {} };
  permissions[type].controllers ||= {};
  permissions[type].controllers[controller] ||= {};
  permissions[type].controllers[controller][method] = {
    enabled: true,
    policy: "",
  };
}

async function enablePublicReads(api) {
  const roleList = await api.request("/users-permissions/roles");
  const publicRole = roleList.roles.find((role) => role.type === "public");
  if (!publicRole) throw new Error("Public role not found.");

  const { role } = await api.request(
    `/users-permissions/roles/${publicRole.id}`,
  );
  for (const action of PUBLIC_ACTIONS)
    setPublicAction(role.permissions, action);
  await api.request(`/users-permissions/roles/${publicRole.id}`, {
    method: "PUT",
    json: {
      name: role.name,
      description: role.description,
      permissions: role.permissions,
    },
  });
}

async function seed({ categories, api, log = console.log }) {
  const savedCategories = await listAll(api, CATEGORY, "name");
  const savedReports = await listAll(api, RELATION, "title");
  const mediaFolder = await getOrCreateMediaFolder(api);
  log(`Using Media Library folder: ${MEDIA_FOLDER_NAME}`);
  let uploaded = 0;
  let reused = 0;
  let unavailable = 0;

  for (const input of categories) {
    const existingCategory = savedCategories.find(
      (category) => category.name === input.name,
    );
    const category = await saveAndPublish(
      api,
      CATEGORY,
      existingCategory?.documentId,
      { name: input.name },
    );
    log(`${existingCategory ? "Updated" : "Created"} category: ${input.name}`);

    const claimedReports = new Set();
    await runInParallel(input.shareholder_relation, async (report) => {
      let sourceFile;
      try {
        sourceFile = await inspectFile(report.file_path);
      } catch (error) {
        unavailable += 1;
        log(`Skipped unavailable file for ${report.title}: ${error.message}`);
        return;
      }

      const sameTitleCount = input.shareholder_relation.filter(
        (item) => item.title === report.title,
      ).length;
      const existingReport = findSavedReport(
        savedReports,
        report,
        category.documentId,
        sourceFile.fileName,
        claimedReports,
        sameTitleCount,
      );
      if (existingReport) claimedReports.add(existingReport.documentId);

      let file = existingReport?.file;
      const sourceMatches =
        sameTitleCount === 1 || file?.caption === report.file_path;
      if (
        sourceMatches &&
        file?.name === sourceFile.fileName &&
        Number(file.size) === sourceFile.size
      ) {
        if (file.folder === undefined) {
          file = await api.request(`/upload/files/${file.id}`);
        }
      }

      const fileFolderId =
        typeof file?.folder === "object" ? file.folder?.id : file?.folder;
      if (
        sourceMatches &&
        file?.name === sourceFile.fileName &&
        Number(file.size) === sourceFile.size &&
        Number(fileFolderId) === mediaFolder.id
      ) {
        reused += 1;
      } else {
        try {
          file = isRemoteSource(report.file_path)
            ? await uploadRemoteFile(api, report.file_path, mediaFolder.id)
            : await uploadFile(
                api,
                sourceFile,
                mediaFolder.id,
                report.file_path,
              );
        } catch (error) {
          throw new Error(`${report.title}: ${error.message}`);
        }
        uploaded += 1;
        if (existingReport?.file?.id) {
          log(
            `Retained replaced media ${existingReport.file.id} for manual review.`,
          );
        }
      }

      try {
        await saveAndPublish(
          api,
          RELATION,
          existingReport?.documentId,
          buildReportData(report, file.id, category.documentId),
        );
      } catch (error) {
        throw new Error(`${report.title}: ${error.message}`);
      }
      log(`${existingReport ? "Updated" : "Created"} report: ${report.title}`);
    });
  }

  await enablePublicReads(api);
  return { unavailable, uploaded, reused };
}

async function main() {
  const categories = await readSeedData();
  const reportCount = categories.reduce(
    (total, category) => total + category.shareholder_relation.length,
    0,
  );
  const categoryLabel = categories.length === 1 ? "category" : "categories";
  console.log(
    `Found ${categories.length} ${categoryLabel} and ${reportCount} reports.`,
  );

  if (process.argv.includes("--dry-run")) {
    const unavailable = await validateReportFiles(categories);
    console.log(
      `Dry run complete. ${unavailable} unavailable files found; Strapi was not changed.`,
    );
    return;
  }

  const email = required(process.env.STRAPI_ADMIN_EMAIL, "STRAPI_ADMIN_EMAIL");
  const password = required(
    process.env.STRAPI_ADMIN_PASSWORD,
    "STRAPI_ADMIN_PASSWORD",
  );
  const api = createApi(process.env.STRAPI_URL || "http://localhost:1337");
  await api.login(email, password);

  const result = await seed({ categories, api });
  console.log(
    `Seed complete. ${result.uploaded} files uploaded, ${result.reused} reused, and ${result.unavailable} unavailable files skipped.`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Shareholder seed failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  MEDIA_FOLDER_NAME,
  PUBLIC_ACTIONS,
  buildReportData,
  createApi,
  findSavedReport,
  getOrCreateMediaFolder,
  inspectFile,
  isRemoteSource,
  loadFile,
  normalizeCreatedAt,
  parseServerSentEvents,
  readSeedData,
  runInParallel,
  seed,
  setPublicAction,
  uploadFile,
  uploadRemoteFile,
  validateReportFiles,
};
