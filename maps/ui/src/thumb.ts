// The thumbnail of a saved map in the list: drawn from the project itself, no screenshot and no request. The GeoJSON layers
// that are saved inside the project are projected into a small box (equirectangular, corrected for the latitude); a map with
// nothing to draw (tile or service layers, an empty project) gets a quiet contour drawing made from its name, so the same map
// always looks the same. Everything here is pure: the page turns the shapes into an SVG.

export interface ThumbShape {
  /** `fill` polygons, `line`s and `point`s */
  kind: 'fill' | 'line' | 'point'
  /** SVG path data, or `x y` of the point */
  d: string
  color: string
}

export interface Thumb {
  shapes: ThumbShape[]
  /** true when the drawing is made from the name because the project has no geometry of its own */
  generated: boolean
}

/** At most this many coordinates are drawn: a thumbnail of a huge file stays quick. */
export const MAX_POINTS = 4000
const HEX = /^#[0-9a-fA-F]{6}$/
const FALLBACK = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6']

type Pos = [number, number]
interface Geo {
  kind: 'fill' | 'line' | 'point'
  rings: Pos[][]
  color: string
}

const isPos = (v: unknown): v is Pos => Array.isArray(v) && v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1])
const line = (v: unknown): Pos[] => (Array.isArray(v) ? v.filter(isPos).map((p) => [p[0], p[1]] as Pos) : [])

/** The lines, rings and points of a GeoJSON value, flattened. Unknown shapes give nothing. */
export function flatten(g: unknown, color: string, out: Geo[] = [], depth = 0): Geo[] {
  if (!g || typeof g !== 'object' || depth > 4) return out
  const o = g as { type?: unknown; coordinates?: unknown; geometry?: unknown; features?: unknown; geometries?: unknown }
  switch (o.type) {
    case 'FeatureCollection':
      if (Array.isArray(o.features)) for (const f of o.features) flatten(f, color, out, depth + 1)
      break
    case 'Feature':
      flatten(o.geometry, color, out, depth + 1)
      break
    case 'GeometryCollection':
      if (Array.isArray(o.geometries)) for (const x of o.geometries) flatten(x, color, out, depth + 1)
      break
    case 'Point':
      if (isPos(o.coordinates)) out.push({ kind: 'point', rings: [[[o.coordinates[0], o.coordinates[1]]]], color })
      break
    case 'MultiPoint':
      if (Array.isArray(o.coordinates)) out.push({ kind: 'point', rings: [line(o.coordinates)], color })
      break
    case 'LineString':
      out.push({ kind: 'line', rings: [line(o.coordinates)], color })
      break
    case 'MultiLineString':
      if (Array.isArray(o.coordinates)) out.push({ kind: 'line', rings: o.coordinates.map(line), color })
      break
    case 'Polygon':
      if (Array.isArray(o.coordinates)) out.push({ kind: 'fill', rings: o.coordinates.map(line), color })
      break
    case 'MultiPolygon':
      if (Array.isArray(o.coordinates)) for (const poly of o.coordinates) if (Array.isArray(poly)) out.push({ kind: 'fill', rings: poly.map(line), color })
      break
  }
  return out
}

/** The geometry of the layers saved in a project, each in the colour of its layer. */
export function projectGeometry(project: { layers?: unknown[] } | null): Geo[] {
  const out: Geo[] = []
  const layers = Array.isArray(project?.layers) ? project!.layers! : []
  layers.forEach((l, i) => {
    if (!l || typeof l !== 'object') return
    const layer = l as { geojson?: unknown; visible?: unknown; style?: { fillColor?: unknown; strokeColor?: unknown } }
    if (layer.visible === false || !layer.geojson) return
    const c = layer.style?.fillColor ?? layer.style?.strokeColor
    flatten(layer.geojson, typeof c === 'string' && HEX.test(c) ? c : FALLBACK[i % FALLBACK.length]!, out)
  })
  return out
}

/** A small number from a text: the same name gives the same drawing. */
export function seedOf(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0
  return h || 1
}

/** A repeatable pseudo-random generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const r1 = (n: number) => Math.round(n * 10) / 10

/** Contour lines made from the name: three soft curves and a few dots, in the colours of the app. */
export function generated(name: string, w: number, h: number): ThumbShape[] {
  const rand = rng(seedOf(name))
  const out: ThumbShape[] = []
  for (let k = 0; k < 3; k++) {
    const y0 = h * (0.25 + k * 0.28) + (rand() - 0.5) * h * 0.1
    const pts: Pos[] = []
    const steps = 6
    for (let i = 0; i <= steps; i++) pts.push([(w * i) / steps, y0 + (rand() - 0.5) * h * 0.34])
    let d = `M${r1(pts[0]![0])} ${r1(pts[0]![1])}`
    for (let i = 1; i < pts.length; i++) {
      const [px, py] = pts[i - 1]!
      const [x, y] = pts[i]!
      const mx = (px + x) / 2
      d += ` C${r1(mx)} ${r1(py)} ${r1(mx)} ${r1(y)} ${r1(x)} ${r1(y)}`
    }
    out.push({ kind: 'line', d, color: FALLBACK[(seedOf(name) + k) % FALLBACK.length]! })
  }
  for (let i = 0; i < 4; i++) out.push({ kind: 'point', d: `${r1(w * (0.12 + rand() * 0.76))} ${r1(h * (0.18 + rand() * 0.64))}`, color: FALLBACK[(seedOf(name) + i) % FALLBACK.length]! })
  return out
}

/** The thumbnail of a project in a `w` x `h` box: its own geometry when it has some, a drawing made from `name` otherwise. */
export function thumbOf(project: { layers?: unknown[] } | null, name: string, w: number, h: number, pad = 5): Thumb {
  const geo = projectGeometry(project)
  const coords = geo.flatMap((g) => g.rings.flat())
  if (!coords.length) return { shapes: generated(name, w, h), generated: true }
  // decimate: keep every n-th coordinate of the long lines so the total stays under MAX_POINTS
  const every = Math.max(1, Math.ceil(coords.length / MAX_POINTS))
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const [x, y] of coords) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  // degrees of longitude are shorter away from the equator
  const cos = Math.max(0.2, Math.cos((((minY + maxY) / 2) * Math.PI) / 180))
  const bw = Math.max((maxX - minX) * cos, 1e-9)
  const bh = Math.max(maxY - minY, 1e-9)
  const k = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh)
  // a single point or a very small feature would blow up: keep a floor on the extent
  const scale = Number.isFinite(k) ? k : 1
  const ox = (w - bw * scale) / 2
  const oy = (h - bh * scale) / 2
  const px = (x: number) => r1(ox + (x - minX) * cos * scale)
  const py = (y: number) => r1(oy + (maxY - y) * scale)
  const shapes: ThumbShape[] = []
  for (const g of geo) {
    if (g.kind === 'point') {
      for (const [x, y] of g.rings.flat()) shapes.push({ kind: 'point', d: `${px(x)} ${py(y)}`, color: g.color })
      continue
    }
    let d = ''
    for (const ring of g.rings) {
      const pts = ring.filter((_, i) => i % every === 0 || i === ring.length - 1)
      if (pts.length < 2) continue
      d += pts.map(([x, y], i) => `${i ? 'L' : 'M'}${px(x)} ${py(y)}`).join('') + (g.kind === 'fill' ? 'Z' : '')
    }
    if (d) shapes.push({ kind: g.kind, d, color: g.color })
  }
  return shapes.length ? { shapes, generated: false } : { shapes: generated(name, w, h), generated: true }
}
