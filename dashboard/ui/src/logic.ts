// What the Dashboard decides with no DOM: the keys of a board, the texts of a widget in the language of the person,
// the order of the widgets and the moves of the editor.

export type Tone = '' | 'ok' | 'warn' | 'err'
export type Columns = 'auto' | '2' | '3'
export type Lang = string

export interface WidgetTexts {
  label?: string
  secondary?: string
  empty?: string
  /** names of the categories and series of a chart: `high` -> `Alta` */
  categories?: Record<string, string>
}
export interface WidgetData {
  command?: string
  kind?: string
  size?: string
  texts?: Record<string, WidgetTexts>
}
export interface NumberResult {
  value: number
  secondary: number | null
  tone: Tone
  /** a few numbers over time, drawn as a sparkline */
  trend?: number[]
}
export interface ChartResult {
  type: 'line' | 'bar' | 'pie'
  categories: string[]
  series: { name: string; data: number[] }[]
}
export interface ListItem {
  id: string | null
  title: string
  meta: string
  tone: Tone
}
export interface ListResult {
  items: ListItem[]
  more: number
}
/** One entry of the answer of `dashboard.widgets`. */
export interface Widget {
  plugin: string
  id: string
  label: string | null
  data: WidgetData
  result?: NumberResult | ListResult | ChartResult
  error?: string
}

export const MAX_WIDGETS = 24

/** The key of a widget in a board. */
export const keyOf = (w: Pick<Widget, 'plugin' | 'id'>) => `${w.plugin}:${w.id}`

/** The widget keys stored in a board (a JSON array of text); anything else is an empty board. */
export function parseKeys(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const v: unknown = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    const out: string[] = []
    for (const k of v) if (typeof k === 'string' && k.includes(':') && !out.includes(k)) out.push(k)
    return out.slice(0, MAX_WIDGETS)
  } catch {
    return []
  }
}

export const columnsOf = (v: unknown): Columns => (v === '2' || v === '3' ? v : 'auto')

export const toneOf = (v: unknown): Tone => (v === 'ok' || v === 'warn' || v === 'err' ? v : '')

/** The texts of a widget in `lang`, the English ones when a text is missing there, the label of the contribution last. */
export function textsFor(w: Pick<Widget, 'label' | 'data'>, lang: Lang): Required<WidgetTexts> {
  const all = w.data?.texts ?? {}
  const str = (k: 'label' | 'secondary' | 'empty') => all[lang]?.[k] || all.en?.[k] || ''
  return { label: str('label') || w.label || '', secondary: str('secondary'), empty: str('empty'), categories: { ...all.en?.categories, ...all[lang]?.categories } }
}

/** The widgets of a board, in the order of its keys; a key nobody offers any more is left out. */
export function boardWidgets<T extends Pick<Widget, 'plugin' | 'id'>>(available: T[], keys: string[]): T[] {
  const by = new Map(available.map((w) => [keyOf(w), w]))
  const out: T[] = []
  for (const k of keys) {
    const w = by.get(k)
    if (w) out.push(w)
  }
  return out
}

/** The list of the editor: the keys of the board that are still offered first (in their order), then every other widget. */
export function editorOrder(available: Pick<Widget, 'plugin' | 'id'>[], keys: string[]): string[] {
  const all = available.map(keyOf)
  const chosen = keys.filter((k) => all.includes(k))
  return [...chosen, ...all.filter((k) => !chosen.includes(k))]
}

/** `list` with the item at `i` moved by `by` places (-1 up, +1 down); the same order when it cannot move. */
export function moveItem<T>(list: T[], i: number, by: number): T[] {
  const j = i + by
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return [...list]
  const out = [...list]
  const [x] = out.splice(i, 1)
  out.splice(j, 0, x)
  return out
}

/** The keys a board stores after the editor: the checked ones, in the order of the list. */
export function chosenKeys(order: string[], checked: Set<string>): string[] {
  return order.filter((k) => checked.has(k)).slice(0, MAX_WIDGETS)
}

/** The widgets of the first board: every one that is offered. */
export const defaultKeys = (available: Pick<Widget, 'plugin' | 'id'>[]): string[] => available.map(keyOf).slice(0, MAX_WIDGETS)

/** Whether the board refreshes by itself now: only while the page is visible. */
export const shouldRefresh = (visibility: string | undefined): boolean => visibility !== 'hidden'

/** The grid of the board: `auto` fills the width with columns of at least 260 px, a number is that many columns. */
export function gridColumns(c: Columns): string {
  return c === 'auto' ? 'repeat(auto-fill, minmax(260px, 1fr))' : `repeat(${c}, minmax(0, 1fr))`
}

/** The board that stays open: `id` when it is still there, else the first one. */
export const keepBoard = (ids: string[], id: string | null): string | null => (id && ids.includes(id) ? id : (ids[0] ?? null))

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/

/** The name of a chart category: a date is written in the language of the person (`3 Nov`), a key is looked up in the texts of the widget. */
export function categoryName(raw: string, names: Record<string, string>, lang: Lang): string {
  const m = ISO_DAY.exec(raw)
  if (m) {
    const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!))
    try {
      return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d)
    } catch {
      return raw
    }
  }
  return names[raw] ?? raw
}

/** The sum of the first series: what a chart widget shows as its big number. */
export const chartTotal = (r: ChartResult): number => (r.series[0]?.data ?? []).reduce((a, b) => a + b, 0)

/** True when a chart has nothing to draw (no category, or only zeros). */
export const chartEmpty = (r: ChartResult): boolean => !r.categories.length || r.series.every((s) => s.data.every((v) => !v))

/** Points `x,y` of a sparkline in a `w` x `h` box with `pad` around it: the lowest value sits at the bottom, a flat trend in the middle. */
export function sparkPoints(values: number[], w: number, h: number, pad = 2): { x: number; y: number }[] {
  if (values.length < 2) return []
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const step = (w - pad * 2) / (values.length - 1)
  return values.map((v, i) => ({ x: +(pad + i * step).toFixed(2), y: +(hi === lo ? h / 2 : h - pad - ((v - lo) / (hi - lo)) * (h - pad * 2)).toFixed(2) }))
}

/** The change of a number against another (`+12%`, `-3%`); null when there is nothing to compare with. */
export function deltaOf(now: number, before: number | null | undefined): { pct: number; dir: 'up' | 'down' | 'flat' } | null {
  if (before === null || before === undefined || before <= 0) return null
  const pct = Math.round(((now - before) / before) * 100)
  return { pct, dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' }
}
