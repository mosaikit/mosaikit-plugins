import { describe, expect, it } from 'vitest'
import {
  FRAME_TITLE_H,
  TEMPLATE_IDS,
  contains,
  frameChildren,
  templateBox,
  templateObjects,
  withFrameChildren,
  PALETTE, acceptsFrom, arrowHead, backZ, byZ, canEdit, clampLines, clampZoom, cycle, describeBoard, fitView, frontZ, hit, initialOf, newId,
  objBox, penFrom, penPath, personColor, resizeRect, scalePoints, simplifyPolyline, stepZoom, swatchOf, textHeight, textWidth, throttle, toBoard, toScreen,
  topAt, unionBounds, wrapText, zoomAt, type Obj,
} from './logic.ts'

const obj = (o: Partial<Obj>): Obj => ({ id: 'a', type: 'rect', x: 0, y: 0, w: 100, h: 50, text: '', color: 'yellow', points: [], z: 0, author: '', ...o })

describe('palette and ids', () => {
  it('has eight colours, each with a dark line colour, and a fallback', () => {
    expect(PALETTE).toHaveLength(8)
    expect(new Set(PALETTE.map((s) => s.key)).size).toBe(8)
    expect(swatchOf('blue').key).toBe('blue')
    expect(swatchOf('nope').key).toBe('yellow')
    expect(personColor('u1')).toBe(personColor('u1'))
  })
  it('the colours are readable: line on the paper, ink on the fill, white on the line (4.5:1)', () => {
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
    }
    const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
    for (const s of PALETTE) {
      expect(ratio(s.stroke, '#fbfbfd')).toBeGreaterThan(4.5)
      expect(ratio('#1f2430', s.fill)).toBeGreaterThan(4.5)
      expect(ratio('#ffffff', s.stroke)).toBeGreaterThan(4.5)
    }
  })
  it('makes ids that do not repeat', () => {
    const ids = new Set(Array.from({ length: 2000 }, () => newId()))
    expect(ids.size).toBe(2000)
    expect(newId(() => 0)).toBe('o' + '0'.repeat(16))
    expect(newId()).toMatch(/^o[0-9a-z]{16}$/)
  })
})

describe('wrapText', () => {
  it('breaks at spaces and keeps every word', () => {
    const lines = wrapText('the quick brown fox jumps over the lazy dog', 100, 16)
    expect(lines.length).toBeGreaterThan(2)
    expect(lines.join(' ')).toBe('the quick brown fox jumps over the lazy dog')
    for (const l of lines) expect(textWidth(l, 16)).toBeLessThanOrEqual(100)
  })
  it('keeps the new lines of the text and an empty text is no lines', () => {
    expect(wrapText('', 100, 16)).toEqual([])
    expect(wrapText('a\n\nb', 500, 16)).toEqual(['a', '', 'b'])
  })
  it('cuts a word that is longer than a line, never inside an emoji', () => {
    const lines = wrapText('x'.repeat(60), 80, 16)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.join('')).toBe('x'.repeat(60))
    const e = wrapText('😀'.repeat(30), 60, 16)
    expect(e.join('')).toBe('😀'.repeat(30))
    for (const l of e) expect(l).not.toMatch(/[\ud800-\udbff]$/)
  })
  it('clamps lines with an ellipsis and measures the height of a text', () => {
    expect(clampLines(['a', 'b', 'c'], 5)).toEqual(['a', 'b', 'c'])
    expect(clampLines(['a', 'b ', 'c'], 2)).toEqual(['a', 'b…'])
    expect(clampLines(['a'], 0)).toEqual([])
    expect(textHeight('', 200, 20)).toBeGreaterThan(20)
    expect(textHeight('one two three four five six seven eight nine ten', 80, 20)).toBeGreaterThan(textHeight('one', 80, 20))
  })
})

