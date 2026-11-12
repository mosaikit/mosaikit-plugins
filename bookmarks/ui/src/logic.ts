// What the list of bookmarks decides, with no DOM: reading the tags, the host of an address, the counts of the tag filter and
// the search. The same limits as the hook of the plugin (src/lib.rs) so the form never offers what the server would refuse.

export const MAX_TAGS = 12
export const MAX_TAG = 30

export interface BookmarkLike {
  title: string
  url: string
  note: string
  tags: string[]
  favorite: boolean
}

export interface Filter {
  query: string
  tags: string[]
  favoritesOnly: boolean
}

/** A tag as the server keeps it: trimmed, lower-case, cut to the longest allowed. */
export function normaliseTag(raw: string): string {
  return raw.trim().toLowerCase().slice(0, MAX_TAG)
}

/** The tags of a bookmark from the stored text (a JSON array of strings; anything else is no tags), clean and without duplicates. */
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
  for (const t of list) {
    const n = typeof t === 'string' ? normaliseTag(t) : ''
    if (n && !out.includes(n)) out.push(n)
  }
  return out.slice(0, MAX_TAGS)
}

/** Clean a list typed in the form: normalised, no empty ones, no duplicates, at most `MAX_TAGS`. */
export function cleanTags(list: string[]): string[] {
  return parseTags(list)
}

/** The host name of an address (no scheme, user, port or `www.`); an address without a scheme is read as https. "" if it has none. */
export function hostOf(url: string): string {
  const rest = url.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^\/+/, '')
  const authority = rest.split(/[/?#]/)[0] ?? ''
  const host = authority.slice(authority.lastIndexOf('@') + 1).replace(/:\d*$/, '')
  return host.toLowerCase().replace(/^www\./, '')
}

/** The address as the link of the page: with its scheme; "" unless it is http or https (never a `javascript:` link). */
export function safeHref(url: string): string {
  const u = url.trim()
  if (/^https?:\/\/[^\s]+$/i.test(u)) return u
  return ''
}

/** The tags used by the bookmarks with how many bookmarks use each: the most used first, then by name. */
export function tagCounts(list: Pick<BookmarkLike, 'tags'>[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const b of list) for (const t of b.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

/** The bookmarks that match the search (every word, in the title, the address, the note or a tag), carry every chosen tag and,
 *  when asked, are favourites. The order of the list is kept. */
export function applyFilter<T extends BookmarkLike>(list: T[], f: Filter): T[] {
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean)
  return list.filter((b) => {
    if (f.favoritesOnly && !b.favorite) return false
    if (!f.tags.every((t) => b.tags.includes(t))) return false
    const hay = [b.title, b.url, b.note, ...b.tags].join('\n').toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

/** Add `tag` to the chosen ones, or remove it when it is already there. */
export function toggleTag(chosen: string[], tag: string): string[] {
  return chosen.includes(tag) ? chosen.filter((t) => t !== tag) : [...chosen, tag]
}
