// What the Projects UI decides, with no DOM: the lists stored in the hidden fields, the next milestone, the current sprint,
// overdue milestones, the filter by status and the columns as text.

export type Status = 'planned' | 'active' | 'on_hold' | 'done'
export const STATUSES: Status[] = ['planned', 'active', 'on_hold', 'done']

export interface Milestone {
  id: string
  name: string
  date: string
  done: boolean
}
export interface Sprint {
  id: string
  name: string
  start: string
  end: string
}

/** The status as one of the four (anything else is active, the default). */
export function statusOf(v: unknown): Status {
  return STATUSES.includes(v as Status) ? (v as Status) : 'active'
}

function list(raw: unknown): unknown[] {
  try {
    const v = JSON.parse(String(raw ?? '[]'))
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

const text = (o: unknown, k: string): string => {
  const v = (o as Record<string, unknown> | null)?.[k]
  return typeof v === 'string' ? v : ''
}

/** The milestones stored in the hidden field, by date (a broken entry is dropped). */
export function parseMilestones(raw: unknown): Milestone[] {
  return list(raw)
    .map((m) => ({ id: text(m, 'id'), name: text(m, 'name'), date: text(m, 'date'), done: (m as { done?: unknown } | null)?.done === true }))
    .filter((m) => m.id && m.name && m.date)
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
}

/** The sprints stored in the hidden field, by start date. */
export function parseSprints(raw: unknown): Sprint[] {
  return list(raw)
    .map((s) => ({ id: text(s, 'id'), name: text(s, 'name'), start: text(s, 'start'), end: text(s, 'end') }))
    .filter((s) => s.id && s.name && s.start && s.end)
    .sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name))
}

/** The columns stored in the hidden field; the default three when it holds fewer than two. */
export function parseColumns(raw: unknown): string[] {
  const c = list(raw).filter((x): x is string => typeof x === 'string' && x.trim() !== '')
  return c.length >= 2 ? c : ['To do', 'Doing', 'Done']
}

/** A milestone that is not done and whose date has passed (`today` is YYYY-MM-DD). */
export const isOverdue = (m: Pick<Milestone, 'date' | 'done'>, today: string): boolean => !m.done && m.date < today

/** The next milestone still to reach: not done, today or later, the earliest. */
export function nextMilestone(ms: Milestone[], today: string): Milestone | null {
  return ms.filter((m) => !m.done && m.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
}

/** The sprint that contains `today` (the first one when they overlap). */
export function currentSprint(ss: Sprint[], today: string): Sprint | null {
  return ss.find((s) => s.start <= today && today <= s.end) ?? null
}

/** The projects with the status of the filter (`all` keeps every one); the name is the order. */
export function byStatus<T extends { name: string; status: Status }>(rows: T[], filter: Status | 'all'): T[] {
  return rows.filter((r) => filter === 'all' || r.status === filter).sort((a, b) => a.name.localeCompare(b.name))
}

/** The columns as the text of the form (one per line) and back; the lines are trimmed and the empty ones dropped. */
export const columnsToText = (cols: string[]): string => cols.join('\n')
export const columnsFromText = (t: string): string[] =>
  t
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

/** A short id for a milestone or a sprint (letters and digits). */
export function newId(prefix: string, rnd: () => number = Math.random): string {
  return prefix + Math.floor(rnd() * 36 ** 6).toString(36).padStart(6, '0')
}

/** Today as YYYY-MM-DD in the local time of the person. */
export function todayLocal(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

/** The percent of a sprint or project, rounded, 0 for nothing to do. */
export const percentOf = (done: number, total: number): number => (total > 0 ? Math.round((done * 100) / total) : 0)
