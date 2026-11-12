// Drawing of a board with SVG, built with DOM APIs only (never innerHTML): the objects, the background, the export and the thumbnail.
import {
  INK, PAPER, arrowHead, byZ, clampLines, fontOf, lineHeightOf, objBox, penPath, swatchOf, unionBounds, wrapText, type Obj, type Rect,
} from './logic.ts'

const NS = 'http://www.w3.org/2000/svg'

export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...kids: (Node | string)[]): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  for (const k of kids) e.append(k)
  return e
}

export const FONT = 'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

/** Lines of text as `<text>` with one `<tspan>` per line (no foreignObject: it does not export). */
function lines(ls: string[], x: number, y: number, font: number, fill: string, anchor: 'start' | 'middle' = 'start'): SVGTextElement {
  const lh = lineHeightOf(font)
  const t = s('text', { x, y, 'font-size': font, fill, 'text-anchor': anchor, 'font-family': FONT })
  ls.forEach((l, i) => t.append(s('tspan', { x, dy: i === 0 ? 0 : lh }, l || '​')))
  return t
}

/** Draws one object into its group (replacing what was there). `hideText`: the text is being edited in a box over it. */
export function drawObject(o: Obj, g: SVGGElement, opts: { hideText?: boolean } = {}): void {
  const sw = swatchOf(o.color)
  const kids: SVGElement[] = []
  const text = opts.hideText ? '' : o.text
  const font = fontOf(o.type)
  const lh = lineHeightOf(font)
  switch (o.type) {
    case 'note': {
      kids.push(s('rect', { x: o.x + 2, y: o.y + 4, width: o.w, height: o.h, rx: 6, fill: '#000', opacity: 0.14 }))
      kids.push(s('rect', { x: o.x, y: o.y, width: o.w, height: o.h, rx: 6, fill: sw.fill, stroke: sw.stroke, 'stroke-width': 1, 'stroke-opacity': 0.55 }))
      const max = Math.max(1, Math.floor((o.h - 20) / lh))
      if (text) kids.push(lines(clampLines(wrapText(text, o.w - 24, font), max), o.x + 12, o.y + 12 + font, font, INK))
      break
    }
    case 'rect':
    case 'ellipse': {
      kids.push(
        o.type === 'rect'
          ? s('rect', { x: o.x, y: o.y, width: o.w, height: o.h, rx: 4, fill: sw.fill, stroke: sw.stroke, 'stroke-width': 2.5 })
          : s('ellipse', { cx: o.x + o.w / 2, cy: o.y + o.h / 2, rx: o.w / 2, ry: o.h / 2, fill: sw.fill, stroke: sw.stroke, 'stroke-width': 2.5 }),
      )
      if (text) {
        const inner = o.type === 'ellipse' ? o.w * 0.7 : o.w - 20
        const max = Math.max(1, Math.floor((o.h - 12) / lh))
        const ls = clampLines(wrapText(text, inner, font), max)
        kids.push(lines(ls, o.x + o.w / 2, o.y + o.h / 2 - (ls.length * lh) / 2 + font * 0.95, font, INK, 'middle'))
      }
      break
    }
    case 'text': {
      kids.push(s('rect', { x: o.x, y: o.y, width: o.w, height: o.h, fill: 'transparent' }))
      if (text) kids.push(lines(wrapText(text, o.w - 8, font), o.x + 4, o.y + 4 + font, font, sw.stroke))
      break
    }
    case 'arrow': {
      const [x0, y0, x1, y1] = [o.x + (o.points[0] ?? 0), o.y + (o.points[1] ?? 0), o.x + (o.points[2] ?? 0), o.y + (o.points[3] ?? 0)]
      const [l, r] = arrowHead({ x: x0, y: y0 }, { x: x1, y: y1 }, 16)
      kids.push(s('path', { d: `M${x0} ${y0}L${x1} ${y1}`, stroke: sw.stroke, 'stroke-width': 3, 'stroke-linecap': 'round', fill: 'none' }))
      kids.push(s('path', { d: `M${l.x} ${l.y}L${x1} ${y1}L${r.x} ${r.y}`, stroke: sw.stroke, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }))
      break
    }
    case 'pen':
      kids.push(s('path', { d: penPath(o.points), transform: `translate(${o.x} ${o.y})`, stroke: sw.stroke, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }))
      break
  }
  g.replaceChildren(...kids)
}

