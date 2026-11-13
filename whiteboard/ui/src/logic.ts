// Pure logic of the Whiteboard: geometry, the palette, word wrap, simplification of a drawing, ids and the rules of who may edit.
// Nothing here touches the DOM or the network, so all of it is tested with vitest.

export type ObjType = 'note' | 'rect' | 'ellipse' | 'text' | 'arrow' | 'pen' | 'frame'
export const OBJ_TYPES: ObjType[] = ['note', 'rect', 'ellipse', 'text', 'arrow', 'pen', 'frame']

/** One thing on the board. `points` (arrow, pen) are flat `[x0, y0, x1, y1, ...]` relative to `x`, `y`: moving is one change. */
export interface Obj {
  id: string
  type: ObjType
  x: number
  y: number
  w: number
  h: number
  text: string
  color: string
  points: number[]
  z: number
  author: string
}

export interface Pt {
  x: number
  y: number
}
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

// ------------------------------------------------------------------------------------------------------------------ palette

export interface Swatch {
  key: string
  /** light fill of a note, a shape; the text on it is always `INK` */
  fill: string
  /** line, text and pen colour: dark enough for 4.5:1 on the paper */
  stroke: string
}
/** The ink of the text inside a note or a shape. */
export const INK = '#1f2430'
/** The paper of the board (the same in light and dark mode: a whiteboard is white, and exports look the same). */
export const PAPER = '#fbfbfd'
export const PALETTE: Swatch[] = [
  { key: 'yellow', fill: '#fff3a3', stroke: '#7a5c00' },
  { key: 'orange', fill: '#ffd9b0', stroke: '#a34a00' },
  { key: 'red', fill: '#ffc9c9', stroke: '#b3261e' },
  { key: 'pink', fill: '#ffcfe8', stroke: '#a31f6b' },
  { key: 'purple', fill: '#dccbff', stroke: '#5b32b8' },
  { key: 'blue', fill: '#bfdcff', stroke: '#1a55b0' },
  { key: 'green', fill: '#c4ecc8', stroke: '#1d6b2c' },
  { key: 'gray', fill: '#e3e6ec', stroke: '#3d4452' },
]
export const DEFAULT_COLOR = 'yellow'
export const swatchOf = (key: string): Swatch => PALETTE.find((s) => s.key === key) ?? PALETTE[0]!

/** A palette colour for a person, always the same for the same id (the pointer of someone else). */
export function personColor(id: string): Swatch {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]!
}

// ------------------------------------------------------------------------------------------------------------------ ids

/** A new id for an object: short, URL-safe, unique enough to never collide between two people drawing at once. */
export function newId(rand: () => number = Math.random): string {
  let s = ''
  for (let i = 0; i < 4; i++) s += Math.floor(rand() * 36 ** 4).toString(36).padStart(4, '0')
  return 'o' + s
}

// ------------------------------------------------------------------------------------------------------------------ sizes

export const NOTE_SIZE = { w: 180, h: 140 }
export const SHAPE_SIZE = { w: 160, h: 100 }
export const TEXT_WIDTH = 220
/** A frame: a titled area that groups what is inside it. */
export const FRAME_SIZE = { w: 420, h: 300 }
export const FRAME_TITLE_H = 34
export const NOTE_FONT = 17
export const SHAPE_FONT = 16
export const TEXT_FONT = 22
export const MIN_SIZE = 24
export const MAX_POINTS = 400

export const fontOf = (t: ObjType): number => (t === 'note' ? NOTE_FONT : t === 'text' ? TEXT_FONT : SHAPE_FONT)
export const lineHeightOf = (font: number): number => Math.round(font * 1.3)

// ------------------------------------------------------------------------------------------------------------------ word wrap

