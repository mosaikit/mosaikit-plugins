import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { diffText, fromB64, seedUpdate, toB64, transformIndex } from './collab.ts'

const apply = (a: string, d: { index: number; remove: number; insert: string } | null) => (d ? a.slice(0, d.index) + d.insert + a.slice(d.index + d.remove) : a)

describe('diffText', () => {
  it('finds the one edit between two texts', () => {
    expect(diffText('same', 'same')).toBeNull()
    expect(diffText('hello world', 'hello brave world')).toEqual({ index: 6, remove: 0, insert: 'brave ' })
    expect(diffText('hello brave world', 'hello world')).toEqual({ index: 6, remove: 6, insert: '' })
    expect(diffText('abc', 'axc')).toEqual({ index: 1, remove: 1, insert: 'x' })
    expect(diffText('', 'abc')).toEqual({ index: 0, remove: 0, insert: 'abc' })
  })
  it('applying the diff gives the new text, also with emoji and repeats', () => {
    const pairs: [string, string][] = [['aaa', 'aa'], ['aa', 'aaa'], ['a😀b', 'a😃b'], ['😀', '😀😀'], ['abcabc', 'abc'], ['x', ''], ['line\none', 'line\ntwo\none']]
    for (const [a, b] of pairs) expect(apply(a, diffText(a, b))).toBe(b)
  })
})

describe('transformIndex', () => {
  it('moves a cursor with the edits of others', () => {
    // «hello world», cursor at 8 (after «hello wo»)
    expect(transformIndex([{ insert: 'XX' }], 8)).toBe(10)
    expect(transformIndex([{ retain: 9 }, { insert: 'XX' }], 8)).toBe(8)
    expect(transformIndex([{ retain: 2 }, { delete: 3 }], 8)).toBe(5)
    expect(transformIndex([{ retain: 6 }, { delete: 10 }], 8)).toBe(6)
    expect(transformIndex([{ retain: 8 }, { insert: 'a' }], 8)).toBe(9)
  })
})

describe('Yjs between clients', () => {
  const clone = (text: string) => {
    const d = new Y.Doc()
    Y.applyUpdate(d, seedUpdate(text))
    return d
  }
  const sync = (a: Y.Doc, b: Y.Doc) => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)))
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)))
  }

  it('the same text seeds the same document: two seeds do not double the text', () => {
    const a = clone('hello')
    const b = clone('hello')
    sync(a, b)
    expect(a.getText('t').toString()).toBe('hello')
    expect(b.getText('t').toString()).toBe('hello')
  })

  it('concurrent edits end the same everywhere', () => {
    const a = clone('hello world')
    const b = clone('hello world')
    a.getText('t').insert(5, ' brave')
    b.getText('t').insert(11, '!')
    b.getText('t').delete(0, 1)
    sync(a, b)
    const ta = a.getText('t').toString()
    expect(ta).toBe(b.getText('t').toString())
    expect(ta).toContain('brave')
    expect(ta.endsWith('!')).toBe(true)
    expect(ta.startsWith('e')).toBe(true)
  })

  it('a newcomer that starts empty and asks for the state gets the document', () => {
    const a = clone('abc')
    a.getText('t').insert(3, 'def')
    const b = new Y.Doc()
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)))
    expect(b.getText('t').toString()).toBe('abcdef')
    // and they go on editing together
    b.getText('t').insert(0, '>')
    sync(a, b)
    expect(a.getText('t').toString()).toBe('>abcdef')
  })

  it('updates survive the trip as base64', () => {
    const a = clone('x')
    const big = new Y.Doc()
    Y.applyUpdate(big, fromB64(toB64(Y.encodeStateAsUpdate(a))))
    expect(big.getText('t').toString()).toBe('x')
    const bytes = Uint8Array.from({ length: 70000 }, (_, i) => i % 251)
    expect(Array.from(fromB64(toB64(bytes))).slice(0, 5)).toEqual([0, 1, 2, 3, 4])
    expect(fromB64(toB64(bytes)).length).toBe(70000)
  })
})