describe('geometry', () => {
  it('hits rectangles, ellipses, arrows and pens', () => {
    expect(hit(obj({}), { x: 50, y: 25 })).toBe(true)
    expect(hit(obj({}), { x: 101, y: 25 })).toBe(false)
    expect(hit(obj({}), { x: 103, y: 25 }, 5)).toBe(true)
    const e = obj({ type: 'ellipse' })
    expect(hit(e, { x: 50, y: 25 })).toBe(true)
    expect(hit(e, { x: 2, y: 2 })).toBe(false)
    const a = obj({ type: 'arrow', x: 10, y: 10, w: 100, h: 0, points: [0, 0, 100, 0] })
    expect(hit(a, { x: 60, y: 12 })).toBe(true)
    expect(hit(a, { x: 60, y: 30 })).toBe(false)
    const p = obj({ type: 'pen', x: 0, y: 0, points: [0, 0, 10, 10, 20, 0] })
    expect(hit(p, { x: 10, y: 9 })).toBe(true)
    expect(hit(p, { x: 10, y: 0 })).toBe(false)
  })
  it('the topmost object wins and z orders', () => {
    const lo = obj({ id: 'lo', z: 1 })
    const hi = obj({ id: 'hi', z: 2 })
    expect(topAt([hi, lo], { x: 5, y: 5 })?.id).toBe('hi')
    expect(topAt([lo], { x: 500, y: 5 })).toBeUndefined()
    expect(byZ([hi, lo]).map((o) => o.id)).toEqual(['lo', 'hi'])
    expect(frontZ([hi, lo])).toBe(3)
    expect(backZ([hi, lo])).toBe(0)
    expect(backZ([])).toBe(0)
    expect(frontZ([])).toBe(1)
  })
  it('boxes', () => {
    expect(unionBounds([])).toBeNull()
    expect(unionBounds([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: -5, w: 10, h: 10 }])).toEqual({ x: 0, y: -5, w: 30, h: 15 })
    expect(objBox(obj({ type: 'pen', x: 100, y: 100, points: [0, 0, 30, 10] }))).toEqual({ x: 100, y: 100, w: 30, h: 10 })
  })
  it('resizes from a handle, keeping the other side and a minimum', () => {
    const r = { x: 100, y: 100, w: 200, h: 100 }
    expect(resizeRect(r, 'se', 50, 20)).toEqual({ x: 100, y: 100, w: 250, h: 120 })
    expect(resizeRect(r, 'nw', 50, 20)).toEqual({ x: 150, y: 120, w: 150, h: 80 })
    expect(resizeRect(r, 'e', -500, 0)).toEqual({ x: 100, y: 100, w: 24, h: 100 })
    expect(resizeRect(r, 'w', 500, 0)).toEqual({ x: 276, y: 100, w: 24, h: 100 })
    expect(resizeRect(r, 'n', 0, 10)).toEqual({ x: 100, y: 110, w: 200, h: 90 })
    const k = resizeRect(r, 'se', 100, 0, 24, true)
    expect(k.w / k.h).toBeCloseTo(2)
  })
  it('scales points between boxes', () => {
    expect(scalePoints([0, 0, 10, 20], { x: 0, y: 0, w: 10, h: 20 }, { x: 0, y: 0, w: 20, h: 10 })).toEqual([0, 0, 20, 10])
    expect(scalePoints([5, 5], { x: 5, y: 5, w: 0, h: 0 }, { x: 0, y: 0, w: 10, h: 10 })).toEqual([0, 0])
  })
  it('an arrow head sits at the end', () => {
    const [l, r] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 })
    expect(l.x).toBeLessThan(100)
    expect(l.y).toBeCloseTo(-r.y)
  })
})

describe('simplifyPolyline', () => {
  it('keeps the ends and drops points on a straight line', () => {
    const line = Array.from({ length: 50 }, (_, i) => ({ x: i, y: i }))
    expect(simplifyPolyline(line, 0.5)).toEqual([line[0], line[49]])
  })
  it('keeps the corners', () => {
    const corner = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 10, y: 10 }]
    expect(simplifyPolyline(corner, 0.5)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])
  })
  it('stays within the tolerance and handles tiny and huge inputs', () => {
    expect(simplifyPolyline([], 1)).toEqual([])
    expect(simplifyPolyline([{ x: 1, y: 1 }], 1)).toEqual([{ x: 1, y: 1 }])
    const wave = Array.from({ length: 20000 }, (_, i) => ({ x: i, y: Math.sin(i / 50) * 100 }))
    const s = simplifyPolyline(wave, 1)
    expect(s.length).toBeLessThan(wave.length / 10)
    expect(s[0]).toBe(wave[0])
    expect(s[s.length - 1]).toBe(wave[19999])
  })
  it('a pen is relative to its box, bounded in points, and a dot is two points', () => {
    const p = penFrom([{ x: 100, y: 200 }, { x: 150, y: 220 }, { x: 200, y: 200 }], 1)!
    expect(p).toMatchObject({ x: 100, y: 200, w: 100, h: 20 })
    expect(p.points[0]).toBe(0)
    const wiggly = Array.from({ length: 5000 }, (_, i) => ({ x: i, y: (i % 2) * 40 }))
    expect(penFrom(wiggly, 0.5)!.points.length / 2).toBeLessThanOrEqual(400)
    expect(penFrom([{ x: 1, y: 1 }], 1)!.points).toHaveLength(4)
    expect(penFrom([], 1)).toBeNull()
    expect(penPath([0, 0, 10, 10, 20, 0])).toMatch(/^M0 0Q10 10/)
  })
})

