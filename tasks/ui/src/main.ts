// UI of the Tasks plugin: a quick-add line, three views (a list grouped by when things are due, a board and a week where a
// card is dragged to the day it will be done) next to the detail panel, a Markdown description with a check list that shows
// its progress, labels, a project and repetition. English by default; Italian and Spanish follow the language of the host.
import '@mosaikit/plugin-api/style.css'
import './tasks.css'
import {
  avatar,
  chip,
  checkProgress,
  connect,
  el,
  errText,
  kanban,
  mountCrud,
  progress,
  renderMarkdown,
  richText,
  shortcuts,
  tagInput,
  toast,
  toggleCheck,
  undoToast,
  virtualList,
  type CrudHandle,
  type CrudView,
  type CustomViewApi,
  type EditorCtx,
  type ItemCtx,
  type Msk,
  type Row,
} from '@mosaikit/plugin-api'
import { bucketOf, isoDate, joinLabels, splitLabels, weekDays, type Bucket } from './group.ts'
import { parseQuickAdd, toValues } from './quickadd.ts'
import { bindTexts, TEXTS, langOf, sub, type L } from './texts.ts'

const app = document.getElementById('app')!

const today = () => isoDate(new Date())
const isDone = (r: Row) => !!r.values.done
const dueOf = (r: Row) => (typeof r.values.due === 'string' ? r.values.due : '')
const bucket = (r: Row) => bucketOf({ done: isDone(r), due: dueOf(r) }, today())
const notesOf = (r: Row) => (typeof r.values.notes === 'string' ? r.values.notes : '')
const fmt = (iso: string, lang: L) => {
  const d = new Date(iso + 'T00:00:00')
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(lang, { day: 'numeric', month: 'short' })
}

