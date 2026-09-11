# 🚀 Getting started with Strapi

Strapi comes with a full featured [Command Line Interface](https://docs.strapi.io/dev-docs/cli) (CLI) which lets you scaffold and manage your project in seconds.

### `develop`

Start your Strapi application with autoReload enabled. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-develop)

```
npm run develop
# or
yarn develop
```

### `start`

Start your Strapi application with autoReload disabled. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-start)

```
npm run start
# or
yarn start
```

### `build`

Build your admin panel. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-build)

```
npm run build
# or
yarn build
```

## ⚙️ Deployment

Strapi gives you many possible deployment options for your project including [Strapi Cloud](https://cloud.strapi.io). Browse the [deployment section of the documentation](https://docs.strapi.io/dev-docs/deployment) to find the best solution for your use case.

```
yarn strapi deploy
```

## 📚 Learn more

- [Resource center](https://strapi.io/resource-center) - Strapi resource center.
- [Strapi documentation](https://docs.strapi.io) - Official Strapi documentation.
- [Strapi tutorials](https://strapi.io/tutorials) - List of tutorials made by the core team and the community.
- [Strapi blog](https://strapi.io/blog) - Official Strapi blog containing articles made by the Strapi team and the community.
- [Changelog](https://strapi.io/changelog) - Find out about the Strapi product updates, new features and general improvements.

Feel free to check out the [Strapi GitHub repository](https://github.com/strapi/strapi). Your feedback and contributions are welcome!

## ✨ Community

- [Discord](https://discord.strapi.io) - Come chat with the Strapi community including the core team.
- [Forum](https://forum.strapi.io/) - Place to discuss, ask questions and find answers, show your Strapi project and get feedback or just talk with other Community members.
- [Awesome Strapi](https://github.com/strapi/awesome-strapi) - A curated list of awesome things related to Strapi.

---

<sub>🤫 Psst! [Strapi is hiring](https://strapi.io/careers).</sub>

## IndoThai public and private media

The Upload plugin uses the local `@indothai/private-media` provider. Normal Media
Library uploads continue to use `GCS_BUCKET_NAME` and public URLs. Only requests
made through `POST /api/private-upload` use `GCS_PRIVATE_BUCKET_NAME`.

The private endpoint accepts exactly one multipart `files` value and one purpose:

- `resume`: PDF only, no more than 2,000,000 bytes.
- `complaint`: JPG, JPEG, PNG, GIF, PDF, DOC, DOCX, XLS, XLSX, TXT or CSV, no
  more than 5,000,000 bytes.

It returns only `[{ "id": 123 }]`. Candidate and Complaint creation validates
that this ID belongs to an unused private upload with the matching purpose. The
Public Create for Private Upload is enforced at startup. The same startup rule
removes Public Upload, Find, Find Page, Find One and Delete access from the normal
Upload API. It leaves unrelated permissions unchanged, including the existing
Candidate and Complaint Create choices. Candidate and Complaint public reads,
updates and deletes must remain disabled.

Private objects are never made anonymous. Strapi Content Manager generates a fresh
five-minute signed URL when an administrator with the corresponding content-type
and media-field Read permission views a record. The file remains stored until it is
manually deleted; only the temporary URL expires.
Treat each signed URL as a bearer link: anyone holding it can use it until expiry,
so do not copy it into logs, support tickets or public messages.

Required private settings are:

```dotenv
GCS_PRIVATE_BUCKET_NAME=private-bucket-name
GCS_PRIVATE_BASE_PATH=
GCS_PRIVATE_BASE_URL=https://storage.googleapis.com/{bucket-name}
```

The existing service account is reused. It needs object create/read/delete access to
both applicable buckets and permission to sign private read URLs. Keep the public
bucket publicly readable and do not grant `allUsers` access to the private bucket.

Production still needs restricted CORS, rate limiting, malware scanning, private
data retention rules and cleanup for unattached uploads.

## Investor content ordering

Overview, Disclosure 2015 and Client Relation records have a required integer
`order` field with a default value of `0`. Smaller numbers appear first on the
website. Records with the same value are ordered by Strapi's system-managed
`createdAt` field, newest first; editors should not add or maintain a separate
creation-date field for this purpose.

New records default to `0`. Existing records can remain null after schema
synchronization; assign an explicit order in Content Manager when each record is
next maintained. The website temporarily treats those legacy values as `0`.
Back up the database and restart Strapi after deploying the schema change. The
change does not alter public permissions, Draft & Publish behavior or API paths.

## Shareholder Relation seed

`scripts/seed_shareholder_relation.js` imports the categories, reports and files
defined by `migration_data/shareholder_relation_category.json` and
`migration_data/files/`. Strapi must already be running with its database tables
created. Uploaded files are organized in the root Media Library folder
**Shareholding Relation**. Validate the local migration data without contacting
Strapi first:

Each category's `slug` is written to the Shareholder Relation Category record so
the website can use it as the `shareholder_type` query value. A missing slug in
the migration data is normalized to an empty string.

Each report's `file_path` may be either an HTTP(S) file URL or a filename stored
in `migration_data/files/`. Files may use any type supported by the configured
Strapi Media Library. Remote files are checked with a `HEAD` request and a
positive `Content-Length` when the seed runs, so large files are not downloaded
into the seed process merely to validate their name and size. Each report must
also contain `created_at` in
`YYYY-MM-DD HH:mm:ss` format. The seed interprets it in Asia/Kolkata time and
stores it in `original_created_at`. The migration JSON keeps the source key
`created_at`; the different Strapi field name avoids a collision with the database
column used by Strapi's system-managed `createdAt`. A report with an empty `file_path` is logged by title
and skipped; the rest of the migration continues. File checks and report uploads
run through four asynchronous workers so large migrations do not run one file at
a time or hold every remote file in memory. Remote checks allow up to 60 seconds,
ordinary Strapi requests up to two minutes and server-side remote uploads up to
ten minutes. Only entries with the same title
and the same `file_path` in one category are duplicates and are skipped. The
same title with a different file is imported as a separate report. The source
`file_path` is stored as the Media Library caption so reruns can match each
same-title report to its correct attachment.

After adding the `original_created_at` schema field, restart Strapi before rerunning the
seed. Rerunning backfills the field on matching reports and reuses unchanged
attachments according to the rules above.

Missing local files and remote files that cannot be inspected are logged by
report title and skipped. Strapi upload and record-creation errors remain fatal
because they indicate a backend or permission problem.

URL-based attachments are fetched by Strapi through its authenticated
`POST /upload/actions/upload-from-urls` endpoint and then stored by the configured
upload provider. The seed sends only the source URL through the production
gateway, avoiding request-body limits for large source files. Filename-based
attachments from `migration_data/files/` continue to use multipart uploads. The
seed stores the original URL or filename as the Media Library caption after a
successful upload so reruns retain exact source matching. Non-JSON Strapi or
gateway responses are reported with their endpoint, status and content type.

The upload allowlist includes `text/html` for the legacy regulatory reports that
are stored as HTML documents and `application/zip` for legacy archive reports.
It also includes `application/x-cfb`, the detected container type for legacy
`.xls` and `.doc` files. Other global upload restrictions and the private
resume/complaint validation remain unchanged.

```bash
node scripts/seed_shareholder_relation.js --dry-run
```

Pass Super Admin credentials only through the process environment when applying
the seed:

```bash
STRAPI_ADMIN_EMAIL="----@gmail.com" STRAPI_ADMIN_PASSWORD="-----" STRAPI_URL="http://localhost:1337" node scripts/seed_shareholder_relation.js
```

`STRAPI_URL` defaults to `http://localhost:1337` and can be set to another
HTTP(S) Strapi address. Never add the credentials to `.env` files committed to
Git or to the migration JSON.

The script creates missing records and updates exact name/title matches. It
publishes seeded categories and reports, uploads public files through the Media
Library, reuses an attached file when its filename and size already match, and
enables Public Find/Find One for both shareholder collection types. It preserves
all unrelated Public-role permissions and does not delete records absent from the
fixture. When a changed attachment is replaced, the earlier media record is kept
for manual orphan review instead of being deleted automatically.

Shareholder report titles use Strapi's long-text field so regulatory titles are
stored completely instead of being truncated at 255 characters.

## Financial Report seed

`scripts/seed_financial_reports.js` creates or updates published Financial Report
entries from `migration_data/financial_reports.json`. Reports match by fiscal
year, report type, quarter and the source URL stored in the Media Library caption.
Full Year records use `quarter: null`; Quarter records require an integer from 1
through 4. Remote files are stored in the root **Financial Reports** Media Library
folder. Matching files are reused, while replaced media is retained for manual
orphan review.

Validate the JSON and inspect the remote files without logging in or changing
Strapi:

```bash
npm run seed:financial-reports -- --dry-run
```

Applying the seed requires a running Strapi instance and Super Admin credentials
provided only through the process environment:

```bash
STRAPI_ADMIN_EMAIL="----@gmail.com" STRAPI_ADMIN_PASSWORD="-----" STRAPI_URL="http://localhost:1337" npm run seed:financial-reports
```

Unavailable or empty source files are logged and skipped. Upload or record-save
errors are fatal. The script never deletes existing entries or replaced media.

## RichText++ (MarkDown) editor

The editor source lives in `src/plugins/markdown-table/`, a private npm workspace
maintained with this application. Its demo, tests, and design notes live beside
the component. The application uses one root `package-lock.json`; do not run a
separate install inside the plugin or generate a tarball.

`config/plugins.ts` resolves this local plugin. `src/admin/app.tsx` registers it
for existing Rich text (Markdown) fields: Blog `content`, Overview `description`,
and Opening `description`. Their schemas and stored Markdown strings are preserved.
New fields can also select **RichText++ (MarkDown)** under Content-Type Builder → Custom.

Use Node 24 LTS for local development, builds, and production. With nvm:

```bash
nvm use
```

Install dependencies from this repository's root:

```bash
npm ci
npm run build
npm run develop
```

`npm run build` builds the plugin before the Strapi admin. `npm run dev` and
`npm run develop` also build the plugin before starting Strapi. The generated
`src/plugins/markdown-table/dist/` directory is ignored by Git. Include that
folder in deployment artifacts along with the application build; install build
dependencies before building, even if the final runtime omits development dependencies.

When editing the plugin, run this in another terminal to rebuild it on changes:

```bash
npm run watch:richtext
```

For a standalone editor demo without starting Strapi or connecting to a database:

```bash
npm run demo:richtext
```

The demo runs at http://127.0.0.1:5173. Editor starts with interactive text and
table editing. Use **Headings** for H1–H6, **Table** for the size picker,
**+ Content** to add text, **Raw Markdown** to edit the source, and **Preview**
to read the rendered result.

`npm test` runs the backend tests and plugin unit tests. `npm run typecheck`
checks server, admin, and plugin source. `npm run test:richtext:e2e` runs the
plugin browser tests on a dedicated demo server at port 5174. Install Playwright
Chromium once with `npm exec --workspace strapi-plugin-markdown-table -- playwright install chromium`
if it is not already available.

To restore Strapi's built-in editor for existing Markdown fields, remove the
`registerMarkdownReplacement(app)` call from `src/admin/app.tsx`.

### Docker builds with the local editor

Build from this repository's root so Docker can include both local packages:

```bash
docker build -f Dockerfile -t itsl-strapi:local .
# Alpine alternative:
docker build -f Dockerfile.prod -t itsl-strapi:alpine .
```

Both multi-stage Dockerfiles copy `providers/private-media/` and the editor's
workspace manifest before `npm ci --include=dev`. The existing `npm run build`
command then builds the plugin and Strapi admin, after which development
packages are pruned. Runtime images include the compiled plugin and its remaining
workspace dependencies at `src/plugins/markdown-table/`, keeping npm's local
package links valid. The Alpine image uses `/opt/app` for every stage.

`Dockerfile.single` already copies the complete application before installation
and builds the plugin through the root build command. It keeps build dependencies
in its single-stage image. `.dockerignore` excludes nested `node_modules`, `dist`,
build caches, and browser-test output so local workstation artifacts cannot
replace dependencies or generated files created inside the image.


## Scripts
- Financial reports: `STRAPI_ADMIN_EMAIL="----@gmail.com" STRAPI_ADMIN_PASSWORD="-----" STRAPI_URL="http://localhost:1337" node financial_reports.json
`
- Shareholder relations: `STRAPI_ADMIN_EMAIL="----@gmail.com" STRAPI_ADMIN_PASSWORD="-----" STRAPI_URL="http://localhost:1337" node shareholder_relations.json`
