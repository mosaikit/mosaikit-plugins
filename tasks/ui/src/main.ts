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
  tagInput,
  toast,
  toggleCheck,
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
import { TEXTS, langOf, sub, type L } from './texts.ts'

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
  let lang = langOf(msk.context?.lang)
  const tr = () => TEXTS[lang]
  let handle: CrudHandle | null = null
  let known: string[] = []

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
  const section = (api: CustomViewApi, key: Bucket, rows: Row[]) => {
    const sec = el('section', { class: 'tgroup g-' + key, 'aria-label': tr()[key] }, el('h2', {}, tr()[key], el('span', { class: 'msk-colcount' }, String(rows.length))))
    const list = el('div', { class: 'tlist', role: 'list' })
    for (const r of rows) {
      const c = api.ctx(r)
      const item = el('div', { class: 'msk-item tcard' + (c.selected ? ' sel' : ''), role: 'listitem', tabindex: '0', 'data-id': r.id }, content(c))
      item.addEventListener('click', (e) => {
        if (!(e.target as HTMLElement).closest('input,button,a')) api.open(r.id)
      })
      item.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === item) {
          e.preventDefault()
          api.open(r.id)
        }
      })
      list.append(item)
    }
    sec.append(list)
    return sec
  }
  const byDue = (a: Row, b: Row) => dueOf(a).localeCompare(dueOf(b)) || String(a.values.title).localeCompare(String(b.values.title))
  const listView = (api: CustomViewApi) => {
    const groups = new Map<Bucket, Row[]>()
    for (const r of api.rows) groups.set(bucket(r), [...(groups.get(bucket(r)) ?? []), r])
    const root = el('div', { class: 'tgroups' })
    for (const key of ['overdue', 'today', 'week', 'later', 'nodate', 'done'] as Bucket[]) {
      const rows = (groups.get(key) ?? []).sort(key === 'done' ? (a, b) => String(b.values.completed_on ?? '').localeCompare(String(a.values.completed_on ?? '')) : byDue)
      if (rows.length) root.append(section(api, key, rows))
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
      [...api.rows].sort(byDue),
      (r, col) => void api.ctx(r).update({ done: col === 'done' }),
    )
  const weekView = (api: CustomViewApi) => {
    const days = weekDays(today())
    const dayLabel = (d: string) => (d === today() ? tr().today : new Date(d + 'T00:00:00').toLocaleDateString(lang, { weekday: 'short', day: 'numeric' }))
    const open = api.rows.filter((r) => !isDone(r))
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
