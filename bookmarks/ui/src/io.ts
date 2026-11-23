// Import and export of bookmarks, and duplicate detection. Pure functions, no DOM: the browser HTML format (Netscape
// bookmark file, written by Chrome, Firefox, Edge and Safari), CSV rows, and the "same address" rule.
import { cleanTags, parseOpenMode, safeThumbnail, type BookmarkLike } from './logic.ts'

/** Query parameters that only say where a click came from: they do not make another page. */
const TRACKING = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|igshid|ref_src)$/i

/**
 * The address in a form where two spellings of the same page are equal: scheme and host in lower case, no `www.`, no
 * default port, no fragment, no tracking parameters, the other parameters sorted, no slash at the end of the path, and
 * http and https of one page read as one. Text that is not an address comes back trimmed and lower-cased.
 */
export function normalizeUrl(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : /^[^\s/]+\.[^\s/]+/.test(t) ? 'https://' + t : ''
  if (!withScheme) return t.toLowerCase()
  let u: URL
  try {
    u = new URL(withScheme)
  } catch {
    return t.toLowerCase()
  }
  const keep = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b))
  const query = keep.length ? '?' + keep.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&') : ''
  const path = u.pathname.replace(/\/+$/, '')
  const host = u.hostname.replace(/^www\./, '')
  const port = u.port && !((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) ? ':' + u.port : ''
  const scheme = u.protocol === 'http:' ? 'https:' : u.protocol
  return `${scheme}//${host}${port}${path}${query}`
}

/** Groups of bookmarks that have the same normalised address (only the groups of two or more; the order given is kept). */
export function findDuplicates<T extends { url: string }>(list: T[]): T[][] {
  const groups = new Map<string, T[]>()
  for (const b of list) {
    const key = normalizeUrl(b.url)
    if (key) groups.set(key, [...(groups.get(key) ?? []), b])
  }
  return [...groups.values()].filter((g) => g.length > 1)
}