/** The width of a text in pixels, estimated from the length (no layout: the same answer in every browser and in the tests). */
export const textWidth = (s: string, font: number): number => {
  let w = 0
  for (const ch of s) w += /[ilIjt.,;:!'|]/.test(ch) ? 0.33 : /[mwMW]/.test(ch) ? 0.92 : /[A-Z0-9]/.test(ch) ? 0.64 : ch.charCodeAt(0) > 0x2e80 ? 1 : 0.56
  return w * font
}

/**
 * Breaks `text` into lines that fit `width` pixels at `font`: at spaces, at the new lines of the text, and inside a word that is
 * longer than a line. An empty text is no lines.
 */
export function wrapText(text: string, width: number, font: number): string[] {
  const out: string[] = []
  if (!text) return out
  const max = Math.max(width, font)
  for (const para of text.split('\n')) {
    if (!para.trim()) {
      out.push('')
      continue
    }
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? line + ' ' + word : word
      if (textWidth(next, font) <= max) {
        line = next
        continue
      }
      if (line) out.push(line)
      line = ''
      // a word longer than the line is cut where it no longer fits
      let rest = word
      while (textWidth(rest, font) > max) {
        let n = 1
        while (n < rest.length && textWidth(rest.slice(0, n + 1), font) <= max) n++
        // do not split a surrogate pair
        if (n < rest.length && (rest.charCodeAt(n - 1) & 0xfc00) === 0xd800) n++
        out.push(rest.slice(0, n))
        rest = rest.slice(n)
      }
      line = rest
    }
    out.push(line)
  }
  return out
}

/** Keeps the first `max` lines; when some are cut the last one ends with an ellipsis. */
export function clampLines(lines: string[], max: number): string[] {
  if (max < 1) return []
  if (lines.length <= max) return lines
  const kept = lines.slice(0, max)
  kept[max - 1] = kept[max - 1]!.replace(/\s*$/, '') + '…'
  return kept
}

/** Height of a text object that shows `text` at its width: the lines, plus the padding. */
export function textHeight(text: string, width: number, font: number): number {
  return Math.max(lineHeightOf(font) + 8, wrapText(text, width - 8, font).length * lineHeightOf(font) + 8)
}

// ------------------------------------------------------------------------------------------------------------------ geometry

export const bounds = (o: Pick<Obj, 'x' | 'y' | 'w' | 'h'>): Rect => ({ x: o.x, y: o.y, w: o.w, h: o.h })

export function unionBounds(rs: Rect[]): Rect | null {
  if (!rs.length) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const r of rs) {
    x0 = Math.min(x0, r.x)
    y0 = Math.min(y0, r.y)
    x1 = Math.max(x1, r.x + r.w)
    y1 = Math.max(y1, r.y + r.h)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** The box of a list of flat points, relative to their origin. */
export function pointsBox(points: number[]): Rect {
  if (points.length < 2) return { x: 0, y: 0, w: 0, h: 0 }
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i + 1 < points.length; i += 2) {
    x0 = Math.min(x0, points[i]!)
    x1 = Math.max(x1, points[i]!)
    y0 = Math.min(y0, points[i + 1]!)
    y1 = Math.max(y1, points[i + 1]!)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export const intersects = (a: Rect, b: Rect): boolean => a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h
export const normRect = (a: Pt, b: Pt): Rect => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) })

/** The box an object occupies on the board (arrows and pens: the box of their points). */
export function objBox(o: Obj): Rect {
  if (o.type === 'arrow' || o.type === 'pen') {
    const b = pointsBox(o.points)
    return { x: o.x + b.x, y: o.y + b.y, w: b.w, h: b.h }
  }
  return bounds(o)
}

/** Distance of a point from the segment `a`-`b`. */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Is the point on the object? `tol` (in board units) makes thin lines easy to hit. */
export function hit(o: Obj, p: Pt, tol = 0): boolean {
  switch (o.type) {
    case 'ellipse': {
      const rx = o.w / 2 + tol
      const ry = o.h / 2 + tol
      if (rx <= 0 || ry <= 0) return false
      const nx = (p.x - (o.x + o.w / 2)) / rx
      const ny = (p.y - (o.y + o.h / 2)) / ry
      return nx * nx + ny * ny <= 1
    }
    case 'frame': {
      const inside = p.x >= o.x - tol && p.x <= o.x + o.w + tol && p.y >= o.y - tol && p.y <= o.y + o.h + tol
      if (!inside) return false
      const band = p.y <= o.y + FRAME_TITLE_H
      const edge = Math.min(p.x - o.x, o.x + o.w - p.x, p.y - o.y, o.y + o.h - p.y) <= 6 + tol
      return band || edge
    }
    case 'arrow':
    case 'pen': {
      const pts = o.points
      if (pts.length < 2) return false
      const slack = tol + (o.type === 'pen' ? 3 : 3)
      if (pts.length === 2) return Math.hypot(p.x - o.x - pts[0]!, p.y - o.y - pts[1]!) <= slack
      for (let i = 0; i + 3 < pts.length; i += 2) {
        if (distToSegment(p, { x: o.x + pts[i]!, y: o.y + pts[i + 1]! }, { x: o.x + pts[i + 2]!, y: o.y + pts[i + 3]! }) <= slack) return true
      }
      return false
    }
    default:
      return p.x >= o.x - tol && p.x <= o.x + o.w + tol && p.y >= o.y - tol && p.y <= o.y + o.h + tol
  }
}

