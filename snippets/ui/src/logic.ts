// What the list of snippets decides, with no DOM: reading the tags, the first line, the search and the counts of the tags.

export const KINDS = ['text', 'shell', 'sql', 'json', 'javascript', 'python', 'rust', 'markdown', 'other'] as const
export type Kind = (typeof KINDS)[number]

export interface SnippetLike {
  id: string
  title: string
  body: string
  kind: string
  tags: string[]
  createdAt: string
}

export interface Filter {
  q: string
  kind: string
  tag: string
}

/** The kind of a snippet as one of the list (anything else is plain text). */
export function kindOf(v: unknown): Kind {
  return (KINDS as readonly string[]).includes(v as string) ? (v as Kind) : 'text'
}

/** A tag as the platform keeps it: trimmed and lower-cased. */
export function normTag(s: string): string {
  return s.trim().toLocaleLowerCase()
}

/** The tags of a record (a JSON array of strings in a text field): normalised, without repeats; anything unreadable is no tags. */
export function parseTags(raw: unknown): string[] {
  let list: unknown = raw
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  const out: string[] = []
  for (const x of list) {
    if (typeof x !== 'string') continue
    const t = normTag(x)
    if (t && !out.includes(t)) out.push(t)
  }
  return out
}

/** The first line of the body that has something in it, trimmed. */
export function firstLine(body: string): string {
  for (const line of body.split(/\r?\n/)) if (line.trim()) return line.trim()
  return ''
}

/** The snippets that match the search (title, body and tags, any case), the kind and the tag; an empty criterion matches all. */
export function filterSnippets<T extends SnippetLike>(list: T[], f: Filter): T[] {
  const q = f.q.trim().toLocaleLowerCase()
  return list.filter(
    (s) =>
      (!f.kind || s.kind === f.kind) &&
      (!f.tag || s.tags.includes(f.tag)) &&
      (!q || s.title.toLocaleLowerCase().includes(q) || s.body.toLocaleLowerCase().includes(q) || s.tags.some((t) => t.includes(q))),
  )
}

/** The tags of the list with how many snippets carry each: the most used first, then by name. */
export function tagCounts(list: SnippetLike[]): { tag: string; count: number }[] {
  const n = new Map<string, number>()
  for (const s of list) for (const t of s.tags) n.set(t, (n.get(t) ?? 0) + 1)
  return [...n].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

/** The list as it is shown: the title in alphabetical order (not case sensitive), then the newest. */
export function listOrder<T extends SnippetLike>(list: T[]): T[] {
  return [...list].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
}

/** The id `step` places away from `id`, stopping at the ends; with nothing selected, the first one (the last one going up). */
export function neighbour(ids: string[], id: string | null, step: number): string | null {
  if (!ids.length) return null
  const i = id ? ids.indexOf(id) : -1
  if (i < 0) return ids[step < 0 ? ids.length - 1 : 0]
  return ids[Math.min(ids.length - 1, Math.max(0, i + step))]
}
