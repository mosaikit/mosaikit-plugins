// What the list of notices decides, with no DOM: whether a notice is current, upcoming or past, and the order of the board.

export type Level = 'info' | 'important' | 'urgent'
export type Period = 'current' | 'upcoming' | 'past'

export interface NoticeLike {
  id: string
  level: string
  pinned: boolean
  startsOn: string
  endsOn: string
  createdAt: string
}

const RANK: Record<string, number> = { urgent: 0, important: 1, info: 2 }

/** The level of a notice as one of the three (anything else is information). */
export function levelOf(v: unknown): Level {
  return v === 'urgent' || v === 'important' ? v : 'info'
}

/** Where a notice stands on `today` (YYYY-MM-DD): before its first day, within its period (an open end never ends), after it. */
export function periodOf(n: Pick<NoticeLike, 'startsOn' | 'endsOn'>, today: string): Period {
  if (n.startsOn && n.startsOn > today) return 'upcoming'
  if (n.endsOn && n.endsOn < today) return 'past'
  return 'current'
}

/** The board: pinned first, then urgent, important and information, then the newest. A stable order for equal notices. */
export function boardOrder<T extends NoticeLike>(list: T[]): T[] {
  return [...list].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      (RANK[a.level] ?? 2) - (RANK[b.level] ?? 2) ||
      b.createdAt.localeCompare(a.createdAt) ||
      a.id.localeCompare(b.id),
  )
}

/** Today as YYYY-MM-DD in the local time of the person. */
export function todayLocal(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

/** The rows of the CSV of who confirmed a notice: the name and the moment (ISO 8601), the earliest first. */
export function ackRows(acks: { name: string; at: string }[]): string[][] {
  return [...acks].sort((a, b) => a.at.localeCompare(b.at)).map((a) => [a.name, a.at])
}

/** A file name from the title of a notice: letters and digits with dashes, at most 40 characters. */
export function fileStem(title: string): string {
  const s = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return s || 'notice'
}

/** The initials of a name for the medallion of the author: two letters at most. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return ((parts[0]![0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '')).toUpperCase()
}
