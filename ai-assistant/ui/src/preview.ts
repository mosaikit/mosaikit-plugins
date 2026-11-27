// A change the assistant proposes, said in words for the card in the chat (the platform shows the same in its own dialog).
export interface PreviewRow {
  label: string
  value: string
  long: boolean
}

export interface ToolShape {
  name: string
  description: string
  input_schema?: unknown
  /** in the language of the person, from the platform */
  app?: string
  subject?: string
  verb?: string
  fields?: { key: string; label: string }[]
}

export function humanize(key: string): string {
  const s = key.replace(/[_-]+/g, ' ').trim()
  return s ? s[0]!.toUpperCase() + s.slice(1) : key
}

export function formatValue(v: unknown, lang: string, yes: string, no: string): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? yes : no
  if (typeof v === 'number') return new Intl.NumberFormat(lang).format(v)
  if (typeof v === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      if (!Number.isNaN(d.getTime())) return d.toLocaleDateString(lang, { year: 'numeric', month: 'long', day: 'numeric' })
    }
    return v.trim()
  }
  if (Array.isArray(v)) return v.map((x) => formatValue(x, lang, yes, no)).filter(Boolean).join(', ')
  return JSON.stringify(v)
}

/** The fields of a call as «label: value», the labels from the schema of the tool. */
export function rowsOf(tool: ToolShape | undefined, args: unknown, lang: string, yes: string, no: string): PreviewRow[] {
  const obj = args && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, unknown>) : {}
  const props = ((tool?.input_schema as { properties?: Record<string, { description?: string }> } | undefined)?.properties ?? {}) as Record<string, { description?: string }>
  // the order of the manifest and the labels of the person's language; the schema of the model has neither
  const labels = new Map((tool?.fields ?? []).map((f) => [f.key, f.label]))
  const ordered = (tool?.fields ?? []).map((f) => f.key).filter((k) => k in obj)
  const keys = [...ordered, ...Object.keys(props).filter((k) => k in obj && !ordered.includes(k)), ...Object.keys(obj).filter((k) => !(k in props) && !ordered.includes(k))]
  const rows: PreviewRow[] = []
  for (const k of keys) {
    if (k === 'id') continue
    const value = formatValue(obj[k], lang, yes, no)
    if (!value) continue
    const label = labels.get(k) ?? (props[k]?.description ? props[k]!.description!.replace(/\s*\([^)]*\)\s*$/, '').trim() : humanize(k))
    rows.push({ label, value, long: value.length > 80 || value.includes('\n') })
  }
  return rows
}

/** `create`, `update` or `run`, from the name of the tool. */
export function verbOf(name: string): 'create' | 'update' | 'run' {
  return /create|add|new/.test(name) ? 'create' : /update|edit|change/.test(name) ? 'update' : 'run'
}