/** Splits what a person imports into the bookmarks that are new and the ones already saved (or repeated in the file). */
export function planImport<T extends { url: string }>(existing: { url: string }[], incoming: T[]): { fresh: T[]; duplicates: T[] } {
  const seen = new Set(existing.map((b) => normalizeUrl(b.url)))
  const fresh: T[] = []
  const duplicates: T[] = []
  for (const b of incoming) {
    const key = normalizeUrl(b.url)
    if (!key || seen.has(key)) duplicates.push(b)
    else {
      seen.add(key)
      fresh.push(b)
    }
  }
  return { fresh, duplicates }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
const strip = (s: string) => decode(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
const attr = (attrs: string, name: string) => {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs)
  return m ? decode(m[1] ?? m[2] ?? m[3] ?? '') : ''
}

export type Imported = BookmarkLike

/** Folders every browser has: they say nothing, so they do not become tags. */
const ROOTS = /^(bookmarks?( bar| toolbar| menu)?|favou?rites?( bar)?|other bookmarks|mobile bookmarks)$/i

/**
 * Bookmarks of a browser export (the Netscape bookmark HTML). The folders a link sits in become its tags (the name of the
 * folder, lower case); a `TAGS="a,b"` attribute (Firefox, Pinboard) adds more. Only http and https addresses are kept.
 */
export function parseBrowserHtml(html: string): Imported[] {
  const out: Imported[] = []
  const stack: string[] = []
  let pending: string | null = null
  let last: Imported | null = null
  const re = /<H3\b[^>]*>([\s\S]*?)<\/H3>|<A\b([^>]*)>([\s\S]*?)<\/A>|<DL\b[^>]*>|<\/DL>|<DD>([^<]*)/gi
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const tag = m[0].slice(0, 3).toLowerCase()
    if (tag === '<h3') pending = strip(m[1] ?? '')
    else if (tag === '<dl') {
      stack.push(pending ?? '')
      pending = null
    } else if (tag === '</d') stack.pop()
    else if (tag === '<dd') {
      if (last && !last.note) last.note = decode((m[4] ?? '').trim())
    } else {
      const url = attr(m[2] ?? '', 'href')
      if (!/^https?:\/\//i.test(url)) {
        last = null
        continue
      }
      const own = attr(m[2] ?? '', 'tags').split(',')
      const folders = stack.filter((f) => f && !ROOTS.test(f))
      last = { title: strip(m[3] ?? '') || url, url, note: '', tags: cleanTags([...folders, ...own]), favorite: false }
      out.push(last)
    }
  }
  return out
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A browser bookmark file (Netscape HTML) with the bookmarks in one folder; the tags go in a `TAGS` attribute. */
export function toBrowserHtml(list: BookmarkLike[], folder = 'Bookmarks', now = new Date()): string {
  const ts = Math.floor(now.getTime() / 1000)
  const items = list
    .filter((b) => /^https?:\/\//i.test(b.url))
    .map((b) => `        <DT><A HREF="${esc(b.url)}" ADD_DATE="${ts}"${b.tags.length ? ` TAGS="${esc(b.tags.join(','))}"` : ''}>${esc(b.title || b.url)}</A>${b.note.trim() ? `\n        <DD>${esc(b.note.trim())}` : ''}`)
  return [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file. It will be read and overwritten. DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
    `    <DT><H3 ADD_DATE="${ts}">${esc(folder)}</H3>`,
    '    <DL><p>',
    ...items,
    '    </DL><p>',
    '</DL><p>',
    '',
  ].join('\n')
}

// `open` is `frame` or `tab` (empty: the default of the list); `thumbnail` is a small `data:` image (empty: none).
// The Sites plugin writes this same format when its sites by address move to Bookmarks.
export const CSV_HEADER = ['title', 'url', 'note', 'tags', 'favorite', 'open', 'thumbnail']

/** The rows of a CSV file for the kit download. Tags are joined with `;`. */
export function toCsvRows(list: BookmarkLike[]): string[][] {
  return list.map((b) => [b.title, b.url, b.note, b.tags.join(';'), b.favorite ? 'yes' : 'no', b.openMode ?? '', safeThumbnail(b.thumbnail)])
}

/** Rows of values of a CSV (first row: names of the columns, in any order; `url` or `address` is required). */
export function parseCsvBookmarks(rows: string[][]): Imported[] {
  if (rows.length < 2) return []
  const head = rows[0]!.map((h) => h.trim().toLowerCase())
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h))
  const iUrl = col('url', 'address', 'link', 'href')
  if (iUrl < 0) return []
  const iTitle = col('title', 'name')
  const iNote = col('note', 'notes', 'description')
  const iTags = col('tags', 'labels')
  const iFav = col('favorite', 'favourite', 'starred')
  const iOpen = col('open', 'open_mode')
  const iThumb = col('thumbnail', 'picture')
  const out: Imported[] = []
  for (const r of rows.slice(1)) {
    const url = (r[iUrl] ?? '').trim()
    if (!/^https?:\/\//i.test(url)) continue
    out.push({
      title: (iTitle >= 0 ? (r[iTitle] ?? '').trim() : '') || url,
      url,
      note: iNote >= 0 ? (r[iNote] ?? '').trim() : '',
      tags: cleanTags(iTags >= 0 ? (r[iTags] ?? '').split(/[;,|]/) : []),
      favorite: iFav >= 0 && /^(1|yes|true|y|si|sì|x|★)$/i.test((r[iFav] ?? '').trim()),
      openMode: iOpen >= 0 ? parseOpenMode((r[iOpen] ?? '').trim().toLowerCase()) : '',
      thumbnail: iThumb >= 0 ? safeThumbnail((r[iThumb] ?? '').trim()) : '',
    })
  }
  return out
}

/** The rows of a CSV text (quotes, doubled quotes, line breaks inside quotes; `,` or `;` as separator). */
export function parseCsvText(text: string): string[][] {
  const t = text.replace(/^﻿/, '')
  const first = t.split('\n', 1)[0] ?? ''
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!
    if (q) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          cur += '"'
          i++
        } else q = false
      } else cur += c
    } else if (c === '"') q = true
    else if (c === sep) {
      row.push(cur)
      cur = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      row.push(cur)
      cur = ''
      if (row.some((x) => x !== '')) rows.push(row)
      row = []
    } else cur += c
  }
  row.push(cur)
  if (row.some((x) => x !== '')) rows.push(row)
  return rows
}

/** Clips an imported bookmark to what the server accepts (title 160, address 2000, note 2000). */
export function clip(b: Imported): Imported {
  return { ...b, title: b.title.slice(0, 160), url: b.url.slice(0, 2000), note: b.note.slice(0, 2000) }
}
