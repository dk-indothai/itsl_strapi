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

### Existing media migration

The migration is deliberately staged:

```bash
npm run migrate:private-media -- dry-run
npm run migrate:private-media -- apply
npm run migrate:private-media -- finalize --confirm-delete-public-copies
```

Run `apply` only after taking a database backup. It copies and verifies private
objects, then updates Strapi records; it does not delete public sources. Verify
Candidate/Complaint access with a limited administrator and verify public software
downloads before `finalize`. Finalize verifies each private destination again and
then removes only the recorded public source objects.

Do not restart a deployed Strapi instance with the dual provider and then delete or
replace old Media Library records before `apply` has updated their provider name.
The old rows still contain usable public URLs, but provider-owned deletion is safe
only after the staged database update.

The current dry run reports 2 unique resume files, 1 unique complaint attachment
and 2 generated variants. These are referenced by 4 Candidate and 2 Complaint
draft/published relations, which is why relation counts are higher than media-file
counts.

Production still needs restricted CORS, rate limiting, malware scanning, private
data retention rules and cleanup for unattached uploads.

## Shareholder Relation seed

`scripts/seed_shareholder_relation.js` imports the categories, reports and PDFs
defined by `migration_data/shareholder_relation_category.json` and
`migration_data/files/`. Strapi must already be running with its database tables
created. Uploaded PDFs are organized in the root Media Library folder
**Shareholding Relation**. Validate the local migration data without contacting
Strapi first:

Each report's `file_path` may be either a PDF URL or a filename stored in
`migration_data/files/`. Remote PDFs are downloaded and validated when the seed
runs.

```bash
node scripts/seed_shareholder_relation.js --dry-run
```

Pass Super Admin credentials only through the process environment when applying
the seed:

```bash
STRAPI_ADMIN_EMAIL='admin@example.com' \
STRAPI_ADMIN_PASSWORD='runtime-secret' \
node scripts/seed_shareholder_relation.js
```

`STRAPI_URL` defaults to `http://localhost:1337` and can be set to another
HTTP(S) Strapi address. Never add the credentials to `.env` files committed to
Git or to the migration JSON.

The script creates missing records and updates exact name/title matches. It
publishes seeded categories and reports, uploads public PDFs through the Media
Library, reuses an attached file when its filename and size already match, and
enables Public Find/Find One for both shareholder collection types. It preserves
all unrelated Public-role permissions and does not delete records absent from the
fixture. When a changed attachment is replaced, the earlier media record is kept
for manual orphan review instead of being deleted automatically.
