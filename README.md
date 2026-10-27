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
| Spanish | `com.mosaikit.lang-es` | Sample language plugin (`kind = "language"`): the code and name of the language, `lang/host.json` with the texts of the shell and `lang/plugins/<id>.toml` with the manifest texts of other plugins. Only data, no code |

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

### A new language is a plugin

A plugin with `kind = "language"` adds a language to the host (English and Italian are built in). It is data
only, no code, and has no resources, `[ui]` or KPIs:

```toml
id = "com.mosaikit.lang-es"
name = "Spanish (Español)"
version = "0.1.0"
kind = "language"

[contribution]
icon = "🌐"
label = "Español"

[language]
code = "es"          # two or three lower case letters; `en` and `it` are built into the host
name = "Español"     # the name of the language in that language: what the menu shows
```

- `lang/host.json`: the texts of the host, a flat object from the English phrase (the key the host uses,
  e.g. `"Sign in"`, or `"errors.<code>"` for a server error) to its translation, keeping the
  `{placeholders}`. Texts missing here stay in English. At most 1 MB and 6000 texts of 1000 characters.
- `lang/plugins/<plugin id>.toml`: the texts of the manifest of another plugin in this language, in the
  shape of its `[i18n.<code>]` table (`name`, `description`, `label`, `[resources.*]`, `[kpi.*]`…). A
  plugin that has its own `[i18n.<code>]` keeps it.
- The texts inside the UI of a plugin (its iframe) stay in that plugin (`ui/src/<code>.ts`).

Installed and on, the language is offered in every language menu; off or uninstalled, it goes away.
`com.mosaikit.lang-es` is a starter set to copy from.
