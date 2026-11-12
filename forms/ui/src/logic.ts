// What the Forms UI decides, with no DOM: the fields of a form, the checks of the builder, the checks of an answer (the same
// rules as the logic of the plugin, so a person is told before sending), the counts and the CSV of the answers, and what the
// public page needs (the browser id and the meaning of the errors).

export type Kind = 'text' | 'longtext' | 'choice' | 'multi' | 'number' | 'date' | 'email'
export const KINDS: Kind[] = ['text', 'longtext', 'choice', 'multi', 'number', 'date', 'email']
export const MAX_FIELDS = 30
export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 12
export const MAX_TEXT = 200
export const MAX_LONG = 2000
export const MAX_ANSWERS_TOP = 5000

export interface Field {
  id: string
  label: string
  kind: Kind
  options: string[]
  required: boolean
  help: string
}

/** An answer to one field: a text, or the chosen options of a multi field. */
export type Value = string | string[]
export type Values = Record<string, Value>

let counter = 0
/** An id for a field: unique in the form, short, made of letters and digits. */
export function freshId(): string {
  counter += 1
  return 'f' + Date.now().toString(36) + counter.toString(36) + Math.random().toString(36).slice(2, 5)
}

export function hasOptions(k: Kind): boolean {
  return k === 'choice' || k === 'multi'
}

/** A new empty field of a kind (two empty options for the kinds that have options). */
export function newField(kind: Kind = 'text', id: string = freshId()): Field {
  return { id, label: '', kind, options: hasOptions(kind) ? ['', ''] : [], required: false, help: '' }
}

/** The fields stored in a form (a JSON text), forgiving: whatever is not a valid field is dropped. */
export function parseFields(raw: unknown): Field[] {
  let data: unknown
  try {
    data = typeof raw === 'string' && raw.trim() ? JSON.parse(raw) : []
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  const out: Field[] = []
  for (const f of data) {
    if (!f || typeof f !== 'object') continue
    const o = f as Record<string, unknown>
    const kind = KINDS.includes(o.kind as Kind) ? (o.kind as Kind) : null
    if (!kind || typeof o.id !== 'string') continue
    out.push({
      id: o.id,
      label: String(o.label ?? ''),
      kind,
      options: Array.isArray(o.options) ? o.options.map(String) : [],
      required: o.required === true,
      help: String(o.help ?? ''),
    })
  }
  return out
}

/** What the builder sends: texts trimmed, options only where they belong. */
export function cleanFields(list: Field[]): Field[] {
  return list.map((f) => ({ ...f, label: f.label.trim(), help: f.help.trim(), options: hasOptions(f.kind) ? f.options.map((o) => o.trim()) : [] }))
}

export type Problem = { index: number; key: 'needLabel' | 'needOptions' | 'needOptionText' | 'needDupOption' | 'tooMany' }

/** The first thing wrong with the fields (the hook of the plugin says the same), or null. `index` is 0-based. */
export function firstProblem(list: Field[]): Problem | null {
  if (list.length > MAX_FIELDS) return { index: MAX_FIELDS, key: 'tooMany' }
  const clean = cleanFields(list)
  for (let i = 0; i < clean.length; i++) {
    const f = clean[i]
    if (!f.label) return { index: i, key: 'needLabel' }
    if (hasOptions(f.kind)) {
      if (f.options.length < MIN_OPTIONS || f.options.length > MAX_OPTIONS) return { index: i, key: 'needOptions' }
      if (f.options.some((o) => !o)) return { index: i, key: 'needOptionText' }
      if (new Set(f.options).size !== f.options.length) return { index: i, key: 'needDupOption' }
    }
  }
  return null
}

/** The cap of answers as the text of the builder: empty (the default) or a whole number from 1 to 5000. */
export function validMaxAnswers(raw: string): boolean {
  const s = raw.trim()
  if (!s) return true
  return /^\d{1,4}$/.test(s) && Number(s) >= 1 && Number(s) <= MAX_ANSWERS_TOP
}

/** Moves the item `i` by `dir` (-1 up, +1 down); a new list, the same one when it cannot move. */
export function moveItem<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return list
  const out = [...list]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

/** A form is open when it is switched on and its closing day (YYYY-MM-DD) is not past. */
export function isOpen(f: { open: boolean; closesOn: string }, today: string): boolean {
  return f.open && !(f.closesOn && f.closesOn < today)
}

/** Today as YYYY-MM-DD in the local time of the person. */
export function todayLocal(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

// -------------------------------------------------------------------------------------------------------- the answer

export function isEmail(s: string): boolean {
  // no space and no control character
  if ([...s].some((c) => c.charCodeAt(0) <= 0x1f || /\s/.test(c))) return false
  const parts = s.split('@')
  if (parts.length !== 2) return false
  const [local, domain] = parts
  return local.length > 0 && domain.includes('.') && domain.split('.').every((p) => p.length > 0) && !domain.startsWith('-')
}

export function isDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (y < 1 || mo < 1 || mo > 12) return false
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1]
  return d >= 1 && d <= days
}

