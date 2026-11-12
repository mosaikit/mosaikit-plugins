import { describe, expect, it } from 'vitest'
import type { Row } from '@mosaikit/plugin-api'
import { fromRow, parseReactions, runs, snippet, toggleReaction, typingNames, upsert, without, type Msg } from './logic.ts'

const m = (id: string, at: string, who = 'u1', extra: Partial<Msg> = {}): Msg => ({ id, text: id, from: { id: who, name: who }, at, replyTo: '', edited: false, reactions: {}, ...extra })

describe('reactions', () => {
  it('reads only an object of lists of strings', () => {
    expect(parseReactions('{"👍":["a","b"],"x":[],"y":1,"z":[1]}')).toEqual({ '👍': ['a', 'b'] })
    for (const bad of [undefined, '', 'nope', '[]', '"x"', 5]) expect(parseReactions(bad)).toEqual({})
  })
  it('toggles and drops an emoji nobody uses', () => {
    const a = toggleReaction({}, '👍', 'u1')
    expect(a).toEqual({ '👍': ['u1'] })
    expect(toggleReaction(a, '👍', 'u2')).toEqual({ '👍': ['u1', 'u2'] })
    expect(toggleReaction(a, '👍', 'u1')).toEqual({})
    // the input is not changed
    expect(a).toEqual({ '👍': ['u1'] })
  })
})

describe('messages', () => {
  it('from a row', () => {
    const row = { id: 'r1', owner_id: 'u1', owner_name: 'Ada', created_at: '2026-11-11T10:00:00Z', values: { text: 'hi', reply_to: 'r0', edited: true, reactions: '{"👍":["u2"]}' } } as unknown as Row
    expect(fromRow(row)).toEqual({ id: 'r1', text: 'hi', from: { id: 'u1', name: 'Ada' }, at: '2026-11-11T10:00:00Z', replyTo: 'r0', edited: true, reactions: { '👍': ['u2'] } })
  })
  it('upsert replaces by id and keeps the order', () => {
    let l = [m('b', '2026-11-11T10:02:00Z')]
    l = upsert(l, m('a', '2026-11-11T10:01:00Z'))
    l = upsert(l, m('c', '2026-11-11T10:03:00Z'))
    expect(l.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    l = upsert(l, m('b', '2026-11-11T10:02:00Z', 'u1', { text: 'changed' }))
    expect(l).toHaveLength(3)
    expect(l[1]!.text).toBe('changed')
    expect(without(l, 'b').map((x) => x.id)).toEqual(['a', 'c'])
  })
  it('equal times are ordered by id, so every client agrees', () => {
    const l = upsert([m('b', '2026-11-11T10:00:00Z')], m('a', '2026-11-11T10:00:00Z'))
    expect(l.map((x) => x.id)).toEqual(['a', 'b'])
  })
})

describe('runs', () => {
  it('starts a block after 5 minutes, another person, a reply or a new day', () => {
    const l = [
      m('1', '2026-11-11T10:00:00'),
      m('2', '2026-11-11T10:02:00'),
      m('3', '2026-11-11T10:09:00'),
      m('4', '2026-11-11T10:09:30', 'u2'),
      m('5', '2026-11-11T10:10:00', 'u2', { replyTo: '1' }),
      m('6', '2026-11-12T09:00:00', 'u2'),
    ]
    const r = runs(l)
    expect(r.map((x) => x.items.map((i) => i.head))).toEqual([[true, false, true, true, true], [true]])
    expect(r).toHaveLength(2)
  })
})

describe('typing', () => {
  const people = [{ id: 'me', name: 'Me', state: { typing: true } }, { id: 'a', name: 'Ada', state: { typing: true } }, { id: 'b', name: 'Bob', state: { typing: false } }, { id: 'c', name: 'Cy', state: { typing: true } }]
  it('lists the others who typed lately', () => {
    const seen = new Map([['a', 10_000], ['c', 1_000]])
    expect(typingNames(people, 'me', seen, 12_000)).toEqual(['Ada'])
    expect(typingNames(people, 'me', seen, 30_000)).toEqual([])
  })
})

describe('snippet', () => {
  it('is one short line', () => {
    expect(snippet('a\n  b   c')).toBe('a b c')
    expect(snippet('x'.repeat(200), 10)).toBe('xxxxxxxxx…')
  })
})
