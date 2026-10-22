// Pure functions of the file manager (formatting, kinds of file, sorting, names).
import type { FileEntry, Level } from '@mosaikit/plugin-api'
import { locale, t } from './i18n.ts'

export { plural } from './i18n.ts'

export const TEXT_MAX = 512 * 1024 // text preview: first 512 KB
export const THUMB_MAX = 8 * 1024 * 1024 // no thumbnails over 8 MB

export type SortKey = 'name' | 'kind' | 'modified' | 'size'
export type Kind = 'dir' | 'image' | 'video' | 'audio' | 'pdf' | 'code' | 'text' | 'archive' | 'doc' | 'file'

interface KindInfo {
  re: RegExp
  /** English label, translated when shown */
  label: string
  color: string
}

export const KINDS: Record<Exclude<Kind, 'dir' | 'file'>, KindInfo> = {
  image: { re: /^(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/, label: 'Image', color: '#4fc3a1' },
  video: { re: /^(mp4|webm|ogv|mov)$/, label: 'Video', color: '#a78bfa' },
  audio: { re: /^(mp3|wav|ogg|oga|m4a|flac)$/, label: 'Audio', color: '#f472b6' },
  pdf: { re: /^pdf$/, label: 'PDF document', color: '#ef6461' },
  code: { re: /^(js|mjs|cjs|ts|tsx|jsx|json|geojson|html?|css|scss|rs|py|sh|sql|xml|ya?ml|toml|ini|go|java|c|h|cpp|cs|php|rb)$/, label: 'Code', color: '#60a5fa' },
  text: { re: /^(txt|md|log|csv|tsv)$/, label: 'Text', color: '#c9c2b3' },
  archive: { re: /^(zip|rar|7z|tar|gz|tgz|mskp)$/, label: 'Archive', color: '#f59e5b' },
  doc: { re: /^(docx?|odt|rtf|xlsx?|ods|pptx?|odp)$/, label: 'Document', color: '#38bdf8' },
}

type Named = Pick<FileEntry, 'name' | 'is_dir'>

export function ext(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1).toLowerCase() : ''
}

export function kindOf(e: Named): Kind {
  if (e.is_dir) return 'dir'
  const x = ext(e.name)
  for (const [k, info] of Object.entries(KINDS)) if (info.re.test(x)) return k as Kind
  return 'file'
}

export function kindColor(k: Kind): string {
  return k === 'dir' || k === 'file' ? '#8f887a' : KINDS[k].color
}

export function kindLabel(e: Named): string {
  const k = kindOf(e)
  const x = ext(e.name).toUpperCase()
  if (k === 'dir') return t('Folder')
  if (k === 'file') return x ? t('{ext} file', { ext: x }) : t('File')
  return t(KINDS[k].label) + (x ? ' · ' + x : '')
}

/** Preview available: images, audio/video, PDF, text and code (always as text). */
export function previewable(e: Named): boolean {
  return !e.is_dir && /^(image|video|audio|pdf|code|text)$/.test(kindOf(e))
}

/** SVG images are shown as source: never as active content. */
export function previewMode(e: Named): 'image' | 'video' | 'audio' | 'pdf' | 'text' | null {
  if (!previewable(e)) return null
  const k = kindOf(e)
  if (k === 'image') return ext(e.name) === 'svg' ? 'text' : 'image'
  if (k === 'code' || k === 'text') return 'text'
  return k as 'video' | 'audio' | 'pdf'
}

export function fmtSize(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  if (n < 1024) return n + ' B'
  const u = ['KB', 'MB', 'GB', 'TB']
  let i = -1
  do {
    n /= 1024
    i++
  } while (n >= 1024 && i < u.length - 1)
  return (n < 10 ? n.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : Math.round(n)) + ' ' + u[i]
}

export function fmtDate(iso: string | null | undefined, long = false, now = new Date()): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const time = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
  if (long) return d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ', ' + time
  if (d.toDateString() === now.toDateString()) return t('Today, {time}', { time })
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return t('Yesterday, {time}', { time })
  return d.toLocaleDateString(locale(), { day: '2-digit', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
}

export function fmtDuration(s: number): string {
  const total = Math.round(s)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = String(total % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

function time(iso: string): number {
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? 0 : ms
}

/** Filters by name and sorts: folders always first, then by key, by name when equal. */
export function sortEntries(entries: FileEntry[], key: SortKey, dir: 1 | -1, filter = ''): FileEntry[] {
  const f = filter.trim().toLowerCase()
  const list = entries.filter((e) => !f || e.name.toLowerCase().includes(f))
  const byName = (a: FileEntry, b: FileEntry) => a.name.localeCompare(b.name, locale(), { numeric: true, sensitivity: 'base' })
  return list.sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
    let r = 0
    if (key === 'size') r = (a.is_dir ? 0 : a.size) - (b.is_dir ? 0 : b.size)
    else if (key === 'modified') r = time(a.modified) - time(b.modified)
    else if (key === 'kind') r = kindLabel(a).localeCompare(kindLabel(b), locale())
    if (!r) r = byName(a, b)
    return r * dir
  })
}

/** First free name "name (n).ext" that is not in `taken`. */
export function freeName(name: string, taken: Set<string>, isDir = false): string {
  const i = isDir ? -1 : name.lastIndexOf('.')
  const base = i > 0 ? name.slice(0, i) : name
  const x = i > 0 ? name.slice(i) : ''
  for (let n = 1; ; n++) {
    const c = `${base} (${n})${x}`
    if (!taken.has(c)) return c
  }
}

/** The same rules as the server (util::valid_name), with translated messages. */
export function validName(v: string): string {
  if (!v.trim()) return t('the name cannot be empty')
  if (v.trim() !== v) return t('the name cannot start or end with spaces')
  if (v.length > 255) return t('the name is too long (at most 255 characters)')
  if (/[/\\]/.test(v)) return t('the name cannot contain / or \\')
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(v)) return t('the name contains invalid characters')
  if (v === '.' || v === '..') return t('invalid name')
  return ''
}

const RANK: Record<Level, number> = { read: 1, write: 2, manage: 3 }

export function atLeast(level: Level | undefined, need: Level): boolean {
  return !!level && RANK[level] >= RANK[need]
}

const LEVEL_LABEL: Record<Level, string> = {
  read: 'Read',
  write: 'Edit',
  manage: 'Manage',
}

export function levelLabel(l: Level): string {
  return t(LEVEL_LABEL[l])
}

/** Error as text (the errors of the bridge are already messages of the server). */
export function errMsg(e: unknown): string {
  let m = e instanceof Error ? e.message : String(e)
  try {
    const j = JSON.parse(m) as { error?: string; message?: string }
    if (j && (j.error || j.message)) m = (j.error || j.message) as string
  } catch {
    // plain text
  }
  return m
}

/** A name already taken: the message of the server (English, or Italian from older servers). */
export function isConflict(e: unknown): boolean {
  return /already exists|esiste gi/i.test(errMsg(e))
}
