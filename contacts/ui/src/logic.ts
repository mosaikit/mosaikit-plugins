// Ordering, grouping, birthdays and duplicates of the contacts. Pure functions, no DOM.

export interface Entry {
  id: string
  name: string
  email: string
  email2: string
  phone: string
  phone2: string
  org: string
}

/** The letter a contact is filed under: the first letter without accents, `#` for anything that is not a letter. */
export function letterOf(name: string): string {
  const c = name.trim().normalize('NFD').replace(/\p{M}/gu, '')[0]
  return c && /\p{L}/u.test(c) ? c.toLocaleUpperCase() : '#'
}

/** Sorts by name (accents and case ignored), `#` last. */
export function byName<T extends { name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

/** The contacts by letter, in alphabetical order of the letters, `#` last. */
export function groupByLetter<T extends { name: string }>(list: T[]): [string, T[]][] {
  const m = new Map<string, T[]>()
  for (const p of byName(list)) m.set(letterOf(p.name), [...(m.get(letterOf(p.name)) ?? []), p])
  return [...m.entries()].sort(([a], [b]) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)))
}

/** The days until the next birthday (0 today), or null when the date is not a date. `birthday` is `YYYY-MM-DD`; 29 Feb is kept on 28 Feb in common years. */
export function daysToBirthday(birthday: string, today: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthday)
  if (!m) return null
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  if (mo < 0 || mo > 11 || d < 1 || d > 31) return null
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const at = (y: number) => {
    const last = new Date(y, mo + 1, 0).getDate()
    return new Date(y, mo, Math.min(d, last))
  }
  let next = at(start.getFullYear())
  if (next < start) next = at(start.getFullYear() + 1)
  return Math.round((next.getTime() - start.getTime()) / 86400000)
}

const digits = (s: string) => s.replace(/[^\d]/g, '')

/** Groups of contacts that look like the same person: the same email, the same phone number (7 digits or more) or the same name. */
export function duplicates<T extends Entry>(list: T[]): T[][] {
  const keys = (p: T) => [
    ...[p.email, p.email2].filter(Boolean).map((e) => `e:${e.trim().toLowerCase()}`),
    ...[p.phone, p.phone2].map(digits).filter((d) => d.length >= 7).map((d) => `p:${d}`),
    ...(p.name.trim() ? [`n:${p.name.trim().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ')}`] : []),
  ]
  // union-find over the contacts that share a key
  const parent = new Map<string, string>(list.map((p) => [p.id, p.id]))
  const find = (x: string): string => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(x, r)
    return r
  }
  const seen = new Map<string, string>()
  for (const p of list)
    for (const k of keys(p)) {
      const o = seen.get(k)
      if (o) parent.set(find(p.id), find(o))
      else seen.set(k, p.id)
    }
  const groups = new Map<string, T[]>()
  for (const p of list) groups.set(find(p.id), [...(groups.get(find(p.id)) ?? []), p])
  return [...groups.values()].filter((g) => g.length > 1)
}

/** The tags of a contact: a comma separated text, trimmed, without empty ones or repeats. */
export function splitTags(s: unknown): string[] {
  if (typeof s !== 'string') return []
  const seen = new Set<string>()
  return s
    .split(',')
    .map((t) => t.trim())
    .filter((t) => {
      const k = t.toLocaleLowerCase()
      if (!t || seen.has(k)) return false
      seen.add(k)
      return true
    })
}
