// Reading the files a person attaches: what the assistant accepts (images, PDF, text), the limits, and the language of the voice.
import type { AssistantAttachment } from '@mosaikit/plugin-api'

/** The limits of the kernel (`assistant::MAX_*`): a bigger file is refused here, before it is read. */
export const MAX_IMAGE_BYTES = 5 << 20
export const MAX_PDF_BYTES = 10 << 20
export const MAX_TEXT_BYTES = 200 << 10

const IMAGES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const TEXT_EXT = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'xml', 'yml', 'yaml', 'log', 'ini', 'toml', 'html', 'htm', 'css', 'js', 'ts', 'tsx', 'jsx', 'py',
  'rs', 'go', 'java', 'c', 'h', 'cpp', 'sql', 'sh', 'ps1', 'bat', 'tex',
])

export type Picked = { ok: true; file: AssistantAttachment } | { ok: false; reason: 'type' | 'size'; limit: string }

export interface Kind {
  kind: 'image' | 'pdf' | 'text'
  mime: string
  limit: number
}

/** What a file is for the assistant, or `null` when it is not accepted. A browser leaves the type empty for many text files: the
 *  extension decides then. */
export function kindOf(name: string, type: string): Kind | null {
  const t = type.toLowerCase()
  if (IMAGES.has(t)) return { kind: 'image', mime: t, limit: MAX_IMAGE_BYTES }
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (t === 'application/pdf' || (!t && ext === 'pdf')) return { kind: 'pdf', mime: 'application/pdf', limit: MAX_PDF_BYTES }
  if (t.startsWith('text/') || t === 'application/json' || t === 'application/xml') return { kind: 'text', mime: t, limit: MAX_TEXT_BYTES }
  if ((!t || t === 'application/octet-stream') && TEXT_EXT.has(ext)) {
    const mime = ext === 'csv' ? 'text/csv' : ext === 'md' || ext === 'markdown' ? 'text/markdown' : ext === 'json' ? 'application/json' : ext === 'xml' ? 'application/xml' : 'text/plain'
    return { kind: 'text', mime, limit: MAX_TEXT_BYTES }
  }
  return null
}

const kb = (n: number) => (n >= 1 << 20 ? `${n >> 20} MB` : `${n >> 10} KB`)

function base64Of(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

export async function readFile(file: File): Promise<Picked> {
  const k = kindOf(file.name, file.type)
  if (!k) return { ok: false, reason: 'type', limit: '' }
  if (file.size > k.limit) return { ok: false, reason: 'size', limit: kb(k.limit) }
  if (!file.size) return { ok: false, reason: 'type', limit: '' }
  const data = k.kind === 'text' ? await file.text() : await base64Of(file)
  return { ok: true, file: { name: file.name.slice(0, 120), kind: k.kind, mime: k.mime, data, size: file.size } }
}

/** The language of the speech recognition for the language of the interface. */
export function speechLang(lang: string): string {
  const map: Record<string, string> = { it: 'it-IT', en: 'en-US', es: 'es-ES', fr: 'fr-FR', pt: 'pt-PT', nl: 'nl-NL', ar: 'ar-SA', zh: 'zh-CN', ru: 'ru-RU' }
  const l = lang.toLowerCase().split('-')[0] ?? ''
  return map[l] ?? (typeof navigator === 'undefined' ? 'en-US' : navigator.language)
}