describe('the view', () => {
  it('converts between screen and board', () => {
    const v = { x: 30, y: -10, k: 2 }
    expect(toBoard(v, toScreen(v, { x: 7, y: 9 }))).toEqual({ x: 7, y: 9 })
  })
  it('zooms around a point that stays put, within 10% and 400%', () => {
    const v = { x: 0, y: 0, k: 1 }
    const z = zoomAt(v, 2, { x: 100, y: 50 })
    expect(toBoard(z, { x: 100, y: 50 })).toEqual({ x: 100, y: 50 })
    expect(zoomAt(v, 1000, { x: 0, y: 0 }).k).toBe(4)
    expect(zoomAt(v, 0.0001, { x: 0, y: 0 }).k).toBe(0.1)
    expect(clampZoom(9)).toBe(4)
    expect(stepZoom(1, 1)).toBe(1.5)
    expect(stepZoom(1, -1)).toBe(0.75)
    expect(stepZoom(4, 1)).toBe(4)
    expect(stepZoom(0.1, -1)).toBe(0.1)
  })
  it('fits a box and never zooms in past 100%', () => {
    const v = fitView({ x: 0, y: 0, w: 2000, h: 1000 }, 1000, 500)
    expect(v.k).toBeLessThan(0.5)
    expect(fitView({ x: 0, y: 0, w: 10, h: 10 }, 1000, 500).k).toBe(1)
    expect(fitView(null, 800, 600)).toEqual({ x: 400, y: 300, k: 1 })
  })
})

describe('who may do what', () => {
  it('a writer or a manager edits, a reader does not', () => {
    expect(canEdit('write')).toBe(true)
    expect(canEdit('manage')).toBe(true)
    expect(canEdit('read')).toBe(false)
    expect(canEdit(undefined)).toBe(false)
  })
  it('what comes from a reader is not accepted', () => {
    expect(acceptsFrom({ c: 'x', w: 0 })).toBe(false)
    expect(acceptsFrom({ c: 'x', w: 1 })).toBe(true)
    expect(acceptsFrom(undefined)).toBe(true)
    expect(acceptsFrom(null)).toBe(true)
  })
})

describe('throttle', () => {
  it('lets one call per interval through and delivers the last value after it', () => {
    let t = 0
    const timers: (() => void)[] = []
    const got: number[] = []
    const f = throttle<number>((v) => got.push(v), 100, () => t, (fn) => timers.push(fn))
    f(1)
    f(2)
    f(3)
    expect(got).toEqual([1])
    t = 100
    timers.shift()!()
    expect(got).toEqual([1, 3])
    t = 150
    f(4)
    expect(got).toEqual([1, 3])
    t = 200
    timers.shift()!()
    expect(got).toEqual([1, 3, 4])
  })
})

describe('small helpers', () => {
  it('initial, description and cycling', () => {
    expect(initialOf('  retro')).toBe('R')
    expect(initialOf('')).toBe('?')
    const names = { note: 'notes', rect: 'rectangles', ellipse: 'ellipses', text: 'texts', arrow: 'arrows', pen: 'drawings', frame: 'frames' }
    expect(describeBoard([obj({ type: 'note' }), obj({ type: 'note', id: 'b' }), obj({ type: 'pen', id: 'c' })], names)).toBe('2 notes, 1 drawings')
    expect(describeBoard([], names)).toBe('')
    const objs = [obj({ id: 'a', z: 1 }), obj({ id: 'b', z: 2 }), obj({ id: 'c', z: 3 })]
    expect(cycle(objs, undefined, 1)).toBe('a')
    expect(cycle(objs, undefined, -1)).toBe('c')
    expect(cycle(objs, 'c', 1)).toBe('a')
    expect(cycle(objs, 'a', -1)).toBe('c')
    expect(cycle([], 'a', 1)).toBeUndefined()
  })
})

