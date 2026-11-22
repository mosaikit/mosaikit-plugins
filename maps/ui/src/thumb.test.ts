import { describe, expect, it } from 'vitest'
import { MAX_POINTS, flatten, generated, projectGeometry, rng, seedOf, thumbOf } from './thumb.ts'

const square = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] }
const layer = (geojson: unknown, extra: Record<string, unknown> = {}) => ({ id: 'a', type: 'geojson', geojson, style: { fillColor: '#3b82f6' }, ...extra })

describe('flatten', () => {
  it('reads every geometry type and ignores what it does not know', () => {
    const g = flatten({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] } }, { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }, { type: 'Feature', geometry: square }, { type: 'Feature', geometry: { type: 'Nope' } }] }, '#000')
    expect(g.map((x) => x.kind)).toEqual(['point', 'line', 'fill'])
    expect(flatten(null, '#000')).toEqual([])
    expect(flatten({ type: 'MultiPolygon', coordinates: [square.coordinates, square.coordinates] }, '#000')).toHaveLength(2)
  })
  it('drops coordinates that are not numbers', () => {
    const g = flatten({ type: 'LineString', coordinates: [[0, 0], ['x', 1], [2, 2]] }, '#000')
    expect(g[0]!.rings[0]).toHaveLength(2)
  })
})

describe('projectGeometry', () => {
  it('takes the colour of the layer and skips hidden ones', () => {
    const g = projectGeometry({ layers: [layer(square), layer(square, { visible: false }), { id: 'tiles', type: 'raster' }] })
    expect(g).toHaveLength(1)
    expect(g[0]!.color).toBe('#3b82f6')
    expect(projectGeometry(null)).toEqual([])
  })
  it('falls back to a palette colour when the style has none', () => {
    expect(projectGeometry({ layers: [layer(square, { style: { fillColor: 'blue' } })] })[0]!.color).toMatch(/^#/)
  })
})

describe('thumbOf', () => {
  it('fits the geometry inside the box with a margin', () => {
    const t = thumbOf({ layers: [layer(square)] }, 'm', 100, 60, 5)
    expect(t.generated).toBe(false)
    const nums = (t.shapes[0]!.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
    for (let i = 0; i < nums.length; i += 2) {
      expect(nums[i]!).toBeGreaterThanOrEqual(5 - 0.1)
      expect(nums[i]!).toBeLessThanOrEqual(95 + 0.1)
      expect(nums[i + 1]!).toBeGreaterThanOrEqual(5 - 0.1)
      expect(nums[i + 1]!).toBeLessThanOrEqual(55 + 0.1)
    }
  })
  it('draws north up: a larger latitude has a smaller y', () => {
    const t = thumbOf({ layers: [layer({ type: 'LineString', coordinates: [[0, 0], [0, 10]] })] }, 'm', 100, 60)
    const [m, l] = t.shapes[0]!.d.split('L')
    expect(Number(m!.split(' ')[1])).toBeGreaterThan(Number(l!.split(' ')[1]))
  })
  it('keeps a single point inside the box', () => {
    const t = thumbOf({ layers: [layer({ type: 'Point', coordinates: [12, 41] })] }, 'm', 100, 60)
    expect(t.shapes).toHaveLength(1)
    const [x, y] = t.shapes[0]!.d.split(' ').map(Number)
    expect(x!).toBeGreaterThanOrEqual(0)
    expect(x!).toBeLessThanOrEqual(100)
    expect(y!).toBeLessThanOrEqual(60)
  })
  it('thins out a very long line', () => {
    const long = { type: 'LineString', coordinates: Array.from({ length: MAX_POINTS * 3 }, (_, i) => [i / 1000, Math.sin(i / 50)]) }
    const t = thumbOf({ layers: [layer(long)] }, 'm', 100, 60)
    expect((t.shapes[0]!.d.match(/[ML]/g) ?? []).length).toBeLessThanOrEqual(MAX_POINTS + 2)
  })
  it('draws from the name when the project has no geometry, and always the same', () => {
    const a = thumbOf({ layers: [{ id: 'tiles', type: 'raster' }] }, 'Roads of Lisbon', 100, 60)
    const b = thumbOf(null, 'Roads of Lisbon', 100, 60)
    const c = thumbOf(null, 'Another map', 100, 60)
    expect(a.generated).toBe(true)
    expect(a.shapes).toEqual(b.shapes)
    expect(a.shapes).not.toEqual(c.shapes)
  })
})

describe('the generator', () => {
  it('gives the same numbers for the same seed', () => {
    const [a, b] = [rng(seedOf('x')), rng(seedOf('x'))]
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    expect(seedOf('x')).not.toBe(seedOf('y'))
  })
  it('keeps the dots inside the box', () => {
    for (const s of generated('some map', 100, 60).filter((x) => x.kind === 'point')) {
      const [x, y] = s.d.split(' ').map(Number)
      expect(x!).toBeGreaterThan(0)
      expect(x!).toBeLessThan(100)
      expect(y!).toBeGreaterThan(0)
      expect(y!).toBeLessThan(60)
    }
  })
})
