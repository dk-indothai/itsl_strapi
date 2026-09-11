"use strict";

/**
 * Create or update Financial Report entries from migration data.
 *
 * Use --dry-run to validate the JSON and inspect every remote file without
 * logging in or changing Strapi. Applying the seed requires Super Admin
 * credentials supplied only through the process environment.
 *
 * Records match by year, report type, quarter and the source URL stored in the
 * Media Library caption. Uploaded files live in the root "Financial Reports"
 * folder. Replaced media is retained for manual orphan review.
 */

const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DATA_FILE = path.join(ROOT, "migration_data/financial_reports.json");
const MEDIA_FOLDER_NAME = "Financial Reports";
const FILE_CONCURRENCY = 4;
const FILE_INSPECTION_TIMEOUT_MS = 60_000;
const STRAPI_REQUEST_TIMEOUT_MS = 120_000;
const REMOTE_UPLOAD_TIMEOUT_MS = 600_000;
const REPORT_MODEL = "api::financial-report.financial-report";

function required(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

function reportLabel(report) {
  const period =
    report.report_type === "Quarter"
      ? `Q${report.quarter}`
      : "Full Year";
  return `${report.year} ${period}${report.title ? ` — ${report.title}` : ""}`;
}

function reportKey(report) {
  return `${report.year}\0${report.report_type}\0${report.quarter ?? "full"}`;
}

function validateRemoteUrl(value, name) {
  const source = required(value, name);
  let url;
  try {
    url = new URL(source);
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) URL.`);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error(`${name} must be a valid HTTP(S) URL.`);
  }
  return source;
}

async function readSeedData(dataFile = DATA_FILE, log = console.warn) {
  const json = JSON.parse(await fs.readFile(dataFile, "utf8"));
  const records = json.financial_reports;
  if (!Array.isArray(records)) {
    throw new Error("financial_reports must be an array.");
  }

  const recordKeys = new Set();
  const validRecords = [];
  for (const [index, record] of records.entries()) {
    const name = `Financial report ${index + 1}`;
    if (!Number.isInteger(record.year)) {
      throw new Error(`${name} year must be an integer.`);
    }
    if (!['Quarter', 'Full Year'].includes(record.report_type)) {
      throw new Error(`${name} report_type must be Quarter or Full Year.`);
    }
    if (
      record.report_type === "Quarter" &&
      (!Number.isInteger(record.quarter) ||
        record.quarter < 1 ||
        record.quarter > 4)
    ) {
      throw new Error(`${name} quarter must be an integer from 1 to 4.`);
    }
    if (record.report_type === "Full Year" && record.quarter !== null) {
      throw new Error(`${name} Full Year quarter must be null.`);
    }
    record.title = required(record.title, `${name} title`);
    if (record.file_path == null || record.file_path.trim?.() === "") {
      log(`Skipped report with empty file_path: ${reportLabel(record)}`);
      continue;
    }
    record.file_path = validateRemoteUrl(record.file_path, `${name} file_path`);

    const key = `${reportKey(record)}\0${record.file_path}`;
    if (recordKeys.has(key)) {
      log(`Skipped exact duplicate report: ${reportLabel(record)}`);
      continue;
    }
    recordKeys.add(key);
    validRecords.push(record);
  }
  return validRecords;
}

function fileSizeInKilobytes(byteLength) {
  return Math.round((byteLength / 1000) * 100) / 100;
}

async function inspectRemoteFile(source, fetchImpl = fetch) {
  const url = new URL(source);
  const fileName = decodeURIComponent(path.posix.basename(url.pathname));
  if (!fileName || path.basename(fileName) !== fileName) {
    throw new Error(`${source} must point to a named file.`);
  }

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
  return { fileName, size: fileSizeInKilobytes(byteLength) };
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

async function validateReportFiles(
  reports,
  fetchImpl = fetch,
  log = console.warn,
) {
  let unavailable = 0;
  await runInParallel(reports, async (report) => {
    try {
      await inspectRemoteFile(report.file_path, fetchImpl);
    } catch (error) {
      unavailable += 1;
      log(`Unavailable file for ${reportLabel(report)}: ${error.message}`);
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

async function listAll(api) {
  const records = [];
  for (let page = 1; ; page += 1) {
    const query = new URLSearchParams({
      page: String(page),
      pageSize: "100",
      status: "draft",
      sort: "year:DESC",
    });
    const result = await api.request(
      `/content-manager/collection-types/${encodeURIComponent(REPORT_MODEL)}?${query}`,
    );
    if (!Array.isArray(result?.results) || !result?.pagination) {
      throw new Error("Strapi returned an invalid Financial Report list.");
    }
    records.push(...result.results);
    if (page >= result.pagination.pageCount) return records;
  }
}

async function saveAndPublish(api, documentId, data) {
  const id = documentId ? `/${encodeURIComponent(documentId)}` : "";
  const result = await api.request(
    `/content-manager/collection-types/${encodeURIComponent(REPORT_MODEL)}${id}/actions/publish`,
    { method: "POST", json: data },
  );
  if (!result?.data?.documentId) {
    throw new Error("Strapi did not publish the Financial Report.");
  }
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
    throw new Error("Strapi did not create the Financial Reports media folder.");
  }
  return created.data;
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
    try {
      events.push({ event, data: JSON.parse(dataLines.join("\n")) });
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

function buildReportData(report, fileId) {
  return {
    year: report.year,
    report_type: report.report_type,
    quarter: report.report_type === "Quarter" ? report.quarter : null,
    file: fileId,
  };
}

function findSavedReport(
  savedReports,
  report,
  sourceFileName,
  claimedReports,
  samePeriodCount,
) {
  const matches = savedReports.filter(
    (item) =>
      reportKey(item) === reportKey(report) &&
      !claimedReports.has(item.documentId),
  );
  return (
    matches.find((item) => item.file?.caption === report.file_path) ||
    matches.find(
      (item) => !item.file?.caption && item.file?.name === sourceFileName,
    ) ||
    (samePeriodCount === 1 && matches.length === 1 ? matches[0] : undefined)
  );
}

async function seed({ reports, api, log = console.log }) {
  const savedReports = await listAll(api);
  const mediaFolder = await getOrCreateMediaFolder(api);
  log(`Using Media Library folder: ${MEDIA_FOLDER_NAME}`);
  const claimedReports = new Set();
  let uploaded = 0;
  let reused = 0;
  let unavailable = 0;

  await runInParallel(reports, async (report) => {
    let sourceFile;
    try {
      sourceFile = await inspectRemoteFile(report.file_path);
    } catch (error) {
      unavailable += 1;
      log(`Skipped unavailable file for ${reportLabel(report)}: ${error.message}`);
      return;
    }

    const samePeriodCount = reports.filter(
      (item) => reportKey(item) === reportKey(report),
    ).length;
    const existingReport = findSavedReport(
      savedReports,
      report,
      sourceFile.fileName,
      claimedReports,
      samePeriodCount,
    );
    if (existingReport) claimedReports.add(existingReport.documentId);

    let file = existingReport?.file;
    const sourceMatches =
      samePeriodCount === 1 || file?.caption === report.file_path;
    if (
      sourceMatches &&
      file?.name === sourceFile.fileName &&
      Number(file.size) === sourceFile.size &&
      file.folder === undefined
    ) {
      file = await api.request(`/upload/files/${file.id}`);
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
        file = await uploadRemoteFile(api, report.file_path, mediaFolder.id);
      } catch (error) {
        throw new Error(`${reportLabel(report)}: ${error.message}`);
      }
      uploaded += 1;
      if (existingReport?.file?.id) {
        log(`Retained replaced media ${existingReport.file.id} for manual review.`);
      }
    }

    try {
      await saveAndPublish(
        api,
        existingReport?.documentId,
        buildReportData(report, file.id),
      );
    } catch (error) {
      throw new Error(`${reportLabel(report)}: ${error.message}`);
    }
    log(`${existingReport ? "Updated" : "Created"} report: ${reportLabel(report)}`);
  });

  return { unavailable, uploaded, reused };
}

async function main() {
  const reports = await readSeedData();
  console.log(`Found ${reports.length} financial reports with files.`);

  if (process.argv.includes("--dry-run")) {
    const unavailable = await validateReportFiles(reports);
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
  const result = await seed({ reports, api });
  console.log(
    `Seed complete. ${result.uploaded} files uploaded, ${result.reused} reused, and ${result.unavailable} unavailable files skipped.`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Financial Report seed failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  MEDIA_FOLDER_NAME,
  REPORT_MODEL,
  buildReportData,
  createApi,
  findSavedReport,
  getOrCreateMediaFolder,
  inspectRemoteFile,
  listAll,
  parseServerSentEvents,
  readSeedData,
  reportKey,
  runInParallel,
  saveAndPublish,
  seed,
  uploadRemoteFile,
  validateReportFiles,
};
