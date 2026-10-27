# Mosaikit plugins

The official plugins of Mosaikit, a project separate from `mosaikit` (the folder next to it): the
logic depends only on the SDK (`mosaikit-plugin-sdk`), the UIs only on `@mosaikit/plugin-api`.

| Plugin | Id | What it does |
|---|---|---|
| Notes | `com.mosaikit.notes` | Personal notes with a tag, shareable; pages in the navigation of the shell (`[[nav]]`: all, mine, shared with me, by tag) |
| Tasks | `com.mosaikit.tasks` | Tasks with due date and priority |
| Contacts | `com.mosaikit.contacts` | Address book with validated emails |
| Maps | `com.mosaikit.maps` | Catalog of GeoLibre maps, with public links |
| Static sites | `com.mosaikit.static-site` | Static sites published from zip archives |
| Files | `com.mosaikit.files` | Files and folders with preview and zip |
| Note review | `com.mosaikit.note-review` | Sample extension of Notes: the Reviewed fields, the Mark as reviewed action and a Review tab with the history of the reviews |
| Workspace, Suite, Project, Tabs | `com.mosaikit.layout-workspace`, `-suite`, `-project`, `-tabs` | Layouts of the shell (`kind = "layout"`): a drawer under a top bar with a wide search; a launcher grid with the pages of the area; global areas with the sidebar of the area; apps and pages as tabs. Declarative: `layout/layout.toml`, a checked stylesheet, images |

## Build and test

```sh
cargo test                      # logic (WASM plugins: notes, tasks, contacts, maps)
npm ci
npm run typecheck && npm run lint && npm test && npm run build   # UIs
```

`cargo xtask dev` and the tests of `mosaikit` load the plugins from this folder
(`MOSAIKIT_PLUGINS_DIR` points elsewhere).

## Languages

Everything is in English by default; Italian is available.

- **UIs**: they take the language from the host (`msk.context.lang`, and `msk.onContext` when it
  changes). The CRUD UIs (notes, tasks, contacts) mount the view of `@mosaikit/plugin-api` again;
  the others (files, maps, static sites) reload. Their texts are keyed by the English phrase, with
  the Italian ones in `ui/src/it.ts`.
- **Stored values** (choice options, KPI columns) are English identifiers; the migrations
  `002_english.sql` convert the Italian values of earlier versions.
- **Manifest**: the texts of `plugin.toml` are English; the optional `[i18n.<lang>]` table
  translates them. Every key is optional and falls back to English:

```toml
[i18n.it]
name = "Note"                   # name
description = "…"               # description
label = "Note"                  # contribution.label (sidebar)

[i18n.it.resources.notes]
label = "Note"                  # resources[].label
fields = { title = "Titolo" }   # resources[].fields[].label, by key
options.tag = { personal = "personale" }   # labels of the values of a choice field

[i18n.it.kpi.kpi_notes_by_tag]
label = "Note per tag"          # kpi[].label
columns = { notes = "note" }    # labels of the columns of the KPI view
```
