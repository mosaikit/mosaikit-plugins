// When a task is due, as the views group it. Dates are `YYYY-MM-DD` strings, compared as text.

export type Bucket = 'overdue' | 'today' | 'week' | 'later' | 'nodate' | 'done'
export const BUCKETS: Bucket[] = ['overdue', 'today', 'week', 'later', 'nodate', 'done']

export const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const addDaysIso = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00`)
  return isoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n))
}

export interface TaskLike {
  done: boolean
  due: string
}

/** Where a task falls: overdue, today, the next 6 days (`week`), later, no date, or done. */
export function bucketOf(t: TaskLike, today: string): Bucket {
  if (t.done) return 'done'
  if (!t.due) return 'nodate'
  if (t.due < today) return 'overdue'
  if (t.due === today) return 'today'
  return t.due <= addDaysIso(today, 6) ? 'week' : 'later'
}

/** The seven days from today, for the week view. */
export function weekDays(today: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(today, i))
}

/** The labels of a task: a comma separated text, trimmed, without empty ones or repeats. */
export function splitLabels(s: unknown): string[] {
  if (typeof s !== 'string') return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of s.split(',')) {
    const t = part.trim()
    const k = t.toLocaleLowerCase()
    if (t && !seen.has(k)) {
      seen.add(k)
      out.push(t)
    }
  }
  return out
}
export const joinLabels = (l: string[]) => l.join(',')
