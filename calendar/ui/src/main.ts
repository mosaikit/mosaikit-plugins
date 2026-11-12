// UI of the Calendar plugin: month, week and day views of the events (recurrence is expanded by the command `events.range`, which also
// returns the due dates of Tasks), the form of an event with its invitees, the detail with the answers to the invitation and the list of
// my invitations. Times are floating local times: nothing is converted here. Colour is never the only signal: every chip has its text.
import '@mosaikit/plugin-api/style.css'
import './calendar.css'
import {
  avatar,
  confirmDialog,
  connect,
  dialog,
  el,
  emptyState,
  errText,
  personPicker,
  popover,
  segmented,
  skeleton,
  toast,
  type Msk,
  type Row,
} from '@mosaikit/plugin-api'
import {
  COLORS,
  HOUR_PX,
  REPEATS,
  addDays,
  addPerson,
  answerMark,
  arrowTarget,
  chipText,
  colorOf,
  endAfter,
  fixEnd,
  icsCalendar,
  icsName,
  icsStamp,
  isDate,
  isTime,
  isoOf,
  layoutDay,
  longDate,
  monthGrid,
  parsePeople,
  peopleJson,
  periodTitle,
  rangeFor,
  removePerson,
  repeatOf,
  shift,
  spread,
  timeRange,
  viewKey,
  weekDays,
  weekdayNames,
  type IcsEvent,
  type Occ,
  type Person,
  type Seg,
  type TaskDue,
  type View,
} from './logic.ts'
import { TEXTS, langOf, sub } from './texts.ts'

const app = document.getElementById('app')!

interface RangeAnswer {
  events: Occ[]
  tasks: TaskDue[]
  tasks_error: string | null
}
interface Invite {
  id: string
  title: string
  location: string
  start: string
  end: string
  starts_time: string
  ends_time: string
  all_day: boolean
  color: string
}
interface RsvpAnswer {
  attendees: Person[]
  answers: { user_id: string; name: string; answer: string; at: string }[]
}

const str = (r: Row, k: string) => (typeof r.values[k] === 'string' ? (r.values[k] as string) : '')
const dateOf = (r: Row, k: string) => str(r, k).slice(0, 10)

/** Saves a text as a file (the page is allowed to download). */
function save(text: string, name: string) {
  const u = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }))
  const a = el('a', { href: u, download: name, style: 'display:none' })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(u), 10000)
}