/** The pattern of a background (`dots`, `grid`) as `<pattern>`; the paper itself is drawn by the caller. Null for `plain`. */
export function bgPattern(bg: string, id: string, size = 24): SVGPatternElement | null {
  if (bg !== 'dots' && bg !== 'grid') return null
  const p = s('pattern', { id, width: size, height: size, patternUnits: 'userSpaceOnUse' })
  if (bg === 'dots') p.append(s('circle', { cx: size / 2, cy: size / 2, r: 1.3, fill: '#aab1c0' }))
  else p.append(s('path', { d: `M${size} 0H0V${size}`, fill: 'none', stroke: '#dde0e8', 'stroke-width': 1 }))
  return p
}

/** The box of everything on the board (null when empty). */
export const contentBox = (objs: Obj[]): Rect | null => unionBounds(objs.map(objBox))

/** A standalone SVG of the board for export: paper, background, every object in order, a margin around. */
export function exportSvg(objs: Obj[], bg: string, pad = 40): { svg: SVGSVGElement; w: number; h: number } {
  const box = contentBox(objs) ?? { x: 0, y: 0, w: 320, h: 200 }
  const x = Math.floor(box.x - pad)
  const y = Math.floor(box.y - pad)
  const w = Math.ceil(box.w + pad * 2)
  const h = Math.ceil(box.h + pad * 2)
  const svg = s('svg', { xmlns: NS, viewBox: `${x} ${y} ${w} ${h}`, width: w, height: h, 'font-family': FONT })
  const defs = s('defs')
  const pat = bgPattern(bg, 'bgp')
  if (pat) defs.append(pat)
  svg.append(defs, s('rect', { x, y, width: w, height: h, fill: PAPER }))
  if (pat) svg.append(s('rect', { x, y, width: w, height: h, fill: 'url(#bgp)' }))
  for (const o of byZ(objs)) {
    const g = s('g')
    drawObject(o, g)
    svg.append(g)
  }
  return { svg, w, h }
}

export const svgText = (svg: SVGSVGElement): string => '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg)

/** The board as a PNG (at 2x, never past 8000 pixels on a side). */
export async function exportPng(objs: Obj[], bg: string): Promise<Blob> {
  const { svg, w, h } = exportSvg(objs, bg)
  const scale = Math.min(2, 8000 / Math.max(w, h))
  const url = URL.createObjectURL(new Blob([svgText(svg)], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    img.decoding = 'async'
    await new Promise<void>((ok, no) => {
      img.onload = () => ok()
      img.onerror = () => no(new Error('image'))
      img.src = url
    })
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(w * scale))
    c.height = Math.max(1, Math.round(h * scale))
    const ctx = c.getContext('2d')!
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    return await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('png'))), 'image/png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** A small picture of a board for a card: the shapes without their text, at most 150 of them. Null when there are none. */
export function thumbnail(objs: Obj[]): SVGSVGElement | null {
  if (!objs.length) return null
  const shown = byZ(objs).slice(-150)
  const box = contentBox(shown)!
  const pad = Math.max(box.w, box.h) * 0.06 + 10
  const svg = s('svg', { viewBox: `${box.x - pad} ${box.y - pad} ${box.w + pad * 2} ${box.h + pad * 2}`, preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true', focusable: 'false' })
  for (const o of shown) {
    const g = s('g')
    drawObject({ ...o, text: '' }, g)
    svg.append(g)
  }
  return svg
}
