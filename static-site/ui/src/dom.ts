// Small DOM builder: no innerHTML with data of the records.

type Child = Node | string | null | undefined | false

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue
    if (k === 'class') el.className = String(v)
    else el.setAttribute(k, v === true ? '' : v)
  }
  for (const c of children) if (c) el.append(c)
  return el
}

export function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