function mount(msk: Msk) {
  document.documentElement.classList.add('msk-fill')
  let lang = langOf(msk.context?.lang)
  const tr = () => TEXTS[lang]
  const api = msk.crud('events')
  const me = msk.user?.id ?? ''
  const todayIso = () => isoOf(new Date())

  let view: View = 'month'
  let anchor = todayIso()
  let showTasks = true
  let occs: Occ[] = []
  let tasks: TaskDue[] = []
  let tasksError = ''
  let invites: Invite[] = []
  let loaded = false
  let loadedRange = ''
  let seq = 0

  const fail = (e: unknown) => toast(errText(e, msk.context?.lang), { tone: 'err', ms: 6000 })
  const head = el('header', { class: 'cal-head' })
  const body = el('div', { class: 'cal-body' })
  app.replaceChildren(el('div', { class: 'cal' }, head, body))

  const isNarrow = () => window.matchMedia('(max-width: 640px)').matches
  const dayLong = (iso: string) => longDate(iso, msk.context?.lang || lang)
  const repeatLabel = (r: string) => {
    const t = tr()
    return ({ daily: t.repeatDaily, weekly: t.repeatWeekly, monthly: t.repeatMonthly, yearly: t.repeatYearly } as Record<string, string>)[r] ?? t.repeatNone
  }
  const colorLabel = (c: string) => (tr() as unknown as Record<string, string>)[colorOf(c)]
  const answerWord = (a: string) => (a === 'yes' ? tr().wordYes : a === 'no' ? tr().wordNo : a === 'maybe' ? tr().wordMaybe : tr().noAnswer)
  const answerName = (a: string) => (a === 'yes' ? tr().answerYes : a === 'no' ? tr().answerNo : tr().answerMaybe)

  // --------------------------------------------------------------------------------------------------------- data
  const loadInvites = async () => {
    try {
      invites = (await msk.call<{ invitations: Invite[] }>('events.invitations')).invitations
    } catch {
      invites = []
    }
    drawHead()
  }

  const load = async () => {
    const my = ++seq
    const { from, to } = rangeFor(view, anchor)
    if (!loaded) body.replaceChildren(skeleton({ kind: 'cards', count: 3 }))
    try {
      const r = await msk.call<RangeAnswer>('events.range', { from, to, tasks: showTasks })
      if (my !== seq) return
      occs = r.events
      tasks = showTasks ? r.tasks : []
      tasksError = showTasks && r.tasks_error ? r.tasks_error : ''
      loaded = true
      loadedRange = `${view}:${from}:${to}`
    } catch (e) {
      if (my !== seq) return
      body.textContent = tr().loadFailed + errText(e, msk.context?.lang)
      return
    }
    draw()
  }

  const reload = async () => {
    await Promise.all([load(), loadInvites()])
  }

  /** Moves to a day: without asking the data again when the view already has it. */
  const goTo = (iso: string, then?: () => void) => {
    anchor = iso
    const { from, to } = rangeFor(view, anchor)
    then?.()
    if (loadedRange === `${view}:${from}:${to}`) draw()
    else {
      draw()
      void load()
    }
  }

  const setView = (v: View) => {
    view = v
    draw()
    void load()
  }

  // ------------------------------------------------------------------------------------------------------ chips
  const eventChip = (s: Seg, cls = 'cal-chip') => {
    const o = s.occ
    const b = el('button', { type: 'button', class: `${cls} c-${colorOf(o.color)}`, 'data-testid': 'cal-event', title: [chipText(o), o.location].filter(Boolean).join(' · ') }, chipText(o, s.day))
    if (!s.first) b.prepend(el('span', { class: 'cal-cont', 'aria-hidden': 'true' }, '‹ '))
    if (o.invited && !o.mine) b.classList.add('pending')
    b.addEventListener('click', (ev) => {
      ev.stopPropagation()
      void openDetail(o)
    })
    return b
  }

  const taskChip = (t: TaskDue) =>
    el('span', { class: 'cal-task', 'data-testid': 'cal-task', title: sub(tr().taskDue, { t: t.title }) }, el('span', { class: 'cal-box', 'aria-hidden': 'true' }, '☐'), el('span', {}, t.title))

  const tasksOn = new Map<string, TaskDue[]>()
  const indexTasks = () => {
    tasksOn.clear()
    for (const t of tasks) tasksOn.set(t.due, [...(tasksOn.get(t.due) ?? []), t])
  }

  // ------------------------------------------------------------------------------------------------------- header
  function drawHead() {
    const t = tr()
    const nav = (label: string, glyph: string, dir: -1 | 1) => {
      const b = el('button', { type: 'button', class: 'msk-btn ghost mini cal-nav', 'aria-label': label, title: label }, glyph)
      b.addEventListener('click', () => goTo(shift(view, anchor, dir)))
      return b
    }
    const todayBtn = el('button', { type: 'button', class: 'msk-btn ghost mini' }, t.today)
    todayBtn.addEventListener('click', () => goTo(todayIso()))
    const seg = segmented({
      label: t.viewLabel,
      value: view,
      options: [
        { key: 'month', label: t.month },
        { key: 'week', label: t.week },
        { key: 'day', label: t.day },
      ],
      onChange: (k) => setView(k as View),
    })
    const sw = el('input', { type: 'checkbox', role: 'switch' })
    sw.checked = showTasks
    sw.addEventListener('change', () => {
      showTasks = sw.checked
      void load()
    })
    const inv = el('button', { type: 'button', class: 'msk-btn ghost mini cal-inv', 'data-testid': 'invitations' }, t.invitations)
    if (invites.length) inv.append(el('span', { class: 'cal-badge', 'data-testid': 'inv-badge' }, String(invites.length)))
    inv.addEventListener('click', openInvitations)
    const exp = el('button', { type: 'button', class: 'msk-btn ghost mini' }, t.export)
    exp.addEventListener('click', () => void exportMonth())
    const add = el('button', { type: 'button', class: 'msk-btn', 'data-testid': 'new-event' }, t.newEvent)
    add.addEventListener('click', () => eventForm({ date: anchor }))
    add.hidden = !msk.can('create')
    head.replaceChildren(
      el('h1', {}, t.title),
      el('div', { class: 'cal-navs' }, todayBtn, nav(t.prev, '‹', -1), nav(t.next, '›', 1)),
      el('h2', { class: 'cal-period', 'aria-live': 'polite', 'data-testid': 'period' }, periodTitle(view, anchor, msk.context?.lang || lang)),
      el('span', { class: 'cal-spacer' }),
      seg.el,
      el('label', { class: 'cal-switch' }, sw, el('span', {}, t.showTasks)),
      inv,
      exp,
      add,
    )
  }

  // ----------------------------------------------------------------------------------------------------- month
  const monthView = () => {
    const t = tr()
    const days = monthGrid(anchor)
    const by = spread(occs, days[0], days[41])
    const names = weekdayNames(msk.context?.lang || lang)
    const longNames = weekdayNames(msk.context?.lang || lang, 'long')
    const today = todayIso()
    const monthKey = anchor.slice(0, 7)
    const table = el('table', { class: 'cal-month', 'aria-label': periodTitle('month', anchor, msk.context?.lang || lang), 'data-testid': 'month' })
    const hr = el('tr', {})
    names.forEach((n, i) => hr.append(el('th', { scope: 'col', abbr: longNames[i] }, n)))
    table.append(el('thead', {}, hr))
    const tb = el('tbody', {})
    for (let w = 0; w < 6; w++) {
      const tr_ = el('tr', {})
      for (let c = 0; c < 7; c++) {
        const d = days[w * 7 + c]
        const segs = by.get(d) ?? []
        const due = tasksOn.get(d) ?? []
        const total = segs.length + due.length
        const cls = ['cal-cell']
        if (d.slice(0, 7) !== monthKey) cls.push('out')
        if (d === today) cls.push('today')
        if (d === anchor) cls.push('sel')
        const td = el('td', { class: cls.join(' '), 'data-day': d })
        const num = el(
          'button',
          { type: 'button', class: 'cal-num', tabindex: d === anchor ? '0' : '-1', 'aria-label': `${Number(d.slice(8))} ${total ? sub(t.dayOf, { d: dayLong(d), n: total }) : dayLong(d)}`, 'data-day': d },
          String(Number(d.slice(8))),
        )
        if (d === today) num.setAttribute('aria-current', 'date')
        num.addEventListener('click', (ev) => {
          ev.stopPropagation()
          if (isNarrow()) goTo(d)
          else {
            anchor = d
            eventForm({ date: d })
          }
        })
        num.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault()
            anchor = d
            setView('day')
            return
          }
          const to = arrowTarget(d, ev.key)
          if (!to) return
          ev.preventDefault()
          goTo(to)
        })
        td.addEventListener('click', () => {
          if (isNarrow()) goTo(d)
          else {
            anchor = d
            eventForm({ date: d })
          }
        })
        const chips = el('div', { class: 'cal-chips' })
        const items: HTMLElement[] = [...segs.map((s) => eventChip(s)), ...due.map(taskChip)]
        for (const it of items.slice(0, 3)) chips.append(it)
        if (items.length > 3) {
          const more = el('button', { type: 'button', class: 'cal-more', 'data-testid': 'cal-more' }, sub(t.more, { n: items.length - 3 }))
          more.addEventListener('click', (ev) => {
            ev.stopPropagation()
            const list = el('div', { class: 'cal-pop' }, el('strong', {}, dayLong(d)))
            const pop = popover(more, list)
            for (const s of segs) {
              const b = eventChip(s, 'cal-chip')
              b.addEventListener('click', () => pop.close())
              list.append(b)
            }
            for (const x of due) list.append(taskChip(x))
          })
          chips.append(more)
        }
        const dots = el('div', { class: 'cal-dots', 'aria-hidden': 'true' })
        for (const s of segs.slice(0, 4)) dots.append(el('span', { class: `cal-dot c-${colorOf(s.occ.color)}` }))
        if (due.length) dots.append(el('span', { class: 'cal-dot task' }))
        td.append(num, chips, dots)
        tr_.append(td)
      }
      tb.append(tr_)
    }
    table.append(tb)
    // narrow screens: the selected day as a list below the grid
    const segs = by.get(anchor) ?? []
    const due = tasksOn.get(anchor) ?? []
    const list = el('ul', { class: 'cal-lilist' })
    for (const s of segs) {
      const o = s.occ
      const b = el('button', { type: 'button', class: `cal-li c-${colorOf(o.color)}` }, el('strong', {}, o.title), el('span', {}, [timeRange(o) || t.allDay, o.location].filter(Boolean).join(' · ')))
      b.addEventListener('click', () => void openDetail(o))
      list.append(el('li', {}, b))
    }
    for (const x of due) list.append(el('li', {}, taskChip(x)))
    if (!list.children.length) list.append(el('li', { class: 'cal-dim' }, t.noEventsDay))
    const add = el('button', { type: 'button', class: 'msk-btn ghost mini' }, t.newEvent)
    add.addEventListener('click', () => eventForm({ date: anchor }))
    add.hidden = !msk.can('create')
    const daylist = el('section', { class: 'cal-daylist', 'aria-label': dayLong(anchor) }, el('h3', {}, dayLong(anchor)), list, add)
    return [table, daylist]
  }

  // ------------------------------------------------------------------------------------------ week and day grid
  const timeGrid = (days: string[]) => {
    const t = tr()
    const by = spread(occs, days[0], days[days.length - 1])
    const today = todayIso()
    const names = weekdayNames(msk.context?.lang || lang)
    const wrap = el('div', { class: `cal-tg ${days.length === 1 ? 'one' : 'seven'}`, style: `--cols:${days.length}`, 'data-testid': days.length === 1 ? 'day-view' : 'week-view' })
    const heads = el('div', { class: 'cal-tg-head' }, el('span', { class: 'cal-corner' }))
    const allday = el('div', { class: 'cal-tg-allday' }, el('span', { class: 'cal-corner cal-dim' }, t.allDay))
    const cols = el('div', { class: 'cal-tg-cols' })
    const hours = el('div', { class: 'cal-hours', 'aria-hidden': 'true' })
    for (let h = 0; h < 24; h++) hours.append(el('span', { style: `top:${h * HOUR_PX}px` }, h ? `${String(h).padStart(2, '0')}:00` : ''))
    cols.append(hours)
    for (const d of days) {
      const segs = by.get(d) ?? []
      const label = days.length === 1 ? dayLong(d) : `${names[(new Date(`${d}T12:00`).getDay() + 6) % 7]} ${Number(d.slice(8))}`
      const hb = el('button', { type: 'button', class: `cal-dayhead${d === today ? ' today' : ''}`, title: dayLong(d) }, label)
      if (d === today) hb.setAttribute('aria-current', 'date')
      hb.addEventListener('click', () => {
        if (view === 'day') return
        anchor = d
        setView('day')
      })
      heads.append(el('div', { class: 'cal-hcell' }, hb))
      const cell = el('div', { class: 'cal-acell' })
      for (const s of segs.filter((x) => x.startMin === null)) cell.append(eventChip(s))
      for (const x of tasksOn.get(d) ?? []) cell.append(taskChip(x))
      allday.append(cell)
      const col = el('div', { class: `cal-col${d === today ? ' today' : ''}`, 'data-day': d, style: `height:${24 * HOUR_PX}px` })
      col.addEventListener('click', (ev) => {
        if (ev.target !== col && !(ev.target as HTMLElement).classList.contains('cal-now')) return
        const y = ev.clientY - col.getBoundingClientRect().top
        const h = Math.max(0, Math.min(23, Math.floor(y / HOUR_PX)))
        eventForm({ date: d, time: `${String(h).padStart(2, '0')}:00` })
      })
      const timed = segs.filter((x): x is Seg & { startMin: number; endMin: number } => x.startMin !== null && x.endMin !== null)
      for (const p of layoutDay(timed)) {
        const s = p.item
        const o = s.occ
        const b = el(
          'button',
          { type: 'button', class: `cal-ev c-${colorOf(o.color)}${o.invited && !o.mine ? ' pending' : ''}`, 'data-testid': 'cal-event', title: [chipText(o), o.location].filter(Boolean).join(' · ') },
          el('span', { class: 'cal-ev-t' }, timeRange(o)),
          el('span', { class: 'cal-ev-n' }, o.title),
        )
        b.style.top = `${(s.startMin / 60) * HOUR_PX}px`
        b.style.height = `${Math.max(22, ((s.endMin - s.startMin) / 60) * HOUR_PX - 2)}px`
        b.style.left = `calc(${(p.col / p.cols) * 100}% + 2px)`
        b.style.width = `calc(${100 / p.cols}% - 4px)`
        b.addEventListener('click', (ev) => {
          ev.stopPropagation()
          void openDetail(o)
        })
        col.append(b)
      }
      if (d === today) {
        const now = new Date()
        const line = el('div', { class: 'cal-now', 'data-testid': 'now-line', 'aria-hidden': 'true' })
        line.style.top = `${((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX}px`
        col.append(line)
      }
      cols.append(col)
    }
    const scroll = el('div', { class: 'cal-tg-scroll', tabindex: '0', role: 'region', 'aria-label': periodTitle(view, anchor, msk.context?.lang || lang) }, cols)
    wrap.append(heads, allday, scroll)
    // open at the working hours, or around now when today is shown
    const now = new Date()
    const startHour = days.includes(today) ? Math.max(0, now.getHours() - 1) : 7
    setTimeout(() => (scroll.scrollTop = startHour * HOUR_PX), 0)
    return [wrap]
  }

  // --------------------------------------------------------------------------------------------------------- draw
  function draw() {
    drawHead()
    indexTasks()
    if (!loaded) return
    const nodes: HTMLElement[] = []
    if (tasksError) nodes.push(el('p', { class: 'cal-warn', role: 'status' }, tr().tasksFailed + tasksError))
    nodes.push(...(view === 'month' ? monthView() : view === 'week' ? timeGrid(weekDays(anchor)) : timeGrid([anchor])))
    if (!occs.length && !tasks.length) {
      nodes.push(el('div', { class: 'cal-hint' }, emptyState({ art: 'calendar', title: tr().emptyTitle, text: tr().emptyText })))
    }
    // the keyboard stays on the day grid while the arrows move through it
    const keep = document.activeElement?.classList.contains('cal-num') === true
    body.replaceChildren(...nodes)
    if (keep) body.querySelector<HTMLElement>(`.cal-num[data-day="${anchor}"]`)?.focus()
  }

  // ------------------------------------------------------------------------------------------------ the event form
  function eventForm(o: { date: string; time?: string; row?: Row }) {
    const t = tr()
    const row = o.row
    const v = row?.values ?? {}
    const s = (k: string) => (typeof v[k] === 'string' ? (v[k] as string) : '')
    const sd = (k: string) => s(k).slice(0, 10)
    let people: Person[] = parsePeople(v.attendees)
    let color = colorOf(v.color)
    let endTouched = !!row

    const title = el('input', { type: 'text', maxlength: '160', 'aria-label': t.fTitle, placeholder: t.fTitle })
    title.value = s('title')
    const allDay = el('input', { type: 'checkbox', id: 'cal-allday' })
    allDay.checked = row ? v.all_day === true : false
    const startDate = el('input', { type: 'date', 'aria-label': t.fStartDate })
    startDate.value = row ? sd('starts_on') : o.date
    const startTime = el('input', { type: 'time', 'aria-label': t.fStartTime })
    startTime.value = row ? s('starts_time') : (o.time ?? '')
    const endDate = el('input', { type: 'date', 'aria-label': t.fEndDate })
    endDate.value = row ? sd('ends_on') || sd('starts_on') : o.date
    const endTime = el('input', { type: 'time', 'aria-label': t.fEndTime })
    endTime.value = row ? s('ends_time') : o.time ? endAfter(o.time) : ''
    const location = el('input', { type: 'text', maxlength: '200', 'aria-label': t.fLocation, placeholder: t.fLocation })
    location.value = s('location')
    const details = el('textarea', { rows: '4', maxlength: '4000', 'aria-label': t.fDetails, placeholder: t.fDetails })
    details.value = s('details')
    const repeat = el('select', { 'aria-label': t.fRepeat })
    for (const r of REPEATS) repeat.append(el('option', { value: r }, repeatLabel(r)))
    repeat.value = repeatOf(v.repeat)
    const until = el('input', { type: 'date', 'aria-label': t.fUntil })
    until.value = sd('repeat_until')
    const untilBox = el('div', { class: 'msk-field' }, el('label', {}, t.fUntil), until)

    const timeBox = el('div', { class: 'cal-times' })
    const syncTimes = () => {
      timeBox.hidden = allDay.checked
    }
    const syncUntil = () => {
      untilBox.hidden = repeat.value === 'none'
    }
    const fix = () => {
      const f = fixEnd({ starts_on: startDate.value, starts_time: startTime.value, ends_on: endDate.value, ends_time: endTime.value, all_day: allDay.checked })
      if (startDate.value) endDate.value = f.ends_on
      endTime.value = f.ends_time
    }
    allDay.addEventListener('change', syncTimes)
    repeat.addEventListener('change', syncUntil)
    startDate.addEventListener('change', () => {
      if (!endTouched) endDate.value = startDate.value
      fix()
    })
    startTime.addEventListener('input', () => {
      if (!endTouched && isTime(startTime.value)) endTime.value = endAfter(startTime.value)
      fix()
    })
    endDate.addEventListener('change', () => {
      endTouched = true
      fix()
    })
    endTime.addEventListener('change', () => {
      endTouched = true
      fix()
    })
    const field = (label: string, input: HTMLElement) => el('div', { class: 'msk-field' }, el('label', {}, label), input)
    timeBox.append(field(t.fStartTime, startTime), field(t.fEndTime, endTime))

    // colour: swatches with the name as text for who cannot tell colours apart
    const swatches = el('div', { class: 'cal-swatches', role: 'group', 'aria-label': t.fColor })
    const drawSwatches = () => {
      swatches.replaceChildren()
      for (const c of COLORS) {
        const b = el('button', { type: 'button', class: `cal-sw c-${c}`, 'aria-pressed': String(c === color), title: colorLabel(c) }, el('span', { class: 'cal-sw-dot' }, c === color ? '✓' : ''), el('span', {}, colorLabel(c)))
        b.addEventListener('click', () => {
          color = c
          drawSwatches()
          swatches.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus()
        })
        swatches.append(b)
      }
    }
    drawSwatches()

    // invitees
    const list = el('ul', { class: 'cal-people', 'aria-label': t.fInvitees })
    const drawPeople = () => {
      list.replaceChildren()
      if (!people.length) list.append(el('li', { class: 'cal-dim' }, t.noInvitees))
      for (const p of people) {
        const rm = el('button', { type: 'button', class: 'msk-btn ghost mini', 'aria-label': `${t.removeInvitee}: ${p.name}` }, '×')
        rm.addEventListener('click', () => {
          people = removePerson(people, p.id)
          drawPeople()
        })
        list.append(el('li', { class: 'cal-person' }, avatar(p.name), el('strong', {}, p.name), rm))
      }
    }
    drawPeople()
    const picker = personPicker({
      label: t.addInvitee,
      placeholder: t.addInvitee,
      noneLabel: t.noneFound,
      clearLabel: t.removeInvitee,
      value: null,
      search: (q) => msk.directory.search({ kind: 'user', q }),
      onChange: (u) => {
        if (!u) return
        people = addPerson(people, { id: u.id, name: u.name })
        drawPeople()
        // ready for the next person
        setTimeout(() => {
          picker.set(null)
          const input = picker.el.querySelector('input')
          if (input) {
            input.value = ''
            input.focus()
          }
          const results = picker.el.querySelector<HTMLElement>('.msk-person-list')
          if (results) {
            results.replaceChildren()
            results.hidden = true
          }
        }, 0)
      },
    })

    syncTimes()
    syncUntil()
    const ok = el('button', { type: 'button', class: 'msk-btn' }, row ? t.save : t.create)
    const no = el('button', { type: 'button', class: 'msk-btn ghost' }, t.cancel)
    const d = dialog({
      title: row ? t.editTitle : t.newTitle,
      body: el(
        'div',
        { class: 'cal-form' },
        field(t.fTitle, title),
        el('label', { class: 'cal-check', for: 'cal-allday' }, allDay, el('span', {}, t.fAllDay)),
        el('div', { class: 'cal-dates' }, field(t.fStartDate, startDate), field(t.fEndDate, endDate)),
        timeBox,
        el('p', { class: 'cal-dim' }, t.timesNote),
        field(t.fLocation, location),
        field(t.fDetails, details),
        el('div', { class: 'cal-dates' }, field(t.fRepeat, repeat), untilBox),
        row && repeatOf(v.repeat) !== 'none' ? el('p', { class: 'cal-dim' }, t.seriesNote) : '',
        el('div', { class: 'msk-field' }, el('label', {}, t.fColor), swatches),
        el('div', { class: 'cal-pick' }, el('strong', {}, t.fInvitees), picker.el, list, el('p', { class: 'cal-dim' }, t.shareNote)),
      ),
      actions: [no, ok],
    })
    no.addEventListener('click', d.close)
    ok.addEventListener('click', async () => {
      if (!title.value.trim()) {
        toast(t.needTitle, { tone: 'err' })
        return title.focus()
      }
      if (!isDate(startDate.value)) return void toast(t.needStart, { tone: 'err' })
      const ends = endDate.value || startDate.value
      if (ends < startDate.value) return void toast(t.endBefore, { tone: 'err' })
      if (!allDay.checked && ((startTime.value && !isTime(startTime.value)) || (endTime.value && !isTime(endTime.value)))) return void toast(t.badTime, { tone: 'err' })
      if (!allDay.checked && ends === startDate.value && startTime.value && endTime.value && endTime.value < startTime.value) return void toast(t.endBefore, { tone: 'err' })
      const values = {
        title: title.value.trim(),
        details: details.value,
        location: location.value.trim(),
        starts_on: startDate.value,
        starts_time: allDay.checked ? '' : startTime.value,
        ends_on: ends,
        ends_time: allDay.checked ? '' : endTime.value,
        all_day: allDay.checked,
        repeat: repeat.value,
        repeat_until: repeat.value === 'none' || !until.value ? null : until.value,
        attendees: peopleJson(people),
        color,
      }
      ok.disabled = true
      try {
        const made = row ? await api.update(row.id, { ...row.values, ...values }) : await api.create(values)
        d.close()
        anchor = values.starts_on
        await reload()
        if (!row && people.length) offerShare(made.id)
      } catch (e) {
        fail(e)
        ok.disabled = false
      }
    })
    title.focus()
  }

  /** The invitees need read access to see the event: right after creating it, offer the sharing dialog. */
  const offerShare = (id: string) => {
    const share = el('button', { type: 'button', class: 'msk-btn' }, tr().shareNow)
    const later = el('button', { type: 'button', class: 'msk-btn ghost' }, tr().later)
    const d = dialog({ title: tr().createdTitle, body: el('p', {}, tr().createdText), actions: [later, share] })
    later.addEventListener('click', d.close)
    share.addEventListener('click', () => {
      d.close()
      void msk.share(id).catch(fail)
    })
  }

  // ------------------------------------------------------------------------------------------------------ answers
  const answer = async (id: string, a: string) => {
    try {
      await msk.call('events.rsvp', { id, answer: a })
      toast(tr().answerSaved, { tone: 'ok' })
      return true
    } catch (e) {
      fail(e)
      return false
    }
  }

  const toIcs = (r: Row): IcsEvent => ({
    id: r.id,
    title: str(r, 'title'),
    details: str(r, 'details'),
    location: str(r, 'location'),
    starts_on: dateOf(r, 'starts_on'),
    starts_time: str(r, 'starts_time'),
    ends_on: dateOf(r, 'ends_on'),
    ends_time: str(r, 'ends_time'),
    all_day: r.values.all_day === true,
    repeat: str(r, 'repeat'),
    repeat_until: dateOf(r, 'repeat_until'),
  })

  const exportMonth = async () => {
    const first = `${anchor.slice(0, 7)}-01`
    const last = addDays(`${shift('month', first, 1).slice(0, 7)}-01`, -1)
    try {
      const r = await msk.call<RangeAnswer>('events.range', { from: first, to: last, tasks: false })
      const ids = new Set(r.events.map((e) => e.id))
      if (!ids.size) return void toast(tr().exportEmpty)
      const rows = (await api.list({ limit: 500 })).rows.filter((x) => ids.has(x.id))
      save(icsCalendar(rows.map(toIcs), icsStamp(new Date())), `calendar-${anchor.slice(0, 7)}.ics`)
    } catch (e) {
      fail(e)
    }
  }

  // ------------------------------------------------------------------------------------------------------- detail
  async function openDetail(o: Occ) {
    let row: Row
    try {
      row = await api.get(o.id)
    } catch (e) {
      return fail(e)
    }
    const box = el('div', { class: 'cal-detail' })
    const close = el('button', { type: 'button', class: 'msk-btn' }, tr().close)
    const d = dialog({ title: str(row, 'title'), body: box, actions: [close] })
    close.addEventListener('click', d.close)
    const render = async () => {
      const t = tr()
      let rs: RsvpAnswer = { attendees: parsePeople(row.values.attendees), answers: [] }
      try {
        rs = await msk.call<RsvpAnswer>('events.rsvps', { id: row.id })
      } catch {
        // the answers are an extra: the event is shown anyway
      }
      const level = row.my_level
      const invitedMe = rs.attendees.some((p) => p.id === me)
      const mine = rs.answers.find((a) => a.user_id === me)?.answer ?? ''
      const when = [o.start === o.end ? dayLong(o.start) : `${dayLong(o.start)} → ${dayLong(o.end)}`, timeRange({ all_day: o.all_day, starts_time: o.starts_time, ends_time: o.ends_time }) || (o.all_day ? t.allDay : '')].filter(Boolean).join(' · ')
      const rep = repeatOf(row.values.repeat)
      box.replaceChildren(
        el('div', { class: 'cal-chips2' }, el('span', { class: `cal-dot c-${colorOf(row.values.color)}`, 'aria-hidden': 'true' }), el('span', { class: 'msk-chip' }, colorLabel(String(row.values.color))), rep !== 'none' ? el('span', { class: 'msk-badge' }, repeatLabel(rep) + (dateOf(row, 'repeat_until') ? ' · ' + sub(t.untilLine, { d: dateOf(row, 'repeat_until') }) : '')) : ''),
        el('p', { class: 'cal-when', 'data-testid': 'detail-when' }, el('strong', {}, t.when + ': '), when),
        str(row, 'location') ? el('p', {}, el('strong', {}, t.where + ': '), str(row, 'location')) : '',
        el('p', { class: 'cal-dim' }, sub(t.owner, { n: row.owner_name })),
        str(row, 'details').trim() ? el('p', { class: 'cal-text' }, str(row, 'details')) : el('p', { class: 'cal-dim' }, t.noDetails),
      )
      if (rs.attendees.length) {
        const ul = el('ul', { class: 'cal-people', 'aria-label': t.whoIsInvited, 'data-testid': 'attendees' })
        for (const p of rs.attendees) {
          const a = rs.answers.find((x) => x.user_id === p.id)?.answer ?? ''
          ul.append(el('li', { class: 'cal-person' }, avatar(p.name), el('strong', {}, p.name), el('span', { class: 'cal-ans' }, el('span', { 'aria-hidden': 'true' }, answerMark(a) + ' '), answerWord(a))))
        }
        const yes = rs.answers.filter((x) => x.answer === 'yes').length
        const maybe = rs.answers.filter((x) => x.answer === 'maybe').length
        const no = rs.answers.filter((x) => x.answer === 'no').length
        box.append(el('h4', {}, t.whoIsInvited), el('p', { class: 'cal-dim', 'data-testid': 'counts' }, sub(t.counts, { y: yes, m: maybe, n: no })), ul)
      }
      if (invitedMe || level === 'write' || level === 'manage') {
        const grp = el('div', { class: 'cal-answers', role: 'group', 'aria-label': t.myAnswer })
        for (const a of ['yes', 'maybe', 'no']) {
          const b = el('button', { type: 'button', class: 'msk-btn ghost mini', 'aria-pressed': String(a === mine) }, answerName(a))
          b.addEventListener('click', async () => {
            if (await answer(row.id, a)) {
              await reload()
              void render()
            }
          })
          grp.append(b)
        }
        box.append(el('h4', {}, t.myAnswer), grp, mine ? el('p', { class: 'cal-dim', 'data-testid': 'my-answer' }, sub(t.answered, { a: answerName(mine) })) : '')
      }
      const acts = el('div', { class: 'cal-acts' })
      const btn = (label: string, fn: () => void, cls = '') => {
        const b = el('button', { type: 'button', class: `msk-btn ghost mini ${cls}`.trim() }, label)
        b.addEventListener('click', fn)
        acts.append(b)
      }
      btn(t.addIcs, () => save(icsCalendar([toIcs(row)], icsStamp(new Date())), icsName(str(row, 'title'))))
      if (level === 'write' || level === 'manage') {
        btn(t.edit, () => {
          d.close()
          eventForm({ date: o.start, row })
        })
      }
      if (level === 'manage') {
        btn(t.share, () => void msk.share(row.id).catch(fail))
        btn(
          t.remove,
          async () => {
            const text = rep !== 'none' ? t.removeSeriesConfirm : t.removeConfirm
            if (!(await confirmDialog({ title: t.remove, text: sub(text, { n: str(row, 'title') }), ok: t.remove, cancel: t.cancel, danger: true }))) return
            try {
              await api.remove(row.id)
              d.close()
              await reload()
            } catch (e) {
              fail(e)
            }
          },
          'danger-text',
        )
      }
      box.append(acts)
    }
    void render()
  }

  // ------------------------------------------------------------------------------------------------- invitations
  function openInvitations() {
    const box = el('div', { class: 'cal-detail' })
    const close = el('button', { type: 'button', class: 'msk-btn' }, tr().close)
    const d = dialog({ title: tr().invitationsTitle, body: box, actions: [close] })
    close.addEventListener('click', d.close)
    const render = () => {
      const t = tr()
      box.replaceChildren()
      if (!invites.length) return void box.append(el('p', { class: 'cal-dim' }, t.noInvitations))
      const ul = el('ul', { class: 'cal-invlist', 'data-testid': 'invitation-list' })
      for (const i of invites) {
        const when = [dayLong(i.start), timeRange(i) || (i.all_day ? t.allDay : '')].filter(Boolean).join(' · ')
        const open = el('button', { type: 'button', class: 'cal-link' }, i.title)
        open.addEventListener('click', () => {
          d.close()
          void openDetail({ id: i.id, title: i.title, location: i.location, start: i.start, end: i.end, starts_time: i.starts_time, ends_time: i.ends_time, all_day: i.all_day, repeat: '', color: i.color, invitees: 0, invited: true, yes: 0, no: 0, maybe: 0, mine: '' })
        })
        const acts = el('div', { class: 'cal-acts' })
        for (const a of ['yes', 'maybe', 'no']) {
          const b = el('button', { type: 'button', class: 'msk-btn ghost mini', 'aria-label': `${answerName(a)}: ${i.title}` }, answerName(a))
          b.addEventListener('click', async () => {
            if (await answer(i.id, a)) {
              await reload()
              render()
            }
          })
          acts.append(b)
        }
        ul.append(el('li', { class: `cal-inv-item c-${colorOf(i.color)}` }, el('strong', {}, open), el('span', { class: 'cal-dim' }, [when, i.location].filter(Boolean).join(' · ')), acts))
      }
      box.append(ul)
    }
    render()
  }

  // ------------------------------------------------------------------------------------------------------- keys
  document.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return
    const tg = ev.target as HTMLElement | null
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable)) return
    if (document.querySelector('dialog[open]') || document.querySelector('.msk-popover')) return
    if (ev.key === 't' || ev.key === 'T') {
      ev.preventDefault()
      goTo(todayIso())
      return
    }
    const v = viewKey(ev.key)
    if (v && v !== view) {
      ev.preventDefault()
      setView(v)
    }
  })

  // the line of the current time moves on
  setInterval(() => {
    const now = new Date()
    for (const line of document.querySelectorAll<HTMLElement>('.cal-now')) line.style.top = `${((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX}px`
  }, 60_000)

  msk.onContext((ctx) => {
    if (langOf(ctx.lang) === lang) return
    lang = langOf(ctx.lang)
    draw()
  })
  drawHead()
  void reload()
}

connect()
  .then(mount)
  .catch((e) => {
    app.textContent = TEXTS[langOf(undefined)].failed + errText(e)
  })
