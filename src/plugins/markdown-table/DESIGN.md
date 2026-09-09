---
version: alpha
omitted:
  - section: colors
    reason: Inherited from the host Strapi design system, including custom and dark themes.
  - section: typography
    reason: UI typography inherits the host admin; Markdown source uses the platform monospace stack.
  - section: spacing
    reason: Component geometry is maintained in admin/src/components/styles.ts.
  - section: rounded
    reason: The editor uses the host theme borderRadius token.
  - section: components
    reason: Strapi owns Field, Button, and Popover primitives.
---

## Overview

RichText++ (MarkDown) is a product/admin extension for content editors using Strapi 5. The reference is
Strapi's built-in Markdown field: compact controls, restrained surfaces, visible
source text. The signature is a clearly labeled Table action opening a compact size grid, followed by editable
cells inside the rendered document. Writing remains the primary task. Avoid marketing decoration, floating
toolbars, new brand fonts, and a separate visual identity inside the host admin.

The user requested table creation in the existing Markdown workflow. The workspace
was empty; no existing app, PRD, or project contracts were available. The plugin
offers a custom field and an explicit helper for replacing existing richtext inputs.

## Colors

Ownership model B: the host `@strapi/design-system` theme is canonical.
`admin/src/components/styles.ts` adapts its semantic colors into scoped CSS
variables. No plugin palette overrides the host theme.

| Role            | Host token | Runtime alias    | Consumers                   |
| --------------- | ---------- | ---------------- | --------------------------- |
| Surface         | neutral0   | --mt-bg          | Editor, cells               |
| Muted surface   | neutral100 | --mt-soft        | View controls, headers      |
| Border          | neutral200 | --mt-border      | Editor, table, toolbar      |
| Text            | neutral800 | --mt-text        | Source, preview, picker     |
| Secondary text  | neutral600 | --mt-muted       | Help, inactive actions      |
| Action/focus    | primary600 | --mt-accent      | Table action, focus rings   |
| Selected action | primary100 | --mt-accent-soft | Selected view, Table action |
| Invalid         | danger600  | --mt-danger      | Field border                |
| Scrollbar       | neutral400 | --mt-thumb       | All plugin-owned overflow   |

Both themes keep the same hierarchy and geometry. Host document scrollbars remain
host-owned; the shared `surface` mixin provides a baseline for every descendant of
the editor and portaled size picker, with hover, active and forced-colors behavior.

## Typography

UI text inherits the Strapi admin font. Source uses `ui-monospace, SFMono-Regular,
Menlo, Consolas, monospace`, 1.3rem/1.9. UI text is 1.4rem/1.5, helper text 1.2rem.
The host admin uses a 10px rem baseline. The isolated demo uses the same baseline.
Do not load fonts or modify the host's global font size.

All plugin messages use `react-intl` with `markdown-table.*` keys and English
fallbacks. Strapi's active locale and theme providers remain authoritative. This
release supplies English copy; additional languages can be supplied by the host.

## Layout

The input fills its Strapi field width. The toolbar wraps and keeps Table labeled.
Source has a 360px height; Expand provides 65vh of writing space without changing
the host page's scrolling. Editor and Preview each occupy the full field width;
there is no split layout. Editor defaults to interactive block editing and has a
Raw Markdown toggle. Preview and table matrices own horizontal overflow.
The size picker is 280px wide, collision-aware, and stays within 16px of viewport edges.
Inline table overflow stays inside the interactive editor.
Controls have 34px minimum geometry and expand to 44px for coarse pointers.

## Elevation & Depth

The editor is a bordered surface. Strapi's non-modal Popover owns elevation, portal,
collision handling, Escape and focus restoration for the size picker. Insertion
moves focus to the first header cell. Host popover motion respects reduced-motion
preferences; the plugin adds no custom animation or page backdrop.
Individual text blocks have no border or hover background. Hover changes text color;
keyboard focus uses an outline on rendered blocks and a subtle underline on the active
textarea. Table cell grid lines remain because they communicate rows and columns.

## Shapes

Use the host borderRadius for the editor and Strapi's primitive defaults for
buttons/popovers. Source/table controls use restrained 4px corners.

## Components

`InteractiveDocument` owns click-to-edit text blocks and reuses `InlineTable` for
cells. `MarkdownEditor` owns the two main modes and Raw Markdown toggle. All other
canonical owners below remain unchanged.

| Capability     | Canonical owner                          | Source of truth                     | Allowed variants                                                                                                | Verification                                |
| -------------- | ---------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Form           | Strapi useField + MarkdownEditor + Field | Host Content Manager                | Custom field or existing richtext; host validation and persistence                                              | Typecheck and browser field tests           |
| Select/Listbox | Shared native ToolSelect in styles.ts    | DESIGN.md                           | OS-owned heading and alignment popups; H1–H6 command resets after applying; alignment affects the active column | Browser selection and keyboard tests        |
| Scrollbar      | Shared surface mixin                     | Host theme via styles.ts            | All plugin-owned overflow inherits tokens; host shell untouched                                                 | Narrow viewport tests and visual inspection |
| Popover        | Strapi Popover + TablePicker             | DESIGN.md                           | Non-modal 6×5 size grid; arrows/Enter or hover/click; Escape restores trigger focus                             | Keyboard and accessibility tests            |
| Feedback       | Field.Error and local status regions     | Host validation and component state | Inline errors and polite insertion updates                                                                      | Validation/accessibility tests              |
| Table editing  | InlineTable in EditablePreview           | GFM table model                     | At most 20 columns/100 data rows; native table and labeled cells; reversible removals                           | Unit and browser tests                      |

Content saving, permissions, dirty-navigation warnings, localization, publishing,
and API failures belong to the host Content Manager. There is no extra save API
inside this plugin. The demo's in-memory Save is explicitly labeled as a demo.
The default Editor mode renders clickable text blocks and editable tables.
Text blocks use native textareas while active, preserving their source range;
only that range changes on commit. Formatting controls and keyboard shortcuts
apply to the active text block. + Content adds a block at the document end.
The Headings dropdown offers all six levels and replaces the existing heading marker.
In Raw Markdown, it applies to the current or selected complete lines. The H1–H6 type
scale is shared visually between the interactive document and read-only preview.
Cells and text blocks keep local drafts until blur (or explicit keyboard finish).
Escape cancels an uncommitted edit. External content changes invalidate stale
drafts instead of overwriting new content. These are deliberately simple React
components using the existing Markdown parser/renderer, with no added editor
framework or HTML-to-Markdown conversion.

The Raw Markdown toggle shows the complete source in Editor and is reversible.
Preview is read-only and does not show the raw toggle. Merely switching modes
preserves exact source text. The public input ref exposes focus() and routes it
to the currently chosen editing surface for host validation and autofocus.
The size picker inserts immediately in the current editor mode; interactive
insertion focuses a header cell, while raw insertion preserves raw mode. Tables
retain the same size limits and use existing inline row/column controls.

## Do's and Don'ts

- Keep stored content as plain Markdown; table syntax is GFM.
- Reuse host tokens and field state. Respect disabled fields and validation.
- Keep all actions keyboard reachable and named. Use visible focus indicators.
- Keep raw HTML disabled in preview and keep react-markdown's URL sanitizer.
- Do not modify Blocks JSON fields or require a database migration to replace richtext.
- Do not add persistence, analytics, network calls, or browser storage for draft content.
