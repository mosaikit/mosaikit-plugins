// What the calendar decides with no DOM: dates and grids (the week starts on Monday), the days an event covers, the columns of
// overlapping events in a day, the people invited and the .ics file. Dates are `YYYY-MM-DD` texts, times `HH:MM` texts, and
// both are floating local values: nothing here converts a time zone.

export type View = 'month' | 'week' | 'day'
export type Answer = 'yes' | 'no' | 'maybe'
export const COLORS = ['blue', 'green', 'red', 'orange', 'purple', 'grey'] as const
export type Color = (typeof COLORS)[number]
export const REPEATS = ['none', 'daily', 'weekly', 'monthly', 'yearly'] as const
export type Repeat = (typeof REPEATS)[number]
export const MAX_ATTENDEES = 50
export const HOUR_PX = 48

export interface Occ {
  id: string
  title: string
  location: string
  /** first and last day of this occurrence */
  start: string
  end: string
  starts_time: string
  ends_time: string
  all_day: boolean
  repeat: string
  color: string
  invitees: number
  invited: boolean
  yes: number
  no: number
  maybe: number
  mine: string
  /** the time zone of the event (empty: local times, nothing converted) */
  timezone?: string
  /** the first day of the occurrence in the series, before any change of day */
  orig?: string
  /** the occurrence has an exception of its own (changed title, place or times) */
  exception?: boolean
  /** what the event says in its own zone, when the occurrence is shown in the zone of the viewer */
  own?: { start: string; end: string; starts_time: string; ends_time: string }
}

export interface TaskDue {
  id: string
  title: string
  due: string
}

export interface Person {
  id: string
  name: string
}

// ------------------------------------------------------------------------------------------------------------ dates

const pad = (n: number) => String(n).padStart(2, '0')

/** A date text as a local date at noon (no daylight saving trouble). */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1, 12)
}

export function isoOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function isDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  return isoOf(parseDate(s)) === s
}

export function isTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
}

export function addDays(iso: string, n: number): string {
  const d = parseDate(iso)
  d.setDate(d.getDate() + n)
  return isoOf(d)
}

export function addMonths(iso: string, n: number): string {
  const d = parseDate(iso)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, last))
  return isoOf(d)
}

/** Whole days from `a` to `b`. */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000)
}

/** 0 for Monday to 6 for Sunday. */
export function weekdayIndex(iso: string): number {
  return (parseDate(iso).getDay() + 6) % 7
}

export function startOfWeek(iso: string): string {
  return addDays(iso, -weekdayIndex(iso))
}