describe('frames', () => {
  const frame = obj({ id: 'f', type: 'frame', x: 100, y: 100, w: 400, h: 300, z: -1 })
  const inside = obj({ id: 'n', type: 'note', x: 150, y: 200, w: 180, h: 140, z: 1 })
  const outside = obj({ id: 'o', type: 'note', x: 700, y: 200, w: 180, h: 140, z: 2 })

  it('is hit on its title band and its border, not in the middle, so what is inside stays easy to pick', () => {
    expect(hit(frame, { x: 300, y: 100 + FRAME_TITLE_H - 2 })).toBe(true)
    expect(hit(frame, { x: 101, y: 300 })).toBe(true)
    expect(hit(frame, { x: 300, y: 250 })).toBe(false)
    expect(hit(frame, { x: 50, y: 50 })).toBe(false)
    // a note over the middle of a frame is the one under the pointer
    expect(topAt([frame, inside], { x: 200, y: 250 })?.id).toBe('n')
  })

  it('holds the objects whose centre is inside it, never other frames or itself', () => {
    const other = obj({ id: 'g', type: 'frame', x: 120, y: 120, w: 100, h: 100 })
    expect(frameChildren(frame, [frame, inside, outside, other]).map((o) => o.id)).toEqual(['n'])
    expect(frameChildren(inside, [frame, inside])).toEqual([])
    // an arrow counts by its own box
    const arrow = obj({ id: 'a', type: 'arrow', x: 200, y: 200, w: 40, h: 0, points: [0, 0, 40, 0] })
    expect(frameChildren(frame, [arrow]).map((o) => o.id)).toEqual(['a'])
  })

  it('takes what it holds when it is moved or copied, each object once', () => {
    const all = [frame, inside, outside]
    expect(withFrameChildren([frame], all).map((o) => o.id).sort()).toEqual(['f', 'n'])
    expect(withFrameChildren([frame, inside], all).map((o) => o.id).sort()).toEqual(['f', 'n'])
    expect(withFrameChildren([outside], all).map((o) => o.id)).toEqual(['o'])
  })

  it('knows when a box is wholly inside another', () => {
    expect(contains({ x: 0, y: 0, w: 100, h: 100 }, { x: 10, y: 10, w: 50, h: 50 })).toBe(true)
    expect(contains({ x: 0, y: 0, w: 100, h: 100 }, { x: 80, y: 10, w: 50, h: 50 })).toBe(false)
  })
})

describe('templates', () => {
  const label = (k: string) => `<${k}>`

  it('make frames first, with a title, and put the top left corner where asked', () => {
    for (const id of TEMPLATE_IDS) {
      const objs = templateObjects(id, label, { x: 1000, y: 500 })
      expect(objs.length, id).toBeGreaterThan(2)
      const firstOther = objs.findIndex((o) => o.type !== 'frame')
      // the frames come before everything else
      expect((firstOther < 0 ? [] : objs.slice(firstOther)).every((o) => o.type !== 'frame'), id).toBe(true)
      for (const f of objs.filter((o) => o.type === 'frame')) expect(f.text.startsWith('<tpl'), id).toBe(true)
      const box = templateBox(objs)
      expect(box.x, id).toBeGreaterThanOrEqual(1000 - 400)
      expect(box.w, id).toBeGreaterThan(300)
    }
  })

  it('have the shape they promise', () => {
    const kanban = templateObjects('kanban', label, { x: 0, y: 0 })
    expect(kanban.filter((o) => o.type === 'frame').map((o) => o.text)).toEqual(['<tplTodo>', '<tplDoing>', '<tplDone>'])
    expect(kanban.filter((o) => o.type === 'note')).toHaveLength(1)
    const swot = templateObjects('swot', label, { x: 0, y: 0 })
    expect(swot).toHaveLength(4)
    expect(new Set(swot.map((o) => `${o.x},${o.y}`)).size).toBe(4)
    const brain = templateObjects('brainstorm', label, { x: 0, y: 0 })
    expect(brain.filter((o) => o.type === 'note')).toHaveLength(4)
    expect(brain.filter((o) => o.type === 'arrow')).toHaveLength(4)
    expect(brain.filter((o) => o.type === 'ellipse')).toHaveLength(1)
    // every arrow has the two points of its line
    for (const a of brain.filter((o) => o.type === 'arrow')) expect(a.points).toHaveLength(4)
  })

  it('are the same every time', () => {
    expect(templateObjects('retro', label, { x: 5, y: 7 })).toEqual(templateObjects('retro', label, { x: 5, y: 7 }))
  })

  it('keep the notes of a column inside its frame', () => {
    const objs = templateObjects('kanban', label, { x: 0, y: 0 }).map((o, i) => ({ id: String(i), z: 0, author: '', points: o.points ?? [], ...o }))
    const frames = objs.filter((o) => o.type === 'frame')
    const task = objs.find((o) => o.type === 'note')!
    expect(frameChildren(frames[0]!, objs).map((o) => o.id)).toEqual([task.id])
    expect(frameChildren(frames[1]!, objs)).toEqual([])
  })
})
