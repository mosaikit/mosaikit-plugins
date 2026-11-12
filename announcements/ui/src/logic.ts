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
