// Costruzione del DOM senza innerHTML: i nomi dei file entrano solo come testo.
import { ext, kindColor, kindOf, type Kind } from './util.ts'

type Child = Node | string | number | null | undefined | false
type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue
      if (typeof v === 'function') el.addEventListener(k.replace(/^on/, ''), v)
      else if (k === 'class') el.className = String(v)
      else if (v === true) el.setAttribute(k, '')
      else el.setAttribute(k, String(v))
    }
  }
  append(el, children)
  return el
}

export function append(el: Element, children: (Child | Child[])[]) {
  for (const c of children.flat()) {
    if (c == null || c === false) continue
    el.append(typeof c === 'object' ? c : String(c))
  }
}

const NS = 'http://www.w3.org/2000/svg'

function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
  return el
}

// tracciati delle icone di interfaccia (stroke): solo costanti
const PATHS = {
  upload: ['M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16'],
  folderPlus: ['M3 7.5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 10.5v5m-2.5-2.5h5'],
  list: ['M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01'],
  grid: ['M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z'],
  search: ['m20 20-4.2-4.2M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z'],
  home: ['M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z'],
  eye: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
  download: ['M12 4v12m0 0-4.5-4.5M12 16l4.5-4.5M4 20h16'],
  edit: ['M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4'],
  move: ['M3 7.5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 13h6m-2.5-2.5L15 13l-2.5 2.5'],
  copy: ['M8.5 8.5h10v11h-10zM15.5 8.5V4.5h-10v11h3'],
  trash: ['M4.5 7h15M10 11v6m4-6v6M6 7l1 12.5h10L18 7M9 7V4.5h6V7'],
  x: ['M6 6l12 12M18 6 6 18'],
  open: ['M3 7.5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  left: ['M15 5l-7 7 7 7'],
  right: ['M9 5l7 7-7 7'],
  up: ['M12 19V5m0 0-6 6m6-6 6 6'],
  refresh: ['M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6'],
  info: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 11v5.5M12 7.5h.01'],
  zip: ['M6 3.5h12v17H6zM11 3.5v2h2v2h-2v2h2v2h-2M10.5 14h3v3h-3z'],
  check: ['M5 12.5 10 17 19 7'],
  share: ['M8.6 13.5l6.8 4M15.4 6.5l-6.8 4M21 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM9 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 19a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
  external: ['M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'],
  users: ['M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M13.5 7.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0zM20 19v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.1a3.5 3.5 0 0 1 0 6.8'],
} as const

export type IconName = keyof typeof PATHS

/** Icona di interfaccia. */
export function svg(name: IconName, cls = ''): SVGElement {
  const s = svgEl('svg', {
    class: 'si' + (cls ? ' ' + cls : ''),
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.8,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  })
  for (const d of PATHS[name]) s.append(svgEl('path', { d }))
  return s
}

/** Icona del tipo di file (cartella o foglio con l'estensione). */
export function fileIcon(e: { name: string; is_dir: boolean }, big = false): SVGElement {
  const size = big ? 64 : 22
  const s = svgEl('svg', { class: 'ic', width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': 'true' })
  const k: Kind = kindOf(e)
  if (k === 'dir') {
    s.append(
      svgEl('path', { d: 'M2.5 6.5a2 2 0 0 1 2-2h4.6l2 2.2h8.4a2 2 0 0 1 2 2v9.8a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2z', fill: '#c98d24' }),
      svgEl('path', { d: 'M2.5 9.2a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2v8.3a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2z', fill: '#f0b23e' }),
    )
    return s
  }
  const c = kindColor(k)
  s.append(
    svgEl('path', { d: 'M5.5 2.5h9L20 8v12.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 20.5V4a1.5 1.5 0 0 1 1.5-1.5z', fill: '#232730', stroke: c, 'stroke-width': 1.2 }),
    svgEl('path', { d: 'M14.5 2.5V7a1 1 0 0 0 1 1H20', fill: 'none', stroke: c, 'stroke-width': 1.2 }),
  )
  const x = ext(e.name).slice(0, 4).toUpperCase()
  if (x) {
    const w = Math.max(9, x.length * 3.6 + 3)
    const t = svgEl('text', { x: 2 + w / 2, y: 17.4, 'text-anchor': 'middle', 'font-size': 4.6, 'font-weight': 700, 'font-family': 'system-ui,sans-serif', fill: '#111' })
    t.textContent = x
    s.append(svgEl('rect', { x: 2, y: 12.5, width: w, height: 6.5, rx: 1.4, fill: c }), t)
  }
  return s
}

export function spinner(): HTMLElement {
  return h('div', { class: 'fm-spin', role: 'status', 'aria-label': 'Caricamento' })
}

/** Scarica un Blob con un nome (object URL revocato dopo). */
export function saveBlob(blob: Blob, name: string) {
  const u = URL.createObjectURL(blob)
  const a = h('a', { href: u, download: name, style: 'display:none' })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(u), 30_000)
}
