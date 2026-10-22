// The history of the reviews of a note, kept in the hidden field `history` of the extension as a JSON
// list (the newest last). Pure functions, tested on their own.

export interface Review {
  /** ISO date and time */
  at: string
  /** name of the person */
  by: string
  /** reviewed (true) or put back to not reviewed (false) */
  reviewed: boolean
  note?: string
}

/** at most this many reviews are kept (the oldest go) */
export const MAX_REVIEWS = 50

/** The reviews in the stored value; anything unreadable counts as no review. */
export function parseHistory(raw: unknown): Review[] {
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const list: unknown = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return list.flatMap((r) => {
      if (!r || typeof r !== 'object') return []
      const x = r as Record<string, unknown>
      if (typeof x.at !== 'string' || typeof x.by !== 'string' || typeof x.reviewed !== 'boolean') return []
      const note = typeof x.note === 'string' && x.note.trim() ? x.note.trim().slice(0, 500) : undefined
      return [{ at: x.at, by: x.by, reviewed: x.reviewed, ...(note ? { note } : {}) }]
    })
  } catch {
    return []
  }
}

/** The stored value with one more review (at most MAX_REVIEWS). */
export function addReview(raw: unknown, r: Review): string {
  const note = r.note?.trim().slice(0, 500)
  const list = [...parseHistory(raw), { at: r.at, by: r.by, reviewed: r.reviewed, ...(note ? { note } : {}) }]
  return JSON.stringify(list.slice(-MAX_REVIEWS))
}
