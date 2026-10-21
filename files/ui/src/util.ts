// Funzioni pure del file manager (formattazione, tipi di file, ordinamento, nomi).
import type { FileEntry, Level } from '@mosaikit/plugin-api'

export const TEXT_MAX = 512 * 1024 // anteprima testo: primi 512 KB
export const THUMB_MAX = 8 * 1024 * 1024 // niente miniature oltre 8 MB

export type SortKey = 'name' | 'kind' | 'modified' | 'size'
export type Kind = 'dir' | 'image' | 'video' | 'audio' | 'pdf' | 'code' | 'text' | 'archive' | 'doc' | 'file'

interface KindInfo {
  re: RegExp
  label: string
  color: string
}

export const KINDS: Record<Exclude<Kind, 'dir' | 'file'>, KindInfo> = {
  image: { re: /^(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/, label: 'Immagine', color: '#4fc3a1' },
  video: { re: /^(mp4|webm|ogv|mov)$/, label: 'Video', color: '#a78bfa' },
  audio: { re: /^(mp3|wav|ogg|oga|m4a|flac)$/, label: 'Audio', color: '#f472b6' },
  pdf: { re: /^pdf$/, label: 'Documento PDF', color: '#ef6461' },
  code: { re: /^(js|mjs|cjs|ts|tsx|jsx|json|geojson|html?|css|scss|rs|py|sh|sql|xml|ya?ml|toml|ini|go|java|c|h|cpp|cs|php|rb)$/, label: 'Codice', color: '#60a5fa' },
  text: { re: /^(txt|md|log|csv|tsv)$/, label: 'Testo', color: '#c9c2b3' },
  archive: { re: /^(zip|rar|7z|tar|gz|tgz|mskp)$/, label: 'Archivio', color: '#f59e5b' },
  doc: { re: /^(docx?|odt|rtf|xlsx?|ods|pptx?|odp)$/, label: 'Documento', color: '#38bdf8' },
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
  if (k === 'dir') return 'Cartella'
  if (k === 'file') return x ? 'File ' + x : 'File'
  return KINDS[k].label + (x ? ' · ' + x : '')
}

/** Anteprima disponibile: immagini, audio/video, PDF, testo e codice (sempre come testo). */
export function previewable(e: Named): boolean {
  return !e.is_dir && /^(image|video|audio|pdf|code|text)$/.test(kindOf(e))
}

/** Le immagini SVG si mostrano come sorgente: mai come contenuto attivo. */
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
  return (n < 10 ? n.toFixed(1).replace('.', ',') : Math.round(n)) + ' ' + u[i]
}

export function fmtDate(iso: string | null | undefined, long = false, now = new Date()): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  if (long) return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ', ' + time
  if (d.toDateString() === now.toDateString()) return 'Oggi, ' + time
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'Ieri, ' + time
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
}

export function fmtDuration(s: number): string {
  const t = Math.round(s)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const sec = String(t % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

export function plural(n: number, one: string, many: string): string {
  return n + ' ' + (n === 1 ? one : many)
}

function time(iso: string): number {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : t
}

/** Filtra per nome e ordina: cartelle sempre in testa, poi per chiave, a parita' per nome. */
export function sortEntries(entries: FileEntry[], key: SortKey, dir: 1 | -1, filter = ''): FileEntry[] {
  const f = filter.trim().toLowerCase()
  const list = entries.filter((e) => !f || e.name.toLowerCase().includes(f))
  const byName = (a: FileEntry, b: FileEntry) => a.name.localeCompare(b.name, 'it', { numeric: true, sensitivity: 'base' })
  return list.sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
    let r = 0
    if (key === 'size') r = (a.is_dir ? 0 : a.size) - (b.is_dir ? 0 : b.size)
    else if (key === 'modified') r = time(a.modified) - time(b.modified)
    else if (key === 'kind') r = kindLabel(a).localeCompare(kindLabel(b), 'it')
    if (!r) r = byName(a, b)
    return r * dir
  })
}

/** Primo nome libero "nome (n).ext" che non sia in `taken`. */
export function freeName(name: string, taken: Set<string>, isDir = false): string {
  const i = isDir ? -1 : name.lastIndexOf('.')
  const base = i > 0 ? name.slice(0, i) : name
  const x = i > 0 ? name.slice(i) : ''
  for (let n = 1; ; n++) {
    const c = `${base} (${n})${x}`
    if (!taken.has(c)) return c
  }
}

/** Stesse regole del server (util::valid_name), con messaggi in italiano. */
export function validName(v: string): string {
  if (!v.trim()) return 'il nome non può essere vuoto'
  if (v.trim() !== v) return 'il nome non può iniziare o finire con spazi'
  if (v.length > 255) return 'il nome è troppo lungo (massimo 255 caratteri)'
  if (/[/\\]/.test(v)) return 'il nome non può contenere / o \\'
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(v)) return 'il nome contiene caratteri non validi'
  if (v === '.' || v === '..') return 'nome non valido'
  return ''
}

const RANK: Record<Level, number> = { read: 1, write: 2, manage: 3 }

export function atLeast(level: Level | undefined, need: Level): boolean {
  return !!level && RANK[level] >= RANK[need]
}

export const LEVEL_LABEL: Record<Level, string> = {
  read: 'Lettura',
  write: 'Modifica',
  manage: 'Gestione',
}

/** Errore come testo (gli errori del bridge sono gia' messaggi del server). */
export function errMsg(e: unknown): string {
  let m = e instanceof Error ? e.message : String(e)
  try {
    const j = JSON.parse(m) as { error?: string; message?: string }
    if (j && (j.error || j.message)) m = (j.error || j.message) as string
  } catch {
    // testo semplice
  }
  return m
}

export function isConflict(e: unknown): boolean {
  return /esiste gi/i.test(errMsg(e))
}