/** The topmost object at the point (the highest `z`), or undefined. */
export function topAt(objs: Obj[], p: Pt, tol = 0): Obj | undefined {
  let best: Obj | undefined
  for (const o of objs) if (hit(o, p, tol) && (!best || o.z >= best.z)) best = o
  return best
}

export const byZ = (objs: Obj[]): Obj[] => [...objs].sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : 1))
export const frontZ = (objs: Obj[]): number => objs.reduce((m, o) => Math.max(m, o.z), 0) + 1
export const backZ = (objs: Obj[]): number => (objs.length ? objs.reduce((m, o) => Math.min(m, o.z), Infinity) - 1 : 0)

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export function handlePoint(r: Rect, h: Handle): Pt {
  const x = h.includes('w') ? r.x : h.includes('e') ? r.x + r.w : r.x + r.w / 2
  const y = h.includes('n') ? r.y : h.includes('s') ? r.y + r.h : r.y + r.h / 2
  return { x, y }
}

/**
 * The box after dragging `handle` by (dx, dy): the opposite side stays, no side goes below `min`, and the box never flips.
 * `keepRatio` (a corner handle with Shift) keeps the proportions of the original.
 */
export function resizeRect(r: Rect, handle: Handle, dx: number, dy: number, min = MIN_SIZE, keepRatio = false): Rect {
  let x0 = r.x
  let y0 = r.y
  let x1 = r.x + r.w
  let y1 = r.y + r.h
  if (handle.includes('w')) x0 = Math.min(x0 + dx, x1 - min)
  if (handle.includes('e')) x1 = Math.max(x1 + dx, x0 + min)
  if (handle.includes('n')) y0 = Math.min(y0 + dy, y1 - min)
  if (handle.includes('s')) y1 = Math.max(y1 + dy, y0 + min)
  if (keepRatio && handle.length === 2 && r.w > 0 && r.h > 0) {
    const ratio = r.w / r.h
    let w = x1 - x0
    let h = y1 - y0
    if (w / h > ratio) w = h * ratio
    else h = w / ratio
    if (handle.includes('w')) x0 = x1 - w
    else x1 = x0 + w
    if (handle.includes('n')) y0 = y1 - h
    else y1 = y0 + h
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** Scales flat points from the box `from` to the box `to` (both relative to the same origin). */
export function scalePoints(points: number[], from: Rect, to: Rect): number[] {
  const sx = from.w > 0 ? to.w / from.w : 1
  const sy = from.h > 0 ? to.h / from.h : 1
  const out: number[] = []
  for (let i = 0; i + 1 < points.length; i += 2) out.push(round1(to.x + (points[i]! - from.x) * sx), round1(to.y + (points[i + 1]! - from.y) * sy))
  return out
}

export const round1 = (n: number): number => Math.round(n * 10) / 10

// ------------------------------------------------------------------------------------------------------------------ drawing

/**
 * Ramer-Douglas-Peucker: fewer points that keep the shape of a freehand line within `eps` (board units). The first and the last
 * point stay. Iterative, so a very long line cannot overflow the stack.
 */
export function simplifyPolyline(pts: Pt[], eps: number): Pt[] {
  if (pts.length <= 2) return pts.slice()
  const keep = new Uint8Array(pts.length)
  keep[0] = 1
  keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    let far = -1
    let dist = eps
    for (let i = a + 1; i < b; i++) {
      const d = distToSegment(pts[i]!, pts[a]!, pts[b]!)
      if (d > dist) {
        dist = d
        far = i
      }
    }
    if (far >= 0) {
      keep[far] = 1
      stack.push([a, far], [far, b])
    }
  }
  return pts.filter((_, i) => keep[i])
}

/** A freehand stroke as the fields of a pen object: simplified, relative to its box, at most `MAX_POINTS` points. */
export function penFrom(pts: Pt[], eps: number): { x: number; y: number; w: number; h: number; points: number[] } | null {
  if (!pts.length) return null
  let s = simplifyPolyline(pts, eps)
  let e = eps
  while (s.length > MAX_POINTS) {
    e *= 1.5
    s = simplifyPolyline(s, e)
  }
  if (s.length === 1) s = [s[0]!, { x: s[0]!.x + 0.1, y: s[0]!.y }]
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of s) {
    x0 = Math.min(x0, p.x)
    x1 = Math.max(x1, p.x)
    y0 = Math.min(y0, p.y)
    y1 = Math.max(y1, p.y)
  }
  const points: number[] = []
  for (const p of s) points.push(round1(p.x - x0), round1(p.y - y0))
  return { x: round1(x0), y: round1(y0), w: round1(x1 - x0), h: round1(y1 - y0), points }
}