function mount(msk: Msk) {
  bindTexts(msk)
  let lang = langOf(msk.context?.lang)
  const tr = () => TEXTS[lang]
  let handle: CrudHandle | null = null
  let known: string[] = []
  /** deleted rows waiting for the undo time to pass: the list hides them */
  const hidden = new Set<string>()

  /** The face of a task: round check box, title, and a line of chips (priority, date, project, labels, progress, repeat). */
  const content = (c: ItemCtx) => {
    const r = c.row
    const title = c.text('title')
    const done = isDone(r)
    const box = el('input', { type: 'checkbox', class: 'tcheck', 'aria-label': sub(done ? tr().reopen : tr().mark, { t: title }) })
    box.checked = done
    box.disabled = !c.canWrite
    box.addEventListener('click', (e) => e.stopPropagation())
    box.addEventListener('change', () => void c.update({ done: box.checked }))
    const meta = el('div', { class: 'tmeta' })
    const prio = String(c.value('priority') ?? '')
    if (prio && prio !== 'medium') meta.append(chip(c.text('priority'), prio === 'high' ? 'err' : ''))
    const due = dueOf(r)
    const late = bucket(r) === 'overdue'
    if (done && c.value('completed_on')) meta.append(el('span', { class: 'tdue' }, sub(tr().done_on, { d: fmt(String(c.value('completed_on')), lang) })))
    else if (due) meta.append(el('span', { class: 'tdue' + (late ? ' late' : '') }, '📅 ' + (due === today() ? tr().today : fmt(due, lang))))
    const rep = String(c.value('repeat') ?? '')
    if (rep && rep !== 'none') meta.append(el('span', { class: 'trep', title: c.text('repeat') }, '↻ ' + c.text('repeat')))
    const project = String(c.value('project') ?? '')
    if (project) meta.append(el('span', { class: 'tproj' }, '▣ ' + project))
    const p = checkProgress(notesOf(r))
    if (p.total) meta.append(progress({ value: p.done, max: p.total, label: sub(tr().progress, { d: String(p.done), n: String(p.total) }) }), el('span', { class: 'tcount' }, `${p.done}/${p.total}`))
    for (const l of splitLabels(r.values.labels)) meta.append(el('span', { class: 'tlabel' }, l))
    if (r.shared && r.owner_name && r.owner_id !== msk.user?.id) meta.append(el('span', { class: 'twho' }, avatar(r.owner_name), r.owner_name))
    return el('div', { class: `task p-${prio || 'medium'}` + (done ? ' done' : '') }, box, el('div', { class: 'tbody' }, el('div', { class: 'ttitle' }, title), meta))
  }

  // -------------------------------------------------------------------------------------------------- views
  /** Moves a task out of sight at once; the real delete waits for the undo time. */
  const remove = (r: Row) => {
    hidden.add(r.id)
    void handle?.reload()
    undoToast({
      text: sub(tr().deleted, { t: String(r.values.title ?? '') }),
      undoLabel: tr().undo,
      commit: async () => {
        try {
          await msk.crud('tasks').remove(r.id)
        } catch (err) {
          toast(tr().deleteFailed + errText(err, msk.context?.lang), { tone: 'err', ms: 6000 })
        } finally {
          hidden.delete(r.id)
          void handle?.reload()
        }
      },
      undo: () => {
        hidden.delete(r.id)
        void handle?.reload()
      },
    })
  }
  const card = (api: CustomViewApi, r: Row) => {
    const c = api.ctx(r)
    const item = el('div', { class: 'msk-item tcard' + (c.selected ? ' sel' : ''), role: 'listitem', tabindex: '0', 'data-id': r.id }, content(c))
    const canDelete = c.canWrite && msk.can('delete')
    if (canDelete) {
      const del = el('button', { type: 'button', class: 'tdel', title: tr().del, 'aria-label': sub(tr().delTask, { t: c.text('title') }) }, '✕')
      del.addEventListener('click', (e) => {
        e.stopPropagation()
        remove(r)
      })
      item.append(del)
    }
    item.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('input,button,a')) api.open(r.id)
    })
    item.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target === item) {
        e.preventDefault()
        api.open(r.id)
      } else if (e.key === 'Delete' && e.target === item && canDelete) {
        e.preventDefault()
        remove(r)
      }
    })
    return item
  }
  const heading = (key: Bucket, n: number) => el('h2', { class: 'thead g-' + key }, tr()[key], el('span', { class: 'msk-colcount' }, String(n)))
  const byDue = (a: Row, b: Row) => dueOf(a).localeCompare(dueOf(b)) || String(a.values.title).localeCompare(String(b.values.title))
  /** From this many tasks the list draws only the rows in view. */
  const VIRTUAL_FROM = 60
  const listView = (api: CustomViewApi) => {
    const groups = new Map<Bucket, Row[]>()
    const shown = api.rows.filter((r) => !hidden.has(r.id))
    for (const r of shown) groups.set(bucket(r), [...(groups.get(bucket(r)) ?? []), r])
    const entries: ({ head: Bucket; n: number } | { row: Row })[] = []
    for (const key of ['overdue', 'today', 'week', 'later', 'nodate', 'done'] as Bucket[]) {
      const rows = (groups.get(key) ?? []).sort(key === 'done' ? (a, b) => String(b.values.completed_on ?? '').localeCompare(String(a.values.completed_on ?? '')) : byDue)
      if (!rows.length) continue
      entries.push({ head: key, n: rows.length }, ...rows.map((row) => ({ row })))
    }
    if (shown.length >= VIRTUAL_FROM) {
      const vl = virtualList({
        count: entries.length,
        estimateSize: (i) => ('head' in entries[i]! ? 34 : 62),
        getKey: (i) => {
          const e = entries[i]!
          return 'head' in e ? 'h-' + e.head : e.row.id
        },
        gap: 6,
        label: tr().title,
        render: (i) => {
          const e = entries[i]!
          return 'head' in e ? el('div', { class: 'tvhead' }, heading(e.head, e.n)) : card(api, e.row)
        },
      })
      vl.el.classList.add('tvlist')
      return vl.el
    }
    const root = el('div', { class: 'tgroups' })
    let list: HTMLElement | null = null
    for (const e of entries) {
      if ('head' in e) {
        list = el('div', { class: 'tlist', role: 'list' })
        root.append(el('section', { class: 'tgroup g-' + e.head, 'aria-label': tr()[e.head] }, heading(e.head, e.n), list))
      } else list!.append(card(api, e.row))
    }
    return root
  }

  const board = (api: CustomViewApi, columns: { key: string; label: string; tone?: 'ok' | 'err' | 'acc' | ''; droppable?: boolean }[], columnOf: (r: Row) => string, rows: Row[], move: (r: Row, col: string) => void) => {
    const k = kanban<Row>({
      label: tr().board,
      columns,
      columnOf,
      id: (r) => r.id,
      card: (r) => content(api.ctx(r)),
      title: (r) => String(r.values.title ?? ''),
      canMove: (r) => api.ctx(r).canWrite,
      onOpen: (r) => api.open(r.id),
      emptyText: tr().colEmpty,
      movedText: tr().moved,
      onMove: (r, col) => {
        if (columnOf(r) !== col) move(r, col)
      },
    })
    k.set(rows)
    return k.el
  }
  const boardView = (api: CustomViewApi) =>
    board(
      api,
      [
        { key: 'overdue', label: tr().overdue, tone: 'err', droppable: false },
        { key: 'open', label: tr().open, tone: 'acc' },
        { key: 'done', label: tr().done, tone: 'ok' },
      ],
      (r) => (isDone(r) ? 'done' : bucket(r) === 'overdue' ? 'overdue' : 'open'),
      api.rows.filter((r) => !hidden.has(r.id)).sort(byDue),
      (r, col) => void api.ctx(r).update({ done: col === 'done' }),
    )
  const weekView = (api: CustomViewApi) => {
    const days = weekDays(today())
    const dayLabel = (d: string) => (d === today() ? tr().today : new Date(d + 'T00:00:00').toLocaleDateString(lang, { weekday: 'short', day: 'numeric' }))
    const open = api.rows.filter((r) => !isDone(r) && !hidden.has(r.id))
    const columnOf = (r: Row) => {
      const d = dueOf(r)
      return !d ? 'nodate' : d < today() ? 'overdue' : d > days[6]! ? 'later' : d
    }
    return board(
      api,
      [
        { key: 'overdue', label: tr().overdue, tone: 'err', droppable: false },
        ...days.map((d) => ({ key: d, label: dayLabel(d), tone: (d === today() ? 'acc' : '') as 'acc' | '' })),
        { key: 'later', label: tr().later, droppable: false },
        { key: 'nodate', label: tr().nodate },
      ],
      columnOf,
      open.sort(byDue),
      (r, col) => void api.ctx(r).update({ due: col === 'nodate' ? null : col }),
    )
  }
  const views = (): CrudView[] => [
    { key: 'list', label: tr().list, kind: 'custom', item: content, render: listView },
    { key: 'board', label: tr().board, kind: 'custom', item: content, render: boardView },
    { key: 'week', label: tr().week, kind: 'custom', item: content, render: weekView },
  ]

  // ----------------------------------------------------------------------------- detail: reader and editor
  const reader = (c: ItemCtx) => {
    const r = c.row
    const box = el('div', { class: 'tread' })
    const head = el('div', { class: 'tmeta' })
    const prio = String(c.value('priority') ?? '')
    if (prio) head.append(chip(c.text('priority'), prio === 'high' ? 'err' : prio === 'medium' ? 'acc' : ''))
    if (dueOf(r)) head.append(el('span', { class: 'tdue' + (bucket(r) === 'overdue' ? ' late' : '') }, '📅 ' + fmt(dueOf(r), lang)))
    const rep = String(c.value('repeat') ?? '')
    if (rep && rep !== 'none') head.append(el('span', { class: 'trep' }, '↻ ' + c.text('repeat')))
    if (c.value('project')) head.append(el('span', { class: 'tproj' }, '▣ ' + c.text('project')))
    for (const l of splitLabels(r.values.labels)) head.append(el('span', { class: 'tlabel' }, l))
    box.append(el('h2', { class: 'tread-title' }, c.text('title')), head)
    const notes = notesOf(r)
    if (notes.trim()) {
      const p = checkProgress(notes)
      if (p.total) box.append(el('div', { class: 'tprog' }, progress({ value: p.done, max: p.total, label: sub(tr().progress, { d: String(p.done), n: String(p.total) }) }), el('span', { class: 'tcount' }, sub(tr().progress, { d: String(p.done), n: String(p.total) }))))
      box.append(renderMarkdown(notes, c.canWrite ? { onToggle: (line, checked) => void c.update({ notes: toggleCheck(notes, line, checked) }) } : {}))
    } else box.append(el('p', { class: 'tnone' }, tr().noDescription))
    return box
  }
  const editor = (ctx: EditorCtx, box: HTMLElement) => {
    const L = tr()
    const rt = richText({
      label: L.description,
      value: String(ctx.value('notes') ?? ''),
      rows: 7,
      placeholder: L.descPlaceholder,
      labels: { write: L.write, preview: L.preview, bold: L.bold, italic: L.italic, heading: L.heading, list: L.bullets, checks: L.checks, quote: L.quote, code: L.code, link: L.link, nothing: L.nothingToPreview },
      onChange: (v) => ctx.set('notes', v),
    })
    const tags = tagInput({ label: L.labels, values: splitLabels(ctx.value('labels')), suggestions: known, placeholder: L.labelsPlaceholder, removeLabel: L.removeLabel, onChange: (v) => ctx.set('labels', joinLabels(v)) })
    box.append(
      el('div', { class: 'msk-field' }, el('label', {}, L.labels), tags.el),
      el('div', { class: 'msk-field' }, el('label', {}, L.description), rt.el),
    )
  }

  // ------------------------------------------------------------------------------------------- quick add
  const quick = () => {
    const input = el('input', { type: 'text', class: 'tq-input', 'aria-label': tr().quickLabel, placeholder: tr().quickPlaceholder, autocomplete: 'off', maxlength: '300' })
    const go = el('button', { type: 'submit', class: 'msk-btn' }, tr().add)
    const form = el('form', { class: 'tq', title: tr().quickHint }, el('span', { class: 'tq-plus', 'aria-hidden': 'true' }, '＋'), input, go)
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const p = parseQuickAdd(input.value, new Date())
      if (!p.title) return
      go.disabled = true
      msk
        .crud('tasks')
        .create(toValues(p))
        .then(() => {
          input.value = ''
          toast(sub(tr().added, { t: p.title }), { tone: 'ok' })
          return handle?.reload()
        })
        .catch((err) => toast(tr().addFailed + errText(err, msk.context?.lang), { tone: 'err', ms: 6000 }))
        .finally(() => {
          go.disabled = false
          input.focus()
        })
    })
    form.hidden = !msk.can('create')
    return form
  }

  const open = () => {
    handle = mountCrud(app, msk, 'tasks', {
      title: tr().title,
      newLabel: tr().newLabel,
      empty: { art: 'tasks', title: tr().emptyTitle, text: tr().emptyText },
      columns: ['title', 'due', 'priority', 'done'],
      views: views(),
      form: 'modal',
      bar: [quick()],
      reader,
      editor,
      onLoad: (rows) => {
        known = [...new Set(rows.flatMap((r) => splitLabels(r.values.labels)))].sort()
      },
    })
    return handle
  }
  let off: () => void = open()
  const keys = shortcuts(
    [
      { keys: 'n', label: tr().scNew, run: (e) => (e.preventDefault(), app.querySelector<HTMLInputElement>('.tq-input')?.focus()), when: () => msk.can('create') },
      { keys: '/', label: tr().scSearch, run: (e) => (e.preventDefault(), app.querySelector<HTMLInputElement>('.msk-filter')?.focus()) },
    ],
    { labels: { title: tr().scTitle, close: tr().scClose, general: tr().scGeneral, then: tr().scThen } },
  )
  addEventListener('pagehide', () => keys.dispose())
  // the view follows the host for its own texts; the title and the button are ours
  msk.onContext((ctx) => {
    if (langOf(ctx.lang) === lang) return
    lang = langOf(ctx.lang)
    off()
    off = open()
  })
}

connect()
  .then(mount)
  .catch((e) => {
    app.textContent = TEXTS[langOf(undefined)].failed + errText(e)
  })
