# Mosaikit plugins

The official plugins of Mosaikit, a project separate from `mosaikit` (the folder next to it): the
logic depends only on the SDK (`mosaikit-plugin-sdk`), the UIs only on `@mosaikit/plugin-api`.

| Plugin | Id | What it does |
|---|---|---|
| Notes | `com.mosaikit.notes` | Personal notes in Markdown (toolbar, check lists with progress) as coloured, resizable post-its (8 colours, a size kept per note) with tags of your own, each with its own colour, pins, archive, export as Markdown, edited together live by several people (Yjs), shareable; pages in the navigation of the shell (`[[nav]]`: all, mine, shared with me, by tag, archive) |
| Chat | `com.mosaikit.chat` | Channels and live conversations: messages arrive at once with who is online and who is typing, Markdown, replies, reactions, edit and delete, history; a channel is shared like any item (needs Mosaikit with real-time channels) |
| Meet | `com.mosaikit.meet` | Video meeting rooms shared like any item: the Jitsi Meet service opens inside the page with camera, microphone and screen share, and shows who has the room open (needs Mosaikit with `permissions.media`) |
| Announcements | `com.mosaikit.announcements` | A notice board: notices with a level and a period, urgent and pinned first, and a confirmation of reading with the list of who confirmed (the confirmations are rows a reader writes: `[[tables]]`) |
| Bookmarks | `com.mosaikit.bookmarks` | A shared collection of web links with a note, tags and favourites; only http and https addresses, nothing is fetched from the saved sites |
| Snippets | `com.mosaikit.snippets` | A shared collection of reusable texts and pieces of code with a kind and tags, copied to the clipboard with one click |
| Polls | `com.mosaikit.polls` | Quick questions to a group: single or multiple choice, deadline, named or hidden voters, results with live bars (real-time channel); a reader votes with rows of their own (`[[tables]]`) |
| Surveys | `com.mosaikit.surveys` | Series of questions with results per question, CSV export, and a quiz mode with scores and a pass mark (the answer key is kept out of the rows a reader can read) |
| Approvals | `com.mosaikit.approvals` | A request that people approve or reject (one, all or in sequence) with the history of who decided what, when and why |
| Dashboard | `com.mosaikit.dashboard` | A page of widgets the person arranges: other plugins contribute widgets (open tasks, notices to confirm, requests to decide...) with `[[contributes]]` to the point `com.mosaikit.dashboard.widget`; each widget shows only what the caller may see |
| Forms | `com.mosaikit.forms` | A form builder with a public link: anyone can answer without an account (public command that writes, `insert_for = "visitor"`), a table of the answers and CSV export |
| Projects | `com.mosaikit.projects` | A plan for a set of tasks: board columns, milestones with dates, sprints and a progress bar; the tasks stay in Tasks (read and arranged through its commands; needs PostgreSQL for plugin calls) |
| Calendar | `com.mosaikit.calendar` | Month, week and day views, events with recurrence and invitations (answers yes/maybe/no), the due dates of Tasks next to the events, `.ics` export |
| Whiteboard | `com.mosaikit.whiteboard` | A shared board with notes, shapes, text, arrows and drawing, edited live by several people (Yjs over a real-time channel) and saved in the item |
| Tasks | `com.mosaikit.tasks` | Tasks with a quick-add line («Call Ana tomorrow !high #work @phone every week»), due date, priority, project, labels, Markdown description with a check list and progress, repetition; list grouped by due date, board and a week where a card is dragged to its day |
| Contacts | `com.mosaikit.contacts` | Address book with validated emails: cards and an A–Z list, job, organization, second email and phone, address, birthday, tags with a filter, Markdown notes, vCard and CSV import and export, finder of duplicates |
| Maps | `com.mosaikit.maps` | Catalog of GeoLibre maps, with public links |
| Sites | `com.mosaikit.static-site` | Static sites published from zip archives |
| Documents | `com.mosaikit.files` | Files and folders with preview and zip |
| Note review | `com.mosaikit.note-review` | Sample extension of Notes: the Reviewed fields, the Mark as reviewed action and a Review tab with the history of the reviews |
| Workspace, Suite, Project, Tabs | `com.mosaikit.layout-workspace`, `-suite`, `-project`, `-tabs` | Layouts of the shell (`kind = "layout"`): a drawer under a top bar with a wide search; a launcher grid with the pages of the area; global areas with the sidebar of the area; apps and pages as tabs. Declarative: `layout/layout.toml`, a checked stylesheet, images |
| Spanish | `com.mosaikit.lang-es` | Sample language plugin (`kind = "language"`): the code and name of the language, `lang/host.json` with the texts of the shell and `lang/plugins/<id>.toml` with the manifest texts of other plugins. Only data, no code |
| Portuguese | `com.mosaikit.lang-pt` | Language plugin: the texts of the shell (`lang/host.json`) and the manifest texts of the official plugins (`lang/plugins/<id>.toml`). The pages of a plugin draw their own texts: where a plugin has no Portuguese text they stay in English. Only data, no code |
| French | `com.mosaikit.lang-fr` | Language plugin: the texts of the shell (`lang/host.json`) and the manifest texts of the official plugins (`lang/plugins/<id>.toml`). The pages of a plugin draw their own texts: where a plugin has no French text they stay in English. Only data, no code |
| Dutch | `com.mosaikit.lang-nl` | Language plugin: the texts of the shell (`lang/host.json`) and the manifest texts of the official plugins (`lang/plugins/<id>.toml`). The pages of a plugin draw their own texts: where a plugin has no Dutch text they stay in English. Only data, no code |
| Arabic | `com.mosaikit.lang-ar` | Language plugin: the texts of the shell (`lang/host.json`) and the manifest texts of the official plugins (`lang/plugins/<id>.toml`) (written right to left: the page takes the direction from the language). The pages of a plugin draw their own texts: where a plugin has no Arabic text they stay in English. Only data, no code |
| Chinese | `com.mosaikit.lang-zh` | Language plugin: the texts of the shell (`lang/host.json`) and the manifest texts of the official plugins (`lang/plugins/<id>.toml`). The pages of a plugin draw their own texts: where a plugin has no Chinese text they stay in English. Only data, no code |
| Russian | `com.mosaikit.lang-ru` | Language plugin: the texts of the shell (`lang/host.json`) and the manifest texts of the official plugins (`lang/plugins/<id>.toml`). The pages of a plugin draw their own texts: where a plugin has no Russian text they stay in English. Only data, no code |

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