/** The path of a pen stroke: straight pieces, drawn smooth with quadratic curves through the middles. */
export function penPath(points: number[]): string {
  const n = points.length / 2
  if (n < 1) return ''
  if (n === 1) return `M${points[0]} ${points[1]}l0.1 0`
  let d = `M${points[0]} ${points[1]}`
  for (let i = 1; i < n - 1; i++) {
    const cx = points[i * 2]!
    const cy = points[i * 2 + 1]!
    d += `Q${cx} ${cy} ${round1((cx + points[i * 2 + 2]!) / 2)} ${round1((cy + points[i * 2 + 3]!) / 2)}`
  }
  d += `L${points[(n - 1) * 2]} ${points[(n - 1) * 2 + 1]}`
  return d
}

/** The points of the head of an arrow at the end of the segment `a` -> `b`. */
export function arrowHead(a: Pt, b: Pt, size = 14): [Pt, Pt] {
  const ang = Math.atan2(b.y - a.y, b.x - a.x)
  const spread = Math.PI / 7
  return [
    { x: round1(b.x - size * Math.cos(ang - spread)), y: round1(b.y - size * Math.sin(ang - spread)) },
    { x: round1(b.x - size * Math.cos(ang + spread)), y: round1(b.y - size * Math.sin(ang + spread)) },
  ]
}

// ------------------------------------------------------------------------------------------------------------------ the view

/** What is on screen: a board point `p` is at `p * k + (x, y)`. */
export interface View {
  x: number
  y: number
  k: number
}
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 4
export const clampZoom = (k: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k))
export const toBoard = (v: View, s: Pt): Pt => ({ x: (s.x - v.x) / v.k, y: (s.y - v.y) / v.k })
export const toScreen = (v: View, p: Pt): Pt => ({ x: p.x * v.k + v.x, y: p.y * v.k + v.y })

/** Zooms by `factor` keeping the board point under the screen point `at` where it is. */
export function zoomAt(v: View, factor: number, at: Pt): View {
  const k = clampZoom(v.k * factor)
  const f = k / v.k
  return { k, x: at.x - (at.x - v.x) * f, y: at.y - (at.y - v.y) * f }
}

/** A view that shows `box` in a screen of `w` x `h` with `pad` around it (never zoomed in past 100%). */
export function fitView(box: Rect | null, w: number, h: number, pad = 48): View {
  if (!box || w <= 0 || h <= 0) return { x: w / 2, y: h / 2, k: 1 }
  const k = clampZoom(Math.min(1, (w - pad * 2) / Math.max(box.w, 1), (h - pad * 2) / Math.max(box.h, 1)))
  return { k, x: (w - box.w * k) / 2 - box.x * k, y: (h - box.h * k) / 2 - box.y * k }
}