/** A number as plain text: an optional minus, digits and an optional fraction (what the logic of the plugin accepts). */
export function isNumber(s: string): boolean {
  const t = s.trim()
  return t.length <= 20 && /^-?\d+(\.\d+)?$/.test(t)
}

/** Whether an answer counts as given (an empty text, an empty selection or nothing is not an answer). */
export function isAnswered(a: Value | undefined): boolean {
  if (a === undefined) return false
  if (typeof a === 'string') return a.trim().length > 0
  return a.length > 0
}

export type AnswerError = { id: string; key: 'eRequired' | 'eEmail' | 'eNumber' | 'eDate' | 'eChoice' | 'eLong'; label: string; max?: number }

/** What is wrong with the values of an answer, field by field and in the order of the form (empty when it can be sent). */
export function checkValues(fields: Field[], values: Values): AnswerError[] {
  const out: AnswerError[] = []
  for (const f of fields) {
    const v = values[f.id]
    if (!isAnswered(v)) {
      if (f.required) out.push({ id: f.id, key: 'eRequired', label: f.label })
      continue
    }
    const s = typeof v === 'string' ? v.trim() : ''
    if (f.kind === 'text' && s.length > MAX_TEXT) out.push({ id: f.id, key: 'eLong', label: f.label, max: MAX_TEXT })
    else if (f.kind === 'longtext' && s.length > MAX_LONG) out.push({ id: f.id, key: 'eLong', label: f.label, max: MAX_LONG })
    else if (f.kind === 'email' && !(s.length <= MAX_TEXT && isEmail(s))) out.push({ id: f.id, key: 'eEmail', label: f.label })
    else if (f.kind === 'number' && !isNumber(s)) out.push({ id: f.id, key: 'eNumber', label: f.label })
    else if (f.kind === 'date' && !isDate(s)) out.push({ id: f.id, key: 'eDate', label: f.label })
    else if (f.kind === 'choice' && !f.options.includes(s)) out.push({ id: f.id, key: 'eChoice', label: f.label })
    else if (f.kind === 'multi' && !(Array.isArray(v) && v.every((x) => f.options.includes(x)))) out.push({ id: f.id, key: 'eChoice', label: f.label })
  }
  return out
}

/** The values as the commands want them: only the given ones, texts trimmed. */
export function valuesToSend(fields: Field[], values: Values): Values {
  const out: Values = {}
  for (const f of fields) {
    const v = values[f.id]
    if (isAnswered(v)) out[f.id] = typeof v === 'string' ? v.trim() : v!
  }
  return out
}

// -------------------------------------------------------------------------------------------------------- the counts

/** A whole percentage of `n` out of `total` (0 when there is no total). */
export function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0
}

// ---------------------------------------------------------------------------------------------------------------- CSV

/** One cell of a CSV: a text starting with = + - @ (or a tab or return) gets a leading quote so a spreadsheet never runs it
 * as a formula; a cell with a comma, a quote or a line break is quoted and its quotes doubled. */
export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  let s = String(v)
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export interface AnswerRow {
  id: string
  name: string
  at: string
  values: Record<string, Value | undefined>
}

/** The text of an answer for a table or a CSV: several options joined by a semicolon. */
export function valueText(v: Value | undefined): string {
  if (v === undefined) return ''
  return Array.isArray(v) ? v.join('; ') : v
}

/** The CSV of the answers: a header (name, date, one column per field) and one row per answer; BOM is added by the download. */
export function buildCsv(fields: Field[], rows: AnswerRow[], head: { name: string; submitted: string }): string {
  const header = [head.name, head.submitted, ...fields.map((f) => f.label)]
  const body = rows.map((r) => [r.name, r.at, ...fields.map((f) => valueText(r.values[f.id]))])
  return [header, ...body].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** A file name from a title: lower case letters, digits and dashes. */
export function slug(title: string, fallback = 'form'): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback
}

// ------------------------------------------------------------------------------------------------------ public page

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Whether a text is a UUID (the id of a browser that answers from a public link). */
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v)
}

/** A new random browser id (a UUID v4). */
export function newBrowserId(): string {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID()
  const b = new Uint8Array(16)
  if (c?.getRandomValues) c.getRandomValues(b)
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const x = Array.from(b, (n) => n.toString(16).padStart(2, '0')).join('')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}

export type PublicProblem = 'already' | 'closed' | 'full' | 'rate' | 'off' | 'rejected' | 'invalid' | 'other'

/** What went wrong in a public call, from the code of the error. */
export function publicProblem(e: unknown): PublicProblem {
  const code = (e as { code?: unknown } | null)?.code
  if (typeof code !== 'string') return 'other'
  switch (code) {
    case 'already_answered':
      return 'already'
    case 'form_closed':
      return 'closed'
    case 'form_full':
      return 'full'
    case 'public_rate_limited':
      return 'rate'
    case 'public_commands_off':
      return 'off'
    case 'answer_rejected':
      return 'rejected'
    default:
      return code.startsWith('answer_') || code === 'form_empty' || code === 'browser_invalid' ? 'invalid' : 'other'
  }
}
