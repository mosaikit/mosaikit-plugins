// What the list of bookmarks decides, with no DOM: reading the tags, the host of an address, the counts of the tag filter and
// the search. The same limits as the hook of the plugin (src/lib.rs) so the form never offers what the server would refuse.

export const MAX_TAGS = 12
export const MAX_TAG = 30

/** Where a bookmark opens: in a frame of the content area, or in a new tab. */
export type OpenMode = 'frame' | 'tab'

export interface BookmarkLike {
  title: string
  url: string
  note: string
  tags: string[]
  favorite: boolean
  /** The choice kept on the bookmark; empty or missing: the default of the list applies. */
  openMode?: OpenMode | ''
  /** A small `data:` image of the site (the picture the host found, or one imported). */
  thumbnail?: string
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

/** Cuts a list in rows of `n` (at least 1): the cards of a grid, one row of the virtual list each. */
export function chunk<T>(list: T[], n: number): T[][] {
  const size = Math.max(1, Math.floor(n))
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/** How many columns of at least `min` px fit in `width` with `gap` between them (1 at least). */
export function columnsFor(width: number, min: number, gap: number): number {
  return Math.max(1, Math.floor((width + gap) / (min + gap)))
}

/** The stored `open_mode` as a mode: anything else means "no choice kept". */
export function parseOpenMode(raw: unknown): OpenMode | '' {
  return raw === 'frame' || raw === 'tab' ? raw : ''
}

/** How a bookmark opens: its own choice, else the default of the list. */
export function effectiveMode(own: OpenMode | '' | undefined, fallback: OpenMode): OpenMode {
  return own === 'frame' || own === 'tab' ? own : fallback
}

/** The thumbnail as the page may draw it: only a small `data:` image, never an address to fetch. */
export function safeThumbnail(raw: unknown): string {
  const v = typeof raw === 'string' ? raw : ''
  return /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= MAX_THUMBNAIL ? v : ''
}

/** Longest thumbnail kept, in characters (the same limit as the hook of the plugin). */
export const MAX_THUMBNAIL = 262144

/** The address with its scheme, as the hook of the plugin stores it (https when none is written); "" if it is not http(s). */
export function withScheme(url: string): string {
  const u = url.trim()
  if (!u) return ''
  const full = /^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(u) ? '' : 'https://' + u.replace(/^\/+/, '')
  return safeHref(full)
}

/** Hue (0-359) of a name: the colour of a placeholder thumbnail, the same every time. */
export function hueOf(text: string): number {
  return [...text].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 360, 7)
}