/** The next zoom stop up or down (the buttons step through round values). */
export function stepZoom(k: number, dir: 1 | -1): number {
  const stops = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]
  if (dir > 0) return stops.find((s) => s > k + 0.001) ?? MAX_ZOOM
  return [...stops].reverse().find((s) => s < k - 0.001) ?? MIN_ZOOM
}

// ------------------------------------------------------------------------------------------------------------------ who may do what

export type Level = 'read' | 'write' | 'manage'
/** A writer draws and saves; a reader only watches (never sends a change, no tools). */
export const canEdit = (level: string | undefined): boolean => level === 'write' || level === 'manage'
/** Does a change that arrived from a person count? It does not when that person is a reader (they cannot make one). */
export const acceptsFrom = (state: unknown): boolean => !(state && typeof state === 'object' && (state as { w?: unknown }).w === 0)

/** A throttle for a value that changes often (the pointer): at most one call per `ms`, the last value always gets through. */
export function throttle<T>(fn: (v: T) => void, ms: number, now: () => number = Date.now, later: (f: () => void, ms: number) => unknown = setTimeout) {
  let last = -Infinity
  let pending: { v: T } | null = null
  let armed = false
  const fire = (v: T) => {
    last = now()
    fn(v)
  }
  return (v: T) => {
    const wait = last + ms - now()
    if (wait <= 0 && !armed) return fire(v)
    pending = { v }
    if (armed) return
    armed = true
    later(() => {
      armed = false
      if (pending) {
        const p = pending
        pending = null
        fire(p.v)
      }
    }, Math.max(wait, 0))
  }
}

// ------------------------------------------------------------------------------------------------------------------ the thumbnail

/** A coloured tile letter for a board without drawings. */
export const initialOf = (title: string): string => [...title.trim()][0]?.toUpperCase() ?? '?'

/** The text alternative of the canvas: how many objects of each kind. */
export function describeBoard(objs: Obj[], names: Record<ObjType, string>, sep = ', '): string {
  const n: Record<string, number> = {}
  for (const o of objs) n[o.type] = (n[o.type] ?? 0) + 1
  return OBJ_TYPES.filter((t) => n[t]).map((t) => `${n[t]} ${names[t]}`).join(sep)
}

/** The id that comes after (or before) `id` in the order of the board; the first one when there is none selected. */
export function cycle(objs: Obj[], id: string | undefined, dir: 1 | -1): string | undefined {
  const order = byZ(objs)
  if (!order.length) return undefined
  const i = order.findIndex((o) => o.id === id)
  if (i < 0) return (dir > 0 ? order[0] : order[order.length - 1])!.id
  return order[(i + dir + order.length) % order.length]!.id
}

// ------------------------------------------------------------------------------------------------- frames and templates

/** Whether `inner` lies wholly inside `outer`. */
export const contains = (outer: Rect, inner: Rect): boolean => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h

/** What a frame holds: the objects (not other frames) whose centre is inside it. They move with the frame. */
export function frameChildren(frame: Obj, objs: Obj[]): Obj[] {
  if (frame.type !== 'frame') return []
  const box = bounds(frame)
  return objs.filter((o) => {
    if (o.id === frame.id || o.type === 'frame') return false
    const b = objBox(o)
    const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
    return c.x >= box.x && c.x <= box.x + box.w && c.y >= box.y && c.y <= box.y + box.h
  })
}

/** The selection with what its frames hold, each once: what a move or a copy of a frame carries along. */
export function withFrameChildren(selected: Obj[], all: Obj[]): Obj[] {
  const out = new Map<string, Obj>()
  for (const o of selected) {
    out.set(o.id, o)
    for (const c of frameChildren(o, all)) out.set(c.id, c)
  }
  return [...out.values()]
}

export type TemplateId = 'kanban' | 'swot' | 'retro' | 'brainstorm'
export const TEMPLATE_IDS: TemplateId[] = ['kanban', 'swot', 'retro', 'brainstorm']

/** The texts a template writes on the board: the name of a template, and the title of each of its frames or notes. */
export type TemplateLabel =
  | 'tplTodo' | 'tplDoing' | 'tplDone' | 'tplTask'
  | 'tplStrengths' | 'tplWeaknesses' | 'tplOpportunities' | 'tplThreats'
  | 'tplWentWell' | 'tplToImprove' | 'tplActions'
  | 'tplTopic' | 'tplIdea'

