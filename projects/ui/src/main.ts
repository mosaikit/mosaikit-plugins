// UI of the Projects plugin: the list of projects with their progress, and the page of one project with a board (drag and
// drop or the «Move to…» menu), milestones, sprints and details. The tasks belong to the Tasks plugin: the logic reads and
// arranges them through commands of Tasks, as the same person.
import '@mosaikit/plugin-api/style.css'
import './projects.css'
import {
  chip,
  confirmDialog,
  connect,
  dateField,
  dialog,
  el,
  emptyState,
  errText,
  kanban,
  menu,
  progress,
  segmented,
  skeleton,
  toast,
  type Msk,
  type Row,
} from '@mosaikit/plugin-api'
import {
  STATUSES,
  behindBy,
  byStatus,
  chartGeometry,
  columnsFromText,
  columnsToText,
  currentSprint,
  isOverdue,
  newId,
  nextMilestone,
  parseColumns,
  parseMilestones,
  parseSprints,
  pointsAttr,
  statusOf,
  todayLocal,
  type Burndown,
  type Milestone,
  type Sprint,
  type Status,
} from './logic.ts'
import { bindTexts, TEXTS, langOf, sub } from './texts.ts'

const app = document.getElementById('app')!

interface Proj {
  id: string
  row: Row
  name: string
  description: string
  status: Status
  startsOn: string
  endsOn: string
  columns: string[]
  milestones: Milestone[]
  sprints: Sprint[]
}
interface Prog {
  done: number
  total: number
  percent: number
}
interface Overview {
  progress: Record<string, Prog | null>
  tasks_available: boolean
}
interface Task {
  id: string
  title: string
  due: string | null
  done: boolean
  priority: string | null
  owner: string | null
  column: string
  sprint: string | null
}
interface Board {
  columns: { name: string; tasks: Task[] }[]
  progress: Prog
  per_sprint: { id: string; done: number; total: number }[]
}
interface Candidate {
  id: string
  title: string
  due: string | null
}
type Tab = 'board' | 'milestones' | 'sprints' | 'burndown' | 'details'

const tasksMissing = (e: unknown) => (e as { code?: string } | null)?.code === 'tasks_unavailable' || (e instanceof Error && /Tasks plugin is not available/i.test(e.message))

