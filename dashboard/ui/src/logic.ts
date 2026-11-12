// What the Dashboard decides with no DOM: the keys of a board, the texts of a widget in the language of the person,
// the order of the widgets and the moves of the editor.

export type Tone = '' | 'ok' | 'warn' | 'err'
export type Columns = 'auto' | '2' | '3'
export type Lang = 'en' | 'it' | 'es'

export interface WidgetTexts {
  label?: string
  secondary?: string
  empty?: string
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
  result?: NumberResult | ListResult
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
  const pick = (k: keyof WidgetTexts) => all[lang]?.[k] || all.en?.[k] || ''
  return { label: pick('label') || w.label || '', secondary: pick('secondary'), empty: pick('empty') }
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