export type TemplateObj = Pick<Obj, 'type' | 'x' | 'y' | 'w' | 'h' | 'text' | 'color'> & { points?: number[] }

const frame = (x: number, y: number, w: number, h: number, text: string, color: string): TemplateObj => ({ type: 'frame', x, y, w, h, text, color })
const note = (x: number, y: number, text: string, color: string): TemplateObj => ({ type: 'note', x, y, w: NOTE_SIZE.w, h: NOTE_SIZE.h, text, color })

/**
 * The objects of a template with its top left corner at `at`, the frames first (they sit behind the rest). `t` gives the text
 * for a label in the language of the person. Nothing is random: the same template is always the same.
 */
export function templateObjects(id: TemplateId, t: (k: TemplateLabel) => string, at: Pt): TemplateObj[] {
  const out: TemplateObj[] = []
  const place = (o: TemplateObj): TemplateObj => ({ ...o, x: Math.round(at.x + o.x), y: Math.round(at.y + o.y) })
  switch (id) {
    case 'kanban': {
      const w = 260
      const cols: [TemplateLabel, string][] = [['tplTodo', 'blue'], ['tplDoing', 'orange'], ['tplDone', 'green']]
      cols.forEach(([k, c], i) => out.push(frame(i * (w + 20), 0, w, 440, t(k), c)))
      out.push(note(40, 60, t('tplTask'), 'yellow'))
      break
    }
    case 'swot': {
      const [w, h, gap] = [320, 240, 20]
      const cells: [TemplateLabel, string][] = [['tplStrengths', 'green'], ['tplWeaknesses', 'red'], ['tplOpportunities', 'blue'], ['tplThreats', 'orange']]
      cells.forEach(([k, c], i) => out.push(frame((i % 2) * (w + gap), Math.floor(i / 2) * (h + gap), w, h, t(k), c)))
      break
    }
    case 'retro': {
      const w = 300
      const cols: [TemplateLabel, string, string][] = [['tplWentWell', 'green', 'green'], ['tplToImprove', 'orange', 'orange'], ['tplActions', 'blue', 'blue']]
      cols.forEach(([k, c], i) => out.push(frame(i * (w + 20), 0, w, 420, t(k), c)))
      cols.forEach(([, , n], i) => out.push(note(i * (w + 20) + 60, 60, '', n)))
      break
    }
    case 'brainstorm': {
      const cx = 300
      const cy = 220
      out.push({ type: 'ellipse', x: cx - 90, y: cy - 55, w: 180, h: 110, text: t('tplTopic'), color: 'purple' })
      const spots: [number, number][] = [[cx - 90, 0], [cx + 200, cy - 70], [cx - 90, cy + 190], [cx - 380, cy - 70]]
      for (const [x, y] of spots) out.push(note(x, y, t('tplIdea'), 'yellow'))
      // an arrow from the topic towards each note
      const tips: [number, number, number, number][] = [
        [cx, cy - 55, cx, 140 + 4],
        [cx + 90, cy, cx + 200 - 4, cy],
        [cx, cy + 55, cx, cy + 190 - 4],
        [cx - 90, cy, cx - 200 + 4, cy],
      ]
      for (const [x0, y0, x1, y1] of tips) out.push({ type: 'arrow', x: x0, y: y0, w: Math.abs(x1 - x0), h: Math.abs(y1 - y0), text: '', color: 'gray', points: [0, 0, x1 - x0, y1 - y0] })
      break
    }
  }
  // the frames come first: the editor gives them the lowest depth
  return out.map(place).sort((a, b) => Number(b.type === 'frame') - Number(a.type === 'frame'))
}

/** The box a template covers, to put its middle in the middle of the screen. */
export function templateBox(objs: TemplateObj[]): Rect {
  return unionBounds(objs.map((o) => (o.type === 'arrow' ? { x: o.x, y: o.y, w: o.w, h: o.h } : { x: o.x, y: o.y, w: o.w, h: o.h }))) ?? { x: 0, y: 0, w: 0, h: 0 }
}
