import { describe, expect, it } from 'vitest'
import { filterSnippets, firstLine, kindOf, listOrder, neighbour, normTag, parseTags, tagCounts } from './logic.ts'

const s = (id: string, title: string, body = 'x', kind = 'text', tags: string[] = [], createdAt = '2026-05-01T10:00:00Z') => ({ id, title, body, kind, tags, createdAt })

describe('tags', () => {
  it('normalises a tag', () => {
    expect(normTag('  Ops ')).toBe('ops')
  })
  it('reads the JSON array, normalised and without repeats', () => {
    expect(parseTags('[" Ops ","SQL","ops",""]')).toEqual(['ops', 'sql'])
    expect(parseTags(['A', 'a', 3])).toEqual(['a'])
  })
  it('takes anything unreadable as no tags', () => {
    expect(parseTags('')).toEqual([])
    expect(parseTags('not json')).toEqual([])
    expect(parseTags('{"a":1}')).toEqual([])
    expect(parseTags(undefined)).toEqual([])
  })
})

describe('firstLine and kindOf', () => {
  it('is the first line with something in it', () => {
    expect(firstLine('\n  \n  ls -la  \nnext')).toBe('ls -la')
    expect(firstLine('a\r\nb')).toBe('a')
    expect(firstLine('')).toBe('')
  })
  it('knows the kinds of the list', () => {
    expect(kindOf('sql')).toBe('sql')
    expect(kindOf('cobol')).toBe('text')
    expect(kindOf(undefined)).toBe('text')
  })
})

describe('filterSnippets', () => {
  const list = [
    s('1', 'Deploy', 'kubectl apply -f app.yaml', 'shell', ['ops']),
    s('2', 'Top customers', 'SELECT * FROM customers', 'sql', ['report', 'ops']),
    s('3', 'Thanks', 'Dear Anna,\nthank you', 'text', ['mail']),
  ]
  it('matches title, body and tags in any case', () => {
    expect(filterSnippets(list, { q: 'DEPLOY', kind: '', tag: '' }).map((x) => x.id)).toEqual(['1'])
    expect(filterSnippets(list, { q: 'select', kind: '', tag: '' }).map((x) => x.id)).toEqual(['2'])
    expect(filterSnippets(list, { q: 'mai', kind: '', tag: '' }).map((x) => x.id)).toEqual(['3'])
  })
  it('combines the search, the kind and the tag', () => {
    expect(filterSnippets(list, { q: '', kind: 'sql', tag: '' }).map((x) => x.id)).toEqual(['2'])
    expect(filterSnippets(list, { q: '', kind: '', tag: 'ops' }).map((x) => x.id)).toEqual(['1', '2'])
    expect(filterSnippets(list, { q: 'cust', kind: 'shell', tag: 'ops' })).toEqual([])
    expect(filterSnippets(list, { q: '  ', kind: '', tag: '' })).toHaveLength(3)
  })
})

describe('tagCounts, listOrder and neighbour', () => {
  it('counts the tags, the most used first', () => {
    const list = [s('1', 'a', 'x', 'text', ['b', 'a']), s('2', 'b', 'x', 'text', ['b']), s('3', 'c', 'x', 'text', ['c'])]
    expect(tagCounts(list)).toEqual([
      { tag: 'b', count: 2 },
      { tag: 'a', count: 1 },
      { tag: 'c', count: 1 },
    ])
  })
  it('orders by title without caring about the case, and leaves the list as it was', () => {
    const list = [s('1', 'beta'), s('2', 'Alpha'), s('3', 'alpha', 'x', 'text', [], '2026-06-01T10:00:00Z')]
    expect(listOrder(list).map((x) => x.id)).toEqual(['3', '2', '1'])
    expect(list.map((x) => x.id)).toEqual(['1', '2', '3'])
  })
  it('moves through the ids and stops at the ends', () => {
    expect(neighbour(['a', 'b', 'c'], 'a', 1)).toBe('b')
    expect(neighbour(['a', 'b', 'c'], 'c', 1)).toBe('c')
    expect(neighbour(['a', 'b', 'c'], 'a', -1)).toBe('a')
    expect(neighbour(['a', 'b', 'c'], null, 1)).toBe('a')
    expect(neighbour(['a', 'b', 'c'], 'zz', -1)).toBe('c')
    expect(neighbour([], 'a', 1)).toBeNull()
  })
})