/** The six weeks of a month grid, as 42 days, from the Monday on or before the 1st. */
export function monthGrid(anchor: string): string[] {
  const first = `${anchor.slice(0, 7)}-01`
  const start = startOfWeek(first)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

export function weekDays(anchor: string): string[] {
  const start = startOfWeek(anchor)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** The days a view shows. */
export function viewDays(view: View, anchor: string): string[] {
  return view === 'month' ? monthGrid(anchor) : view === 'week' ? weekDays(anchor) : [anchor]
}

export function rangeFor(view: View, anchor: string): { from: string; to: string } {
  const days = viewDays(view, anchor)
  return { from: days[0], to: days[days.length - 1] }
}

/** The day one step back (-1) or forward (1) in a view: a month, a week or a day. */
export function shift(view: View, anchor: string, dir: -1 | 1): string {
  return view === 'month' ? addMonths(anchor, dir) : addDays(anchor, dir * (view === 'week' ? 7 : 1))
}

/** The day an arrow key moves the focus to in the month grid (left, right, up, down), or null for another key. */
export function arrowTarget(iso: string, key: string): string | null {
  const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
  return key in step ? addDays(iso, step[key]) : null
}

/** The view a key asks for (`m`, `w`, `d`). */
export function viewKey(key: string): View | null {
  const k = key.toLowerCase()
  return k === 'm' ? 'month' : k === 'w' ? 'week' : k === 'd' ? 'day' : null
}

// ------------------------------------------------------------------------------------------------------- names

const fmt = (lang: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(lang || undefined, o)

/** The names of the seven weekdays, Monday first (`short` or `long`). */
export function weekdayNames(lang: string, style: 'short' | 'long' = 'short'): string[] {
  const f = fmt(lang, { weekday: style })
  // 2024-01-01 was a Monday
  return Array.from({ length: 7 }, (_, i) => f.format(parseDate(`2024-01-${pad(i + 1)}`)))
}

/** The title of the period a view shows. */
export function periodTitle(view: View, anchor: string, lang: string): string {
  const d = parseDate(anchor)
  if (view === 'month') return fmt(lang, { month: 'long', year: 'numeric' }).format(d)
  if (view === 'day') return fmt(lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d)
  const days = weekDays(anchor)
  return fmt(lang, { day: 'numeric', month: 'short', year: 'numeric' }).formatRange(parseDate(days[0]), parseDate(days[6]))
}

export function longDate(iso: string, lang: string): string {
  return fmt(lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(parseDate(iso))
}

// ---------------------------------------------------------------------------------------------------- occurrences

const minutesOf = (t: string) => (isTime(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : null)
export const timeOf = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`

/** One day of an occurrence: where it sits in that day. `startMin` is null for what has no time (all day, or a day in the
 *  middle of a long event). */
export interface Seg {
  occ: Occ
  day: string
  startMin: number | null
  endMin: number | null
  first: boolean
  last: boolean
}

/** Whether an occurrence is drawn in the time grid (a timed event inside one day) or in the row of the whole day. */
export function isTimed(o: Occ): boolean {
  return !o.all_day && o.start === o.end && minutesOf(o.starts_time) !== null
}

/** The occurrences cut into days (every day an event covers shows it), for the days from `from` to `to`. */
export function spread(occs: Occ[], from: string, to: string): Map<string, Seg[]> {
  const out = new Map<string, Seg[]>()
  for (let d = from; d <= to; d = addDays(d, 1)) out.set(d, [])
  for (const o of occs) {
    const first = o.start < from ? from : o.start
    const last = o.end > to ? to : o.end
    for (let d = first; d <= last; d = addDays(d, 1)) {
      let startMin: number | null = null
      let endMin: number | null = null
      if (isTimed(o)) {
        startMin = minutesOf(o.starts_time)!
        const e = minutesOf(o.ends_time)
        endMin = Math.min(1440, Math.max(e ?? startMin + 60, startMin + 15))
      }
      out.get(d)?.push({ occ: o, day: d, startMin, endMin, first: d === o.start, last: d === o.end })
    }
  }
  for (const list of out.values()) list.sort(compareSeg)
  return out
}

/** The whole-day ones first, then by time, then by title. */
export function compareSeg(a: Seg, b: Seg): number {
  const ka = a.startMin ?? -1
  const kb = b.startMin ?? -1
  return ka - kb || a.occ.title.localeCompare(b.occ.title)
}

export interface Placed<T> {
  item: T
  col: number
  cols: number
}

/** The columns of the timed events of a day: events that overlap in time sit side by side, as many columns as the
 *  busiest moment of their group needs. */
export function layoutDay<T extends { startMin: number; endMin: number }>(items: T[]): Placed<T>[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)
  const out: Placed<T>[] = []
  let group: Placed<T>[] = []
  let groupEnd = -1
  const close = () => {
    const cols = Math.max(1, ...group.map((p) => p.col + 1))
    for (const p of group) p.cols = cols
    out.push(...group)
    group = []
  }
  for (const item of sorted) {
    if (group.length && item.startMin >= groupEnd) close()
    // the first column whose last event is over
    const ends: number[] = []
    for (const p of group) ends[p.col] = Math.max(ends[p.col] ?? 0, p.item.endMin)
    let col = ends.findIndex((e) => e <= item.startMin)
    if (col < 0) col = ends.length
    group.push({ item, col, cols: 1 })
    groupEnd = Math.max(groupEnd, item.endMin)
  }
  if (group.length) close()
  return out
}

/** `09:30`, `09:30–10:15` or nothing for a day with no time. */
export function timeRange(o: Pick<Occ, 'all_day' | 'starts_time' | 'ends_time'>): string {
  if (o.all_day || !isTime(o.starts_time)) return ''
  return isTime(o.ends_time) && o.ends_time !== o.starts_time ? `${o.starts_time}–${o.ends_time}` : o.starts_time
}

/** The text of a chip: the time and the title (the colour is never the only signal). */
export function chipText(o: Occ, day?: string): string {
  const time = !o.all_day && isTime(o.starts_time) && (day === undefined || day === o.start) ? o.starts_time : ''
  return time ? `${time} ${o.title}` : o.title
}

/** How many answers of each kind, as `3 ✓ · 1 ? · 0 ✗`-style marks. */
export function answerMark(a: string): string {
  return a === 'yes' ? '✓' : a === 'no' ? '✗' : a === 'maybe' ? '?' : '–'
}

export function colorOf(v: unknown): Color {
  return (COLORS as readonly string[]).includes(String(v)) ? (v as Color) : 'blue'
}

export function repeatOf(v: unknown): Repeat {
  return (REPEATS as readonly string[]).includes(String(v)) ? (v as Repeat) : 'none'
}

/** The end of a new event that starts at `time`: one hour later, never past the day. */
export function endAfter(time: string): string {
  const m = minutesOf(time)
  return m === null ? '' : timeOf(Math.min(1439, m + 60))
}

/** Keeps the end of an event from falling before its start (dates, and times on the same day). */
export function fixEnd(f: { starts_on: string; starts_time: string; ends_on: string; ends_time: string; all_day: boolean }): { ends_on: string; ends_time: string } {
  let ends_on = f.ends_on
  let ends_time = f.ends_time
  if (!ends_on || ends_on < f.starts_on) ends_on = f.starts_on
  if (!f.all_day && ends_on === f.starts_on && isTime(f.starts_time) && isTime(ends_time) && ends_time < f.starts_time) ends_time = endAfter(f.starts_time)
  return { ends_on, ends_time }
}

// --------------------------------------------------------------------------------------------------------- people

export function addPerson(list: Person[], p: Person): Person[] {
  if (list.some((x) => x.id === p.id) || list.length >= MAX_ATTENDEES) return list
  return [...list, p]
}

export function removePerson(list: Person[], id: string): Person[] {
  return list.filter((p) => p.id !== id)
}

export function peopleJson(list: Person[]): string {
  return JSON.stringify(list.map((p) => ({ id: p.id, name: p.name })))
}

export function parsePeople(raw: unknown): Person[] {
  try {
    const v = JSON.parse(String(raw ?? '[]')) as Person[]
    return Array.isArray(v) ? v.filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string') : []
  } catch {
    return []
  }
}


// ------------------------------------------------------------------------------------------------------- time zones

/** Whether `zone` is a time zone name this browser knows (`Europe/Rome`, `UTC`). */
export function validZone(zone: string): boolean {
  if (!zone) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/** The time zone of the person (the one of the browser). */
export function viewerZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** The names offered in the form: the zones the browser lists, `UTC` first. */
export function zoneNames(): string[] {
  let all: string[] = []
  try {
    all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
  } catch {
    all = []
  }
  return ['UTC', ...all.filter((z) => z !== 'UTC')]
}

const zoneFormats = new Map<string, Intl.DateTimeFormat>()
function zoneFormat(zone: string): Intl.DateTimeFormat {
  let f = zoneFormats.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    zoneFormats.set(zone, f)
  }
  return f
}

/** The wall clock of an instant (ms since 1970) in a zone. */
export function instantToWall(ms: number, zone: string): { date: string; time: string } {
  const p: Record<string, string> = {}
  for (const x of zoneFormat(zone).formatToParts(new Date(ms))) p[x.type] = x.value
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` }
}

/** The offset of a zone from UTC at an instant, in minutes (east positive). */
function offsetMin(ms: number, zone: string): number {
  const w = instantToWall(ms, zone)
  const [y, m, d] = w.date.split('-').map(Number)
  const [h, mi] = w.time.split(':').map(Number)
  return Math.round((Date.UTC(y, m - 1, d, h, mi) - Math.floor(ms / 60000) * 60000) / 60000)
}

/** The instant (ms) of a wall clock in a zone: `2026-11-12` `09:30` in `Europe/Rome` is 08:30 UTC. */
export function wallToInstant(date: string, time: string, zone: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, h, mi)
  const o1 = offsetMin(guess, zone)
  const first = guess - o1 * 60000
  const o2 = offsetMin(first, zone)
  return o2 === o1 ? first : guess - o2 * 60000
}

/**
 * An occurrence of an event that has a time zone, shown in another zone: its days and times move to the wall clock of
 * the viewer (the day can change). An all-day event, one with no start time and one in the viewer's own zone stay as they
 * are. `own` keeps what the event itself says (its zone) for the edit forms and the detail.
 */
export function convertOcc(o: Occ, viewer: string): Occ {
  const zone = o.timezone
  if (!zone || o.all_day || !isTime(o.starts_time) || zone === viewer || !validZone(zone) || !validZone(viewer)) return o
  const own = { start: o.start, end: o.end, starts_time: o.starts_time, ends_time: o.ends_time }
  const s = instantToWall(wallToInstant(o.start, o.starts_time, zone), viewer)
  let end = addDays(s.date, daysBetween(o.start, o.end))
  let endTime = ''
  if (isTime(o.ends_time)) {
    const e = instantToWall(wallToInstant(o.end, o.ends_time, zone), viewer)
    end = e.date
    endTime = e.time
  }
  return { ...o, start: s.date, end, starts_time: s.time, ends_time: endTime, own }
}

// ------------------------------------------------------------------------------------------------------------ .ics

export interface IcsException {
  on: string
  skipped: boolean
  title: string | null
  location: string | null
  starts_time: string | null
  ends_time: string | null
}

export interface IcsPerson {
  id: string
  name: string
  answer: string
}

export interface IcsEvent {
  id: string
  title: string
  details: string
  location: string
  starts_on: string
  starts_time: string
  ends_on: string
  ends_time: string
  all_day: boolean
  repeat: string
  repeat_until: string
  /** the time zone of the event ('' for floating local times) */
  timezone?: string
  attendees?: IcsPerson[]
  exceptions?: IcsException[]
}

/** Escapes a text value (RFC 5545 3.3.11): backslash, semicolon, comma and line breaks. */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n')
}

const utf8 = new TextEncoder()

/** Folds a line at 75 octets (RFC 5545 3.1): the next lines begin with a space, and a character is never split. */
export function icsFold(line: string): string[] {
  if (utf8.encode(line).length <= 75) return [line]
  const out: string[] = []
  let cur = ''
  let size = 0
  let limit = 75
  for (const ch of line) {
    const n = utf8.encode(ch).length
    if (size + n > limit) {
      out.push(cur)
      cur = ' '
      size = 1
      limit = 75
    }
    cur += ch
    size += n
  }
  out.push(cur)
  return out
}

const compact = (iso: string) => iso.replace(/-/g, '')
const clock = (t: string) => `${t.replace(':', '')}00`

/** `YYYYMMDDTHHMMSSZ` of a moment (UTC), for DTSTAMP. */
export function icsStamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

const PARTSTAT: Record<string, string> = { yes: 'ACCEPTED', no: 'DECLINED', maybe: 'TENTATIVE' }

/** `YYYYMMDDTHHMMSSZ` of an instant given in ms. */
const utcStamp = (ms: number) => icsStamp(new Date(ms))

/** The lines of one VEVENT, plus the changed occurrences of its series (VEVENT with RECURRENCE-ID). A whole-day event ends on
 *  the day after its last day (DTEND is not included). Times are floating, or in the TZID of the event when it has a zone
 *  (the UNTIL of a series is then in UTC, as the format asks). The invited are ATTENDEE lines with their answer. */
export function icsEvent(e: IcsEvent, stamp: string): string[] {
  const end = e.ends_on || e.starts_on
  const timed = !e.all_day && isTime(e.starts_time)
  const zone = timed && e.timezone && validZone(e.timezone) ? e.timezone : ''
  const prop = (name: string, date: string, time?: string) =>
    time === undefined ? `${name};VALUE=DATE:${compact(date)}` : zone ? `${name};TZID=${zone}:${compact(date)}T${clock(time)}` : `${name}:${compact(date)}T${clock(time)}`
  const uid = `UID:${e.id}@mosaikit-calendar`
  const endTime = isTime(e.ends_time) ? e.ends_time : endAfter(e.starts_time)
  const lines = ['BEGIN:VEVENT', uid, `DTSTAMP:${stamp}`]
  if (timed) lines.push(prop('DTSTART', e.starts_on, e.starts_time), prop('DTEND', end, endTime))
  else lines.push(prop('DTSTART', e.starts_on), prop('DTEND', addDays(end, 1)))
  lines.push(`SUMMARY:${icsEscape(e.title)}`)
  if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`)
  if (e.details) lines.push(`DESCRIPTION:${icsEscape(e.details)}`)
  const freq: Record<string, string> = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' }
  if (freq[e.repeat]) {
    let rule = `RRULE:FREQ=${freq[e.repeat]}`
    if (e.repeat_until) rule += `;UNTIL=${zone ? utcStamp(wallToInstant(e.repeat_until, '23:59', zone) + 59_000) : compact(e.repeat_until) + (timed ? 'T235959' : '')}`
    lines.push(rule)
    // an occurrence that was removed (a changed one is written again below with its RECURRENCE-ID)
    for (const x of (e.exceptions ?? []).filter((x) => x.skipped)) lines.push(timed ? prop('EXDATE', x.on, e.starts_time) : `EXDATE;VALUE=DATE:${compact(x.on)}`)
  }
  for (const p of e.attendees ?? []) {
    const name = p.name.replace(/"/g, '').replace(/\s+/g, ' ')
    lines.push(`ATTENDEE;CN="${name}";ROLE=REQ-PARTICIPANT;PARTSTAT=${PARTSTAT[p.answer] ?? 'NEEDS-ACTION'}:urn:uuid:${p.id}`)
  }
  lines.push('END:VEVENT')
  if (freq[e.repeat]) {
    const days = daysBetween(e.starts_on, end)
    for (const x of (e.exceptions ?? []).filter((x) => !x.skipped)) {
      const st = x.starts_time ?? e.starts_time
      const en = x.ends_time ?? e.ends_time
      const l = ['BEGIN:VEVENT', uid, `DTSTAMP:${stamp}`]
      const exTimed = timed && isTime(st)
      const exEnd = addDays(x.on, days)
      l.push(exTimed ? prop('RECURRENCE-ID', x.on, e.starts_time) : `RECURRENCE-ID;VALUE=DATE:${compact(x.on)}`)
      if (exTimed) l.push(prop('DTSTART', x.on, st), prop('DTEND', exEnd, isTime(en) && (days > 0 || en > st) ? en : endAfter(st)))
      else l.push(prop('DTSTART', x.on), prop('DTEND', addDays(exEnd, 1)))
      l.push(`SUMMARY:${icsEscape(x.title || e.title)}`)
      const place = x.location ?? e.location
      if (place) l.push(`LOCATION:${icsEscape(place)}`)
      if (e.details) l.push(`DESCRIPTION:${icsEscape(e.details)}`)
      l.push('END:VEVENT')
      lines.push(...l)
    }
  }
  return lines
}

/** A whole calendar file: CRLF line ends, lines folded at 75 octets. */
export function icsCalendar(events: IcsEvent[], stamp: string): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mosaikit//Calendar//EN', 'CALSCALE:GREGORIAN']
  for (const e of events) lines.push(...icsEvent(e, stamp))
  lines.push('END:VCALENDAR')
  return lines.flatMap(icsFold).join('\r\n') + '\r\n'
}

/** A file name for an .ics download, safe on any system. */
export function icsName(title: string): string {
  const base = title.normalize('NFKD').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40)
  return `${base || 'event'}.ics`
}