function mount(msk: Msk) {
  document.documentElement.classList.add('msk-fill')
  bindTexts(msk)
  let lang = langOf(msk.context?.lang)
  const tr = () => TEXTS[lang]
  const api = msk.crud('projects')
  let projects: Proj[] = []
  let over: Overview = { progress: {}, tasks_available: true }
  let filter: Status | 'all' = 'all'
  let openId: string | null = null
  let tab: Tab = 'board'
  let board: Board | null = null
  let boardError: unknown = null

  const fail = (e: unknown) => toast(errText(e, msk.context?.lang), { tone: 'err', ms: 6000 })
  const head = el('header', { class: 'pj-head' })
  const body = el('div', { class: 'pj-body' })
  app.replaceChildren(el('div', { class: 'pj' }, head, body))

  const day = (d: string) => (d ? new Date(d + 'T00:00:00').toLocaleDateString(msk.context?.lang || undefined, { dateStyle: 'medium' }) : '')
  const statusChip = (s: Status) => chip(tr()[s], s === 'active' ? 'acc' : s === 'done' ? 'ok' : '')
  const button = (label: string, cls = '', onClick?: () => void) => {
    const b = el('button', { type: 'button', class: ('msk-btn ' + cls).trim() }, label)
    if (onClick) b.addEventListener('click', onClick)
    return b
  }
  const field = (label: string, input: HTMLElement) => el('div', { class: 'msk-field' }, el('label', {}, label), input)
  const current = () => projects.find((p) => p.id === openId) ?? null
  const canWrite = (p: Proj) => p.row.my_level === 'write' || p.row.my_level === 'manage'

  const toProj = (r: Row): Proj => ({
    id: r.id,
    row: r,
    name: String(r.values.name ?? ''),
    description: String(r.values.description ?? ''),
    status: statusOf(r.values.status),
    startsOn: String(r.values.starts_on ?? ''),
    endsOn: String(r.values.ends_on ?? ''),
    columns: parseColumns(r.values.columns),
    milestones: parseMilestones(r.values.milestones),
    sprints: parseSprints(r.values.sprints),
  })

  const periodText = (p: Proj) =>
    p.startsOn && p.endsOn ? sub(tr().dates, { a: day(p.startsOn), b: day(p.endsOn) }) : p.startsOn ? sub(tr().since, { a: day(p.startsOn) }) : p.endsOn ? sub(tr().until, { b: day(p.endsOn) }) : ''

  /** Saves a change of the project: the whole set of values with the patch applied (hidden fields included). */
  const save = async (p: Proj, patch: Record<string, string | number | boolean | null>) => {
    const row = await api.update(p.id, { ...p.row.values, ...patch })
    const i = projects.findIndex((x) => x.id === p.id)
    const next = toProj(row)
    if (i >= 0) projects[i] = next
    return next
  }

  const progressBlock = (p: Prog | null, label: string) => {
    const box = el('div', { class: 'pj-prog' })
    if (!p) {
      box.append(el('p', { class: 'pj-dim' }, tr().noProgress))
      return box
    }
    box.append(progress({ value: p.done, max: p.total, label }))
    box.append(el('p', { class: 'pj-dim' }, p.total ? sub(tr().tasksDone, { done: p.done, total: p.total }) + ' · ' + sub(tr().percent, { p: p.percent }) : tr().noTasks))
    return box
  }

  // ------------------------------------------------------------------------------------------------ new project
  const newProject = () => {
    const name = el('input', { type: 'text', maxlength: '80', 'aria-label': tr().dName, placeholder: tr().dName })
    const desc = el('textarea', { rows: '3', 'aria-label': tr().dDesc, placeholder: tr().dDesc })
    const status = el('select', { 'aria-label': tr().dStatus })
    for (const s of STATUSES) status.append(el('option', { value: s }, tr()[s]))
    status.value = 'active'
    let from = ''
    let until = ''
    const fromField = dateField({ label: tr().dStart, value: '', onChange: (v) => (from = v) })
    const untilField = dateField({ label: tr().dEnd, value: '', onChange: (v) => (until = v) })
    const ok = button(tr().create)
    const no = button(tr().cancel, 'ghost')
    const d = dialog({
      title: tr().newTitle,
      body: el('div', { class: 'pj-form' }, field(tr().dName, name), field(tr().dDesc, desc), field(tr().dStatus, status), el('div', { class: 'pj-row' }, field(tr().dStart, fromField.el), field(tr().dEnd, untilField.el))),
      actions: [no, ok],
    })
    no.addEventListener('click', d.close)
    ok.addEventListener('click', async () => {
      if (!name.value.trim()) {
        toast(tr().needName, { tone: 'err' })
        return name.focus()
      }
      ok.disabled = true
      try {
        const row = await api.create({ name: name.value.trim(), description: desc.value, status: status.value, starts_on: from, ends_on: until })
        d.close()
        projects.push(toProj(row))
        await open(row.id)
      } catch (e) {
        fail(e)
        ok.disabled = false
      }
    })
    name.focus()
  }

  // ----------------------------------------------------------------------------------------------------- the list
  const projectCard = (p: Proj, today: string) => {
    const card = el('article', { class: 'pj-card', 'data-testid': 'project' })
    const openBtn = el('button', { type: 'button', class: 'pj-name' }, p.name)
    openBtn.addEventListener('click', () => void open(p.id))
    card.append(el('div', { class: 'pj-cardhead' }, el('h2', {}, openBtn), statusChip(p.status)))
    card.append(progressBlock(over.progress[p.id] ?? null, p.name))
    const next = nextMilestone(p.milestones, today)
    const meta = [next ? sub(tr().next, { n: next.name, d: day(next.date) }) : tr().noMilestone, periodText(p)].filter(Boolean)
    card.append(el('p', { class: 'pj-meta' }, meta.join(' · ')))
    return card
  }

  const drawList = () => {
    openId = null
    head.replaceChildren(el('h1', {}, tr().title))
    const seg = segmented({
      label: tr().filter,
      value: filter,
      options: [{ key: 'all', label: tr().all }, ...STATUSES.map((s) => ({ key: s, label: tr()[s] }))],
      onChange: (k) => {
        filter = k as Status | 'all'
        drawList()
      },
    })
    const add = button(tr().newProject, '', newProject)
    add.hidden = !msk.can('create')
    head.append(seg.el, add)
    body.replaceChildren()
    if (!projects.length) {
      body.append(emptyState({ art: 'projects', title: tr().emptyTitle, text: tr().emptyText, actions: msk.can('create') ? [button(tr().newProject, '', newProject)] : [] }))
      return
    }
    if (!over.tasks_available) body.append(el('p', { class: 'pj-note', role: 'status' }, tr().progressNeedsTasks))
    const shown = byStatus(projects, filter)
    if (!shown.length) {
      body.append(emptyState({ art: 'projects', title: tr().emptyFilter }))
      return
    }
    const today = todayLocal()
    const grid = el('div', { class: 'pj-grid' })
    for (const p of shown) grid.append(projectCard(p, today))
    body.append(grid)
  }

  const loadList = async () => {
    openId = null
    body.replaceChildren(skeleton({ kind: 'cards', count: 3 }))
    try {
      projects = (await api.list({ limit: 500 })).rows.map(toProj)
    } catch (e) {
      body.textContent = tr().loadFailed + errText(e, msk.context?.lang)
      return
    }
    try {
      over = await msk.call<Overview>('projects.overview')
    } catch {
      over = { progress: {}, tasks_available: false }
    }
    drawList()
  }

  // ------------------------------------------------------------------------------------------- one project: header
  const open = async (id: string, to: Tab = 'board') => {
    openId = id
    tab = to
    board = null
    boardError = null
    drawProject()
    await loadBoard()
  }

  const loadBoard = async () => {
    const p = current()
    if (!p) return
    try {
      board = await msk.call<Board>('projects.board', { id: p.id })
      boardError = null
    } catch (e) {
      board = null
      boardError = e
    }
    if (current()?.id === p.id) drawProject()
  }

  const drawProject = () => {
    const p = current()
    if (!p) return drawList()
    const back = button(tr().back, 'ghost mini', () => void loadList())
    head.replaceChildren(
      el('div', { class: 'pj-headrow' }, back, el('h1', {}, p.name), statusChip(p.status)),
      progressBlock(board ? board.progress : null, p.name),
      segmented({
        label: tr().view,
        value: tab,
        options: [
          { key: 'board', label: tr().tBoard },
          { key: 'milestones', label: tr().tMilestones },
          { key: 'sprints', label: tr().tSprints },
          { key: 'burndown', label: tr().tBurndown },
          { key: 'details', label: tr().tDetails },
        ],
        onChange: (k) => {
          tab = k as Tab
          drawProject()
        },
      }).el,
    )
    body.replaceChildren()
    if (tab === 'details') return drawDetails(p)
    if (tab === 'milestones') return drawMilestones(p)
    if (boardError) {
      body.append(
        tasksMissing(boardError)
          ? emptyState({ art: 'tasks', title: tr().tasksMissingTitle, text: tr().tasksMissingText })
          : emptyState({ art: 'projects', title: errText(boardError, msk.context?.lang) }),
      )
      return
    }
    if (!board) {
      body.append(skeleton({ kind: 'cards', count: 3 }))
      return
    }
    if (tab === 'sprints') return drawSprints(p, board)
    if (tab === 'burndown') return void drawBurndown(p)
    drawBoard(p, board)
  }

  // ----------------------------------------------------------------------------------------------------- board
  const taskMeta = (t: Task) => {
    const meta = el('div', { class: 'pj-chips' })
    if (t.done) meta.append(el('span', { class: 'pj-donemark' }, tr().doneMark))
    if (t.due) meta.append(el('span', { class: 'pj-due' }, sub(tr().due, { d: day(t.due) })))
    const pr = t.priority === 'high' || t.priority === 'low' || t.priority === 'medium' ? t.priority : ''
    if (pr) meta.append(chip(tr()[pr], pr === 'high' ? 'err' : ''))
    return meta
  }

  const moveTask = async (p: Proj, t: Task, column: string, position?: number, sprint?: string | null) => {
    try {
      const args: Record<string, unknown> = { id: p.id, task: t.id, column }
      if (position !== undefined) args.position = position
      if (sprint !== undefined) args.sprint = sprint
      await msk.call('projects.move', args)
      await loadBoard()
      if (sprint === undefined) toast(sub(tr().moved, { t: t.title, c: column }), { tone: 'ok' })
    } catch (e) {
      fail(e)
    }
  }

  const addTask = async (p: Proj, column: string, input: HTMLInputElement) => {
    const title = input.value.trim()
    if (!title) return input.focus()
    input.disabled = true
    try {
      await msk.call('projects.add_task', { id: p.id, title, column })
      await loadBoard()
    } catch (e) {
      fail(e)
      input.disabled = false
    }
  }

  const attachDialog = (p: Proj) => {
    const q = el('input', { type: 'search', 'aria-label': tr().searchTasks, placeholder: tr().searchTasks })
    const list = el('div', { class: 'pj-pick' })
    const picked = new Set<string>()
    const go = button(tr().attachGo)
    const no = button(tr().cancel, 'ghost')
    const d = dialog({ title: tr().attachTitle, body: el('div', { class: 'pj-form' }, el('p', { class: 'pj-dim' }, tr().attachHint), q, list), actions: [no, go] })
    no.addEventListener('click', d.close)
    const drawCandidates = (rows: Candidate[]) => {
      list.replaceChildren()
      if (!rows.length) list.append(el('p', { class: 'pj-dim' }, tr().attachNone))
      for (const r of rows) {
        const box = el('input', { type: 'checkbox' })
        box.checked = picked.has(r.id)
        box.addEventListener('change', () => (box.checked ? picked.add(r.id) : picked.delete(r.id)))
        list.append(el('label', { class: 'pj-pickrow' }, box, el('span', {}, r.title), r.due ? el('span', { class: 'pj-dim' }, day(r.due)) : ''))
      }
    }
    let timer = 0
    const search = async () => {
      try {
        drawCandidates(await msk.call<Candidate[]>('projects.candidates', { id: p.id, q: q.value }))
      } catch (e) {
        d.close()
        fail(e)
      }
    }
    q.addEventListener('input', () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void search(), 250)
    })
    go.addEventListener('click', async () => {
      if (!picked.size) return toast(tr().pickOne, { tone: 'err' })
      go.disabled = true
      try {
        const r = await msk.call<{ changed: number }>('projects.attach', { id: p.id, tasks: [...picked] })
        d.close()
        toast(sub(tr().attached, { n: r.changed }), { tone: 'ok' })
        await loadBoard()
      } catch (e) {
        fail(e)
        go.disabled = false
      }
    })
    void search()
    q.focus()
  }

  const drawBoard = (p: Proj, b: Board) => {
    const writable = canWrite(p)
    const tasks = b.columns.flatMap((c) => c.tasks)
    const bar = el('div', { class: 'pj-bar' })
    if (writable) bar.append(button(tr().attachExisting, '', () => attachDialog(p)))
    else bar.append(el('p', { class: 'pj-dim' }, tr().readOnly))
    const sprintName = (id: string | null) => p.sprints.find((s) => s.id === id)?.name ?? ''
    const kb = kanban<Task>({
      label: tr().tBoard,
      columns: b.columns.map((c) => ({ key: c.name, label: c.name })),
      columnOf: (t) => t.column,
      id: (t) => t.id,
      title: (t) => t.title,
      canMove: () => writable,
      emptyText: tr().colEmpty,
      movedText: sub(tr().moved, { t: '{title}', c: '{column}' }),
      onMove: (t, column, index) => void moveTask(p, t, column, index),
      card: (t) => {
        const card = el('div', { class: 'pj-task', 'data-testid': 'task' }, el('div', { class: 'pj-ttitle' }, t.title), taskMeta(t))
        if (t.sprint) card.append(el('div', { class: 'pj-dim' }, sub(tr().inSprint, { s: sprintName(t.sprint) })))
        if (writable) {
          const mv = el('button', { type: 'button', class: 'msk-btn ghost mini', 'aria-label': `${tr().moveTo} ${t.title}` }, tr().moveTo)
          mv.addEventListener('click', () =>
            menu(
              mv,
              b.columns.map((c) => ({ label: c.name, disabled: c.name === t.column, onClick: () => void moveTask(p, t, c.name) })),
            ),
          )
          card.append(mv)
        }
        return card
      },
    })
    kb.set(tasks)
    // the placeholder of an empty column sits in a role=list: it must be a list item too (axe: aria-required-children)
    for (const e of kb.el.querySelectorAll('.msk-colempty')) e.setAttribute('role', 'listitem')
    if (writable) {
      for (const sec of kb.el.querySelectorAll<HTMLElement>('.msk-kcol')) {
        const column = sec.dataset.col ?? ''
        const input = el('input', { type: 'text', maxlength: '500', 'aria-label': sub(tr().addTaskIn, { c: column }), placeholder: tr().addPlaceholder })
        const add = el('button', { type: 'submit', class: 'msk-btn ghost mini', 'aria-label': `${tr().add} ${column}` }, tr().add)
        const form = el('form', { class: 'pj-add' }, input, add)
        form.addEventListener('submit', (ev) => {
          ev.preventDefault()
          void addTask(p, column, input)
        })
        sec.append(form)
      }
    }
    body.append(bar, el('div', { class: 'pj-boardwrap' }, kb.el))
  }

  // ------------------------------------------------------------------------------------------------ milestones
  const milestoneForm = (p: Proj, existing?: Milestone) => {
    const name = el('input', { type: 'text', maxlength: '80', 'aria-label': tr().mName, placeholder: tr().mName })
    name.value = existing?.name ?? ''
    let date = existing?.date ?? ''
    const dateF = dateField({ label: tr().mDate, value: date, onChange: (v) => (date = v) })
    const ok = button(existing ? tr().save : tr().create)
    const no = button(tr().cancel, 'ghost')
    const d = dialog({ title: existing ? tr().mEdit : tr().mNew, body: el('div', { class: 'pj-form' }, field(tr().mName, name), field(tr().mDate, dateF.el)), actions: [no, ok] })
    no.addEventListener('click', d.close)
    ok.addEventListener('click', async () => {
      if (!name.value.trim() || !date) return toast(tr().mNeed, { tone: 'err' })
      ok.disabled = true
      const m: Milestone = { id: existing?.id ?? newId('m'), name: name.value.trim(), date, done: existing?.done ?? false }
      const list = existing ? p.milestones.map((x) => (x.id === m.id ? m : x)) : [...p.milestones, m]
      try {
        await save(p, { milestones: JSON.stringify(list) })
        d.close()
        drawProject()
      } catch (e) {
        fail(e)
        ok.disabled = false
      }
    })
    name.focus()
  }

  const writeMilestones = async (p: Proj, list: Milestone[]) => {
    try {
      await save(p, { milestones: JSON.stringify(list) })
    } catch (e) {
      fail(e)
    }
    drawProject()
  }

  const drawMilestones = (p: Proj) => {
    const writable = canWrite(p)
    const bar = el('div', { class: 'pj-bar' })
    if (writable) bar.append(button(tr().mAdd, '', () => milestoneForm(p)))
    body.append(bar)
    if (!p.milestones.length) {
      body.append(emptyState({ art: 'projects', title: tr().mEmptyTitle, text: tr().mEmptyText, actions: writable ? [button(tr().mAdd, '', () => milestoneForm(p))] : [] }))
      return
    }
    const today = todayLocal()
    const ul = el('ul', { class: 'pj-list' })
    for (const m of p.milestones) {
      const box = el('input', { type: 'checkbox', 'aria-label': sub(tr().mDoneAria, { n: m.name }) })
      box.checked = m.done
      box.disabled = !writable
      box.addEventListener('change', () => void writeMilestones(p, p.milestones.map((x) => (x.id === m.id ? { ...x, done: box.checked } : x))))
      const li = el('li', { class: 'pj-item' + (m.done ? ' done' : ''), 'data-testid': 'milestone' }, box, el('span', { class: 'pj-iname' }, m.name), el('span', { class: 'pj-dim' }, day(m.date)))
      if (isOverdue(m, today)) li.append(chip(tr().overdue, 'err'))
      if (writable) {
        li.append(
          button(tr().edit, 'ghost mini', () => milestoneForm(p, m)),
          button(tr().remove, 'ghost mini danger-text', async () => {
            if (await confirmDialog({ title: tr().remove, text: sub(tr().removeConfirm, { n: m.name }), ok: tr().remove, cancel: tr().cancel, danger: true })) await writeMilestones(p, p.milestones.filter((x) => x.id !== m.id))
          }),
        )
      }
      ul.append(li)
    }
    body.append(ul)
  }

  // --------------------------------------------------------------------------------------------------- sprints
  const sprintForm = (p: Proj, existing?: Sprint) => {
    const name = el('input', { type: 'text', maxlength: '60', 'aria-label': tr().sName, placeholder: tr().sName })
    name.value = existing?.name ?? ''
    let start = existing?.start ?? ''
    let end = existing?.end ?? ''
    const startF = dateField({ label: tr().sStart, value: start, onChange: (v) => (start = v) })
    const endF = dateField({ label: tr().sEnd, value: end, onChange: (v) => (end = v) })
    const ok = button(existing ? tr().save : tr().create)
    const no = button(tr().cancel, 'ghost')
    const d = dialog({
      title: existing ? tr().sEdit : tr().sNew,
      body: el('div', { class: 'pj-form' }, field(tr().sName, name), el('div', { class: 'pj-row' }, field(tr().sStart, startF.el), field(tr().sEnd, endF.el))),
      actions: [no, ok],
    })
    no.addEventListener('click', d.close)
    ok.addEventListener('click', async () => {
      if (!name.value.trim() || !start || !end) return toast(tr().sNeed, { tone: 'err' })
      if (end < start) return toast(tr().sEnd2, { tone: 'err' })
      ok.disabled = true
      const s: Sprint = { id: existing?.id ?? newId('s'), name: name.value.trim(), start, end }
      const list = existing ? p.sprints.map((x) => (x.id === s.id ? s : x)) : [...p.sprints, s]
      try {
        await save(p, { sprints: JSON.stringify(list) })
        d.close()
        await loadBoard()
      } catch (e) {
        fail(e)
        ok.disabled = false
      }
    })
    name.focus()
  }

  const drawSprints = (p: Proj, b: Board) => {
    const writable = canWrite(p)
    const bar = el('div', { class: 'pj-bar' })
    if (writable) bar.append(button(tr().sAdd, '', () => sprintForm(p)))
    body.append(bar)
    if (!p.sprints.length) {
      body.append(emptyState({ art: 'projects', title: tr().sEmptyTitle, text: tr().sEmptyText, actions: writable ? [button(tr().sAdd, '', () => sprintForm(p))] : [] }))
      return
    }
    const tasks = b.columns.flatMap((c) => c.tasks)
    const now = currentSprint(p.sprints, todayLocal())
    const picker = (t: Task) => {
      const sel = el('select', { 'aria-label': sub(tr().sprintOf, { t: t.title }) })
      sel.append(el('option', { value: '' }, tr().noSprint))
      for (const s of p.sprints) sel.append(el('option', { value: s.id }, s.name))
      sel.value = t.sprint ?? ''
      sel.disabled = !writable
      sel.addEventListener('change', () => void moveTask(p, t, t.column, undefined, sel.value || null))
      return sel
    }
    const row = (t: Task) => el('li', { class: 'pj-item' + (t.done ? ' done' : ''), 'data-testid': 'sprint-task' }, el('span', { class: 'pj-iname' }, t.title), t.done ? el('span', { class: 'pj-donemark' }, tr().doneMark) : '', picker(t))
    const wrap = el('div', { class: 'pj-sprints' })
    for (const s of p.sprints) {
      const stat = b.per_sprint.find((x) => x.id === s.id) ?? { done: 0, total: 0 }
      const sec = el('section', { class: 'pj-sprint' + (s.id === now?.id ? ' current' : ''), 'data-testid': 'sprint' })
      const title = el('div', { class: 'pj-cardhead' }, el('h2', {}, s.name), s.id === now?.id ? chip(tr().current, 'acc') : '')
      sec.append(title, el('p', { class: 'pj-meta' }, sub(tr().dates, { a: day(s.start), b: day(s.end) }) + ' · ' + sub(tr().sprintCount, { d: stat.done, t: stat.total })))
      sec.append(progress({ value: stat.done, max: stat.total, label: s.name }))
      if (writable) {
        sec.append(
          el(
            'div',
            { class: 'pj-acts' },
            button(tr().edit, 'ghost mini', () => sprintForm(p, s)),
            button(tr().remove, 'ghost mini danger-text', async () => {
              if (!(await confirmDialog({ title: tr().remove, text: sub(tr().removeConfirm, { n: s.name }), ok: tr().remove, cancel: tr().cancel, danger: true }))) return
              try {
                await save(p, { sprints: JSON.stringify(p.sprints.filter((x) => x.id !== s.id)) })
                await loadBoard()
              } catch (e) {
                fail(e)
              }
            }),
          ),
        )
      }
      const mine = tasks.filter((t) => t.sprint === s.id)
      const ul = el('ul', { class: 'pj-list' })
      if (!mine.length) ul.append(el('li', { class: 'pj-dim' }, tr().sNoTasks))
      for (const t of mine) ul.append(row(t))
      sec.append(ul)
      wrap.append(sec)
    }
    const free = tasks.filter((t) => !t.sprint)
    if (free.length) {
      const ul = el('ul', { class: 'pj-list' })
      for (const t of free) ul.append(row(t))
      wrap.append(el('section', { class: 'pj-sprint', 'data-testid': 'sprint-unassigned' }, el('div', { class: 'pj-cardhead' }, el('h2', {}, tr().unassigned)), ul))
    }
    body.append(wrap)
  }

  // ------------------------------------------------------------------------------------------------- burndown
  let burnSprint = ''
  const svgEl = (name: string, attrs: Record<string, string>, ...kids: (SVGElement | string)[]) => {
    const e = document.createElementNS('http://www.w3.org/2000/svg', name)
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
    e.append(...kids)
    return e
  }

  const drawBurndown = async (p: Proj) => {
    const box = el('div', { class: 'pj-burn' })
    const sel = el('select', { 'aria-label': tr().burnScope, 'data-testid': 'burn-scope' })
    sel.append(el('option', { value: '' }, tr().burnProject))
    for (const s of p.sprints) sel.append(el('option', { value: s.id }, s.name))
    if (!p.sprints.some((s) => s.id === burnSprint)) burnSprint = ''
    sel.value = burnSprint
    sel.addEventListener('change', () => {
      burnSprint = sel.value
      void drawBurndown(p)
    })
    body.append(el('div', { class: 'pj-bar' }, el('label', {}, tr().burnScope + ' '), sel), box)
    box.append(skeleton({ kind: 'cards', count: 1 }))
    let b: Burndown
    try {
      b = await msk.call<Burndown>('projects.burndown', { id: p.id, ...(burnSprint ? { sprint: burnSprint } : {}) })
    } catch (e) {
      if (current()?.id === p.id && tab === 'burndown') box.replaceChildren(el('p', { class: 'pj-dim' }, errText(e, msk.context?.lang)))
      return
    }
    if (current()?.id !== p.id || tab !== 'burndown') return
    if (!b.available || !b.days?.length) {
      box.replaceChildren(emptyState({ art: 'projects', title: tr().burnNoDatesTitle, text: tr().burnNoDatesText }))
      return
    }
    if (!b.total) {
      box.replaceChildren(emptyState({ art: 'projects', title: tr().burnNoTasksTitle, text: tr().burnNoTasksText }))
      return
    }
    const g = chartGeometry(b.days, b.total)
    const last = [...b.days].reverse().find((d) => d.remaining !== null)
    const diff = behindBy(b.days)
    const status = diff === null ? '' : diff > 0.5 ? sub(tr().burnBehind, { n: Math.round(diff) }) : diff < -0.5 ? sub(tr().burnAhead, { n: Math.round(-diff) }) : tr().burnOnTrack
    const summary = sub(tr().burnSummary, { r: last?.remaining ?? b.total, t: b.total, d: b.done ?? 0 })
    const svg = svgEl('svg', { viewBox: `0 0 ${g.width} ${g.height}`, class: 'pj-chart', role: 'img', 'aria-label': `${summary}. ${status}`, 'data-testid': 'burndown-chart' })
    for (const t of g.ticks) {
      svg.append(svgEl('line', { x1: String(g.left), x2: String(g.right), y1: String(t.y), y2: String(t.y), class: 'pj-grid' }), svgEl('text', { x: String(g.left - 6), y: String(t.y + 4), class: 'pj-axis', 'text-anchor': 'end' }, String(t.value)))
    }
    svg.append(
      svgEl('text', { x: String(g.left), y: String(g.height - 12), class: 'pj-axis' }, day(b.from ?? '')),
      svgEl('text', { x: String(g.right), y: String(g.height - 12), class: 'pj-axis', 'text-anchor': 'end' }, day(b.to ?? '')),
      svgEl('polyline', { points: pointsAttr(g.ideal), class: 'pj-line ideal', fill: 'none' }),
      svgEl('polyline', { points: pointsAttr(g.actual), class: 'pj-line actual', fill: 'none' }),
    )
    const legend = el('ul', { class: 'pj-legend' }, el('li', { class: 'ideal' }, tr().burnIdeal), el('li', { class: 'actual' }, tr().burnActual))
    const notes = el('div', { class: 'pj-dim' })
    if (b.undated) notes.append(el('p', {}, sub(tr().burnUndated, { n: b.undated })))
    notes.append(el('p', {}, tr().burnScopeNote))
    box.replaceChildren(el('p', { class: 'pj-summary', 'data-testid': 'burn-summary' }, summary + (status ? ' · ' + status : '')), svg, legend, notes)
  }

  // ---------------------------------------------------------------------------------------------------- details
  const drawDetails = (p: Proj) => {
    const writable = canWrite(p)
    const name = el('input', { type: 'text', maxlength: '80', 'aria-label': tr().dName })
    const desc = el('textarea', { rows: '4', 'aria-label': tr().dDesc })
    const status = el('select', { 'aria-label': tr().dStatus })
    for (const s of STATUSES) status.append(el('option', { value: s }, tr()[s]))
    const cols = el('textarea', { rows: '5', 'aria-label': tr().dColumns })
    name.value = p.name
    desc.value = p.description
    status.value = p.status
    cols.value = columnsToText(p.columns)
    let from = p.startsOn
    let until = p.endsOn
    const fromField = dateField({ label: tr().dStart, value: from, onChange: (v) => (from = v) })
    const untilField = dateField({ label: tr().dEnd, value: until, onChange: (v) => (until = v) })
    for (const i of [name, desc, status, cols]) i.disabled = !writable
    const form = el(
      'div',
      { class: 'pj-form pj-details' },
      field(tr().dName, name),
      field(tr().dDesc, desc),
      el('div', { class: 'pj-row' }, field(tr().dStatus, status), field(tr().dStart, fromField.el), field(tr().dEnd, untilField.el)),
      field(tr().dColumns, cols),
      el('p', { class: 'pj-dim' }, tr().dColumnsHint + ' ' + tr().dNameHint),
    )
    const acts = el('div', { class: 'pj-acts' })
    if (writable) {
      acts.append(
        button(tr().save, '', async () => {
          if (!name.value.trim()) {
            toast(tr().needName, { tone: 'err' })
            return name.focus()
          }
          try {
            // the tasks carry the NAME of the project: a new name is written again on the tasks of the board
            const renamed = name.value.trim() !== p.name
            const ids = renamed && board ? board.columns.flatMap((c) => c.tasks.map((t) => t.id)) : []
            await save(p, {
              name: name.value.trim(),
              description: desc.value,
              status: status.value,
              starts_on: from,
              ends_on: until,
              columns: JSON.stringify(columnsFromText(cols.value)),
            })
            for (let i = 0; i < ids.length; i += 100) await msk.call('projects.attach', { id: p.id, tasks: ids.slice(i, i + 100) })
            toast(tr().saved, { tone: 'ok' })
            await loadBoard()
          } catch (e) {
            fail(e)
          }
        }),
      )
    }
    if (p.row.my_level === 'manage') {
      acts.append(
        button(tr().share, 'ghost', () => void msk.share(p.id).catch(fail)),
        button(tr().del, 'ghost danger-text', async () => {
          if (!(await confirmDialog({ title: tr().del, text: sub(tr().delConfirm, { n: p.name }), ok: tr().del, cancel: tr().cancel, danger: true }))) return
          try {
            await api.remove(p.id)
            await loadList()
          } catch (e) {
            fail(e)
          }
        }),
      )
    }
    body.append(form, acts)
  }

  msk.onContext((ctx) => {
    if (langOf(ctx.lang) === lang) return
    lang = langOf(ctx.lang)
    if (openId) drawProject()
    else drawList()
  })
  void msk.loading(loadList())
}

connect()
  .then(mount)
  .catch((e) => {
    app.textContent = TEXTS[langOf(undefined)].failed + errText(e)
  })
