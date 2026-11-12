import { describe, expect, it } from 'vitest'
import { boardWidgets, chosenKeys, columnsOf, defaultKeys, editorOrder, gridColumns, keepBoard, keyOf, moveItem, parseKeys, shouldRefresh, textsFor, toneOf } from './logic.ts'

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
    expect(textsFor(x, 'it')).toEqual({ label: 'Attività aperte', secondary: 'in ritardo', empty: 'Nothing open' })
  })
  it('falls back to English, then to the label of the contribution', () => {
    expect(textsFor(x, 'es')).toEqual({ label: 'Open tasks', secondary: 'overdue', empty: 'Nothing open' })
    expect(textsFor(w('p', 'b', 'Recent notes'), 'es')).toEqual({ label: 'Recent notes', secondary: '', empty: '' })
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
