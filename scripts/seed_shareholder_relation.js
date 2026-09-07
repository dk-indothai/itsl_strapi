"use strict";

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
const FILE_DOWNLOAD_TIMEOUT_MS = 60_000;
const STRAPI_REQUEST_TIMEOUT_MS = 120_000;

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

async function loadFile(source, filesDir = FILES_DIR, fetchImpl = fetch) {
  let fileName;
  let bytes;

  if (/^https?:\/\//i.test(source)) {
    const url = new URL(source);
    fileName = decodeURIComponent(path.posix.basename(url.pathname));
    let response;
    try {
      response = await fetchImpl(url, {
        signal: AbortSignal.timeout(FILE_DOWNLOAD_TIMEOUT_MS),
      });
    } catch (error) {
      throw new Error(`Could not download ${source}: ${error.message}`);
    }
    if (!response.ok) {
      throw new Error(`Could not download ${source} (${response.status}).`);
    }
    bytes = Buffer.from(await response.arrayBuffer());
  } else {
    if (path.basename(source) !== source) {
      throw new Error(`${source} must be a filename from migration_data/files.`);
    }
    fileName = source;
    bytes = await fs.readFile(path.join(filesDir, source));
  }

  if (!fileName || path.basename(fileName) !== fileName) {
    throw new Error(`${source} must point to a named file.`);
  }
  if (!bytes.length) throw new Error(`${source} is empty.`);

  return {
    bytes,
    fileName,
    size: Math.round((bytes.length / 1000) * 100) / 100,
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
    category.name = required(category.name, `Category ${categoryIndex + 1} name`);
    if (categoryNames.has(category.name)) {
      throw new Error(`Duplicate category: ${category.name}`);
    }
    categoryNames.add(category.name);

    if (!Array.isArray(category.shareholder_relation)) {
      throw new Error(`${category.name} must contain shareholder_relation.`);
    }

    const titles = new Set();
    const reportsWithFiles = [];
    for (const report of category.shareholder_relation) {
      report.title = required(report.title, `${category.name} report title`);
      if (report.file_path == null || report.file_path.trim?.() === "") {
        log(`Skipped report with empty file_path: ${report.title}`);
        continue;
      }
      if (titles.has(report.title)) {
        log(`Skipped duplicate report in ${category.name}: ${report.title}`);
        continue;
      }
      titles.add(report.title);

      report.file_path = required(report.file_path, `${report.title} file_path`);
      reportsWithFiles.push(report);
    }
    category.shareholder_relation = reportsWithFiles;
  }
  return categories;
}

async function validateReportFiles(categories, fetchImpl = fetch) {
  const reports = categories.flatMap((category) => category.shareholder_relation);
  await runInParallel(reports, async (report) => {
    try {
      await loadFile(report.file_path, FILES_DIR, fetchImpl);
    } catch (error) {
      throw new Error(`${report.title}: ${error.message}`);
    }
  });
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
    try {
      response = await fetchImpl(new URL(endpoint, base), {
        method: options.method || "GET",
        headers,
        body: options.json ? JSON.stringify(options.json) : options.body,
        signal: AbortSignal.timeout(STRAPI_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new Error(`${endpoint} request failed: ${error.message}`);
    }
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(
        `${endpoint} failed (${response.status}): ${body?.error?.message || response.statusText}`,
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
  if (!result?.data?.documentId) throw new Error(`Strapi did not publish ${model}.`);
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

async function uploadFile(api, file, folderId) {
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
      caption: null,
      folder: folderId,
    }),
  );

  const uploadedFile = await api.request("/upload/files", {
    method: "POST",
    body: form,
  });
  if (!Number.isInteger(uploadedFile?.id)) throw new Error("File upload failed.");
  return uploadedFile;
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

  const { role } = await api.request(`/users-permissions/roles/${publicRole.id}`);
  for (const action of PUBLIC_ACTIONS) setPublicAction(role.permissions, action);
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

    await runInParallel(input.shareholder_relation, async (report) => {
      let sourceFile;
      try {
        sourceFile = await loadFile(report.file_path);
      } catch (error) {
        throw new Error(`${report.title}: ${error.message}`);
      }

      const existingReport = savedReports.find(
        (item) =>
          item.title === report.title &&
          item.shareholder_relation_category?.documentId === category.documentId,
      );

      let file = existingReport?.file;
      if (
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
        file?.name === sourceFile.fileName &&
        Number(file.size) === sourceFile.size &&
        Number(fileFolderId) === mediaFolder.id
      ) {
        reused += 1;
      } else {
        try {
          file = await uploadFile(api, sourceFile, mediaFolder.id);
        } catch (error) {
          throw new Error(`${report.title}: ${error.message}`);
        }
        uploaded += 1;
        if (existingReport?.file?.id) {
          log(`Retained replaced media ${existingReport.file.id} for manual review.`);
        }
      }

      try {
        await saveAndPublish(api, RELATION, existingReport?.documentId, {
          title: report.title,
          file: file.id,
          shareholder_relation_category: {
            connect: [
              {
                id: category.documentId,
                documentId: category.documentId,
              },
            ],
            disconnect: [],
          },
        });
      } catch (error) {
        throw new Error(`${report.title}: ${error.message}`);
      }
      log(`${existingReport ? "Updated" : "Created"} report: ${report.title}`);
    });
  }

  await enablePublicReads(api);
  return { uploaded, reused };
}

async function main() {
  const categories = await readSeedData();
  const reportCount = categories.reduce(
    (total, category) => total + category.shareholder_relation.length,
    0,
  );
  const categoryLabel = categories.length === 1 ? "category" : "categories";
  console.log(`Found ${categories.length} ${categoryLabel} and ${reportCount} reports.`);

  if (process.argv.includes("--dry-run")) {
    await validateReportFiles(categories);
    console.log("Dry run complete. Strapi was not changed.");
    return;
  }

  const email = required(process.env.STRAPI_ADMIN_EMAIL, "STRAPI_ADMIN_EMAIL");
  const password = required(process.env.STRAPI_ADMIN_PASSWORD, "STRAPI_ADMIN_PASSWORD");
  const api = createApi(process.env.STRAPI_URL || "http://localhost:1337");
  await api.login(email, password);

  const result = await seed({ categories, api });
  console.log(
    `Seed complete. ${result.uploaded} files uploaded and ${result.reused} reused.`,
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
  createApi,
  getOrCreateMediaFolder,
  loadFile,
  readSeedData,
  runInParallel,
  seed,
  setPublicAction,
  uploadFile,
  validateReportFiles,
};
