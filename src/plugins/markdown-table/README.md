# RichText++ (MarkDown)

The IndoThai Strapi application's private Markdown editor. This directory is the
source of truth; it is an npm workspace, not a published package or vendored tarball.

## Development

Run commands from the Strapi repository root:

```bash
npm ci
npm run build:richtext
npm run develop
```

The app's `build`, `dev`, and `develop` commands build the plugin automatically.
For automatic rebuilds while changing this plugin's code, keep
`npm run watch:richtext` running in another terminal. Generated files under
`dist/` are ignored by Git and must be included in the deployed application.
The server and admin entry points are built by `tsup.config.ts`; TypeScript reads
workspace source directly, so type checks work before a build.

Use `npm run demo:richtext` to run the component demo on port 5173 without Strapi,
a database, or credentials. Demo saves are held in memory and reset on refresh.
Use Node 24 LTS to match the application runtime.

## Verification

```bash
npm run typecheck
npm test
npm run test:richtext:e2e
```

The root test command includes this plugin's unit tests. Browser tests launch a
separate demo server on port 5174, so they never reuse a stale demo from another
checkout. If Chromium is missing, install it once:

```bash
npm exec --workspace strapi-plugin-markdown-table -- playwright install chromium
```

Formatting checks can be run with
`npm run format:check --workspace strapi-plugin-markdown-table`.

## Editor behavior

- Editor defaults to click-to-edit text and inline table cells.
- Text blocks have no individual borders. **+ Content** adds a block.
- The **Headings** dropdown offers H1–H6 and replaces existing heading markers.
- **Raw Markdown** toggles the complete source inside Editor.
- **Preview** is a separate read-only view with GFM rendering and raw HTML disabled.
- **Table** opens a compact size picker with pointer and keyboard support.
- Tables support row/column insertion and removal, alignment, undo, and redo.
- Formatting includes bold, italic, strikethrough, lists, quotes, links, image URLs, and code.
- Fields respect host validation, required/disabled states, and light/dark themes.

Text and cell drafts commit on blur. Escape cancels an uncommitted edit.
The active text input shows inline Markdown syntax; this is a lightweight block
editor using the existing Markdown parser and renderer. Stored content stays
plain Markdown. GFM tables have one header row, at most 20 columns and 100 data
rows, and do not support merged cells or multiline blocks inside cells. Complex
or oversized tables remain editable through Raw Markdown.

## Strapi integration

The host's `config/plugins.ts` resolves this directory and enables the plugin.
`src/admin/app.tsx` calls `registerMarkdownReplacement(app)` to use this editor
for existing Rich text (Markdown) fields, preserving their schemas and values.
The plugin also registers a **RichText++ (MarkDown)** custom field backed by text.

The internal plugin ID remains `markdown-table` and the custom field UID remains
`plugin::markdown-table.markdown`. Host forms own saving, publishing, permissions,
validation, and dirty-navigation handling. This plugin adds no persistence API.
The public input ref exposes `focus()` for host validation and autofocus.

Strapi owns the theme and locale providers. Messages use `markdown-table.*` keys
with English defaults; host translations may override them. See `DESIGN.md` for
component ownership, layout, accessibility, and interaction decisions.
