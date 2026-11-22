import { describe, expect, it } from 'vitest'
import { boardWidgets, categoryName, chartEmpty, chartTotal, chosenKeys, deltaOf, sparkPoints, columnsOf, defaultKeys, editorOrder, gridColumns, keepBoard, keyOf, moveItem, parseKeys, shouldRefresh, textsFor, toneOf } from './logic.ts'

const w = (plugin: string, id: string, label: string | null = null, texts?: Record<string, { label?: string; secondary?: string; empty?: string }>) => ({
  plugin,
  id,
  label,
  data: { texts },
})

describe('parseKeys', () => {
  it('reads a JSON list of keys, without repeats, and nothing else', () => {
    expect(parseKeys('["a:1","b:2","a:1"]')).toEqual(['a:1', 'b:2'])
    expect(parseKeys('')).toEqual([])
    expect(parseKeys('not json')).toEqual([])
    expect(parseKeys('{"a":1}')).toEqual([])
    expect(parseKeys('[1,"nocolon","c:3"]')).toEqual(['c:3'])
    expect(parseKeys(undefined)).toEqual([])
  })
  it('keeps at most 24', () => {
    expect(parseKeys(JSON.stringify(Array.from({ length: 30 }, (_, i) => `p:${i}`)))).toHaveLength(24)
  })
})

describe('textsFor', () => {
  const x = w('p', 'a', 'Open tasks', { it: { label: 'Attività aperte', secondary: 'in ritardo' }, en: { secondary: 'overdue', empty: 'Nothing open' } })
  it('takes the language of the person', () => {
    expect(textsFor(x, 'it')).toEqual({ label: 'Attività aperte', secondary: 'in ritardo', empty: 'Nothing open', categories: {} })
  })
  it('falls back to English, then to the label of the contribution', () => {
    expect(textsFor(x, 'es')).toEqual({ label: 'Open tasks', secondary: 'overdue', empty: 'Nothing open', categories: {} })
    expect(textsFor(w('p', 'b', 'Recent notes'), 'es')).toEqual({ label: 'Recent notes', secondary: '', empty: '', categories: {} })
    expect(textsFor(w('p', 'c'), 'en').label).toBe('')
  })
})

describe('the order of a board', () => {
  const av = [w('a', '1'), w('b', '2'), w('c', '3')]
  it('follows the keys and drops the ones nobody offers', () => {
    expect(boardWidgets(av, ['c:3', 'gone:9', 'a:1']).map(keyOf)).toEqual(['c:3', 'a:1'])
  })
  it('lists the chosen first in the editor, then the others', () => {
    expect(editorOrder(av, ['c:3', 'x:0'])).toEqual(['c:3', 'a:1', 'b:2'])
    expect(defaultKeys(av)).toEqual(['a:1', 'b:2', 'c:3'])
  })
  it('stores the checked ones in the order of the list', () => {
    expect(chosenKeys(['c:3', 'a:1', 'b:2'], new Set(['a:1', 'c:3']))).toEqual(['c:3', 'a:1'])
  })
})

describe('moveItem', () => {
  it('moves up and down and stays put at the ends', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b'])
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
  })
  it('does not change the list it is given', () => {
    const l = ['a', 'b']
    moveItem(l, 0, 1)
    expect(l).toEqual(['a', 'b'])
  })
})

describe('small rules', () => {
  it('knows the columns, the tones and the grid', () => {
    expect(columnsOf('3')).toBe('3')
    expect(columnsOf('7')).toBe('auto')
    expect(toneOf('warn')).toBe('warn')
    expect(toneOf('x')).toBe('')
    expect(gridColumns('2')).toBe('repeat(2, minmax(0, 1fr))')
    expect(gridColumns('auto')).toContain('auto-fill')
  })
  it('refreshes only while the page is visible', () => {
    expect(shouldRefresh('visible')).toBe(true)
    expect(shouldRefresh('hidden')).toBe(false)
  })
  it('keeps the open board or falls back to the first', () => {
    expect(keepBoard(['a', 'b'], 'b')).toBe('b')
    expect(keepBoard(['a', 'b'], 'z')).toBe('a')
    expect(keepBoard([], 'z')).toBeNull()
  })
})

describe('charts', () => {
  it('names a date in the language and a key from the texts', () => {
    expect(categoryName('2026-11-03', {}, 'en')).toMatch(/Nov/)
    expect(categoryName('2026-11-03', {}, 'it')).toMatch(/nov/)
    expect(categoryName('high', { high: 'Alta' }, 'it')).toBe('Alta')
    expect(categoryName('other', { high: 'Alta' }, 'it')).toBe('other')
  })
  it('totals the first series and knows an empty chart', () => {
    const r = { type: 'bar' as const, categories: ['a', 'b'], series: [{ name: 'x', data: [2, 3] }] }
    expect(chartTotal(r)).toBe(5)
    expect(chartEmpty(r)).toBe(false)
    expect(chartEmpty({ ...r, series: [{ name: 'x', data: [0, 0] }] })).toBe(true)
    expect(chartEmpty({ ...r, categories: [] })).toBe(true)
  })
  it('draws a sparkline from low to high, flat in the middle', () => {
    const p = sparkPoints([0, 5, 10], 100, 20, 2)
    expect(p[0]).toEqual({ x: 2, y: 18 })
    expect(p[2]).toEqual({ x: 98, y: 2 })
    expect(sparkPoints([3, 3], 100, 20)[0]!.y).toBe(10)
    expect(sparkPoints([1], 100, 20)).toEqual([])
  })
  it('compares a number with the one before', () => {
    expect(deltaOf(12, 10)).toEqual({ pct: 20, dir: 'up' })
    expect(deltaOf(5, 10)).toEqual({ pct: -50, dir: 'down' })
    expect(deltaOf(10, 10)?.dir).toBe('flat')
    expect(deltaOf(3, 0)).toBeNull()
    expect(deltaOf(3, null)).toBeNull()
  })
})
