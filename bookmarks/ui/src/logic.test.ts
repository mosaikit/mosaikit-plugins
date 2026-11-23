import { describe, expect, it } from 'vitest'
import { MAX_TAG, MAX_TAGS, applyFilter, cleanTags, hostOf, normaliseTag, parseTags, safeHref, tagCounts, toggleTag, effectiveMode, hueOf, parseOpenMode, safeThumbnail, withScheme } from './logic.ts'

const b = (title: string, url: string, tags: string[] = [], favorite = false, note = '') => ({ title, url, note, tags, favorite })
const list = [
  b('Rust book', 'https://doc.rust-lang.org/book/', ['rust', 'docs'], true, 'learn the language'),
  b('Crates', 'https://crates.io', ['rust']),
  b('Grafana', 'https://grafana.example.org/d/1', ['ops'], true),
]

describe('normaliseTag and cleanTags', () => {
  it('trims, lower-cases and cuts a tag', () => {
    expect(normaliseTag('  Rust ')).toBe('rust')
    expect(normaliseTag('x'.repeat(MAX_TAG + 5))).toHaveLength(MAX_TAG)
  })
  it('drops empty and duplicate tags and keeps at most twelve', () => {
    expect(cleanTags([' Rust', 'rust', '', 'Docs'])).toEqual(['rust', 'docs'])
    expect(cleanTags(Array.from({ length: 20 }, (_, i) => 't' + i))).toHaveLength(MAX_TAGS)
  })
})

describe('parseTags', () => {
  it('reads a JSON array and is calm about anything else', () => {
    expect(parseTags('["a","B"]')).toEqual(['a', 'b'])
    expect(parseTags('')).toEqual([])
    expect(parseTags('not json')).toEqual([])
    expect(parseTags('{"a":1}')).toEqual([])
    expect(parseTags(undefined)).toEqual([])
    expect(parseTags(['x', 1, 'x'])).toEqual(['x'])
  })
})

describe('hostOf and safeHref', () => {
  it('gives the host name only', () => {
    expect(hostOf('https://www.Example.org/a/b?c#d')).toBe('example.org')
    expect(hostOf('http://user:pw@docs.example.org:8443/x')).toBe('docs.example.org')
    expect(hostOf('example.org/path')).toBe('example.org')
    expect(hostOf('localhost:8080')).toBe('localhost')
    expect(hostOf('')).toBe('')
  })
  it('links only http and https', () => {
    expect(safeHref(' https://example.org/a ')).toBe('https://example.org/a')
    expect(safeHref('HTTP://example.org')).toBe('HTTP://example.org')
    expect(safeHref('javascript:alert(1)')).toBe('')
    expect(safeHref('data:text/html,x')).toBe('')
    expect(safeHref('example.org')).toBe('')
  })
})

describe('tagCounts', () => {
  it('counts the bookmarks of each tag, the most used first', () => {
    expect(tagCounts(list)).toEqual([
      { tag: 'rust', count: 2 },
      { tag: 'docs', count: 1 },
      { tag: 'ops', count: 1 },
    ])
    expect(tagCounts([])).toEqual([])
  })
})

describe('applyFilter', () => {
  const none = { query: '', tags: [], favoritesOnly: false }
  it('keeps everything without a filter', () => {
    expect(applyFilter(list, none)).toHaveLength(3)
  })
  it('searches the title, the address, the note and the tags, every word', () => {
    expect(applyFilter(list, { ...none, query: 'crates' }).map((x) => x.title)).toEqual(['Crates'])
    expect(applyFilter(list, { ...none, query: 'GRAFANA.example' }).map((x) => x.title)).toEqual(['Grafana'])
    expect(applyFilter(list, { ...none, query: 'language' }).map((x) => x.title)).toEqual(['Rust book'])
    expect(applyFilter(list, { ...none, query: 'ops' }).map((x) => x.title)).toEqual(['Grafana'])
    expect(applyFilter(list, { ...none, query: 'rust book' }).map((x) => x.title)).toEqual(['Rust book'])
    expect(applyFilter(list, { ...none, query: 'zzz' })).toEqual([])
  })
  it('needs every chosen tag and, when asked, a favourite', () => {
    expect(applyFilter(list, { ...none, tags: ['rust'] })).toHaveLength(2)
    expect(applyFilter(list, { ...none, tags: ['rust', 'docs'] }).map((x) => x.title)).toEqual(['Rust book'])
    expect(applyFilter(list, { ...none, favoritesOnly: true }).map((x) => x.title)).toEqual(['Rust book', 'Grafana'])
    expect(applyFilter(list, { query: 'crates', tags: [], favoritesOnly: true })).toEqual([])
  })
})

describe('toggleTag', () => {
  it('adds a tag that is not chosen and removes one that is', () => {
    expect(toggleTag([], 'a')).toEqual(['a'])
    expect(toggleTag(['a', 'b'], 'a')).toEqual(['b'])
  })
})

import { chunk, columnsFor } from './logic.ts'
describe('grid rows', () => {
  it('cuts a list in rows', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([1, 2], 0)).toEqual([[1], [2]])
    expect(chunk([], 3)).toEqual([])
  })
  it('counts the columns that fit', () => {
    expect(columnsFor(900, 280, 16)).toBe(3)
    expect(columnsFor(0, 280, 16)).toBe(1)
  })
})

describe('opening in a frame or in a tab', () => {
  it('reads the stored mode and falls back to the default', () => {
    expect(parseOpenMode('frame')).toBe('frame')
    expect(parseOpenMode('tab')).toBe('tab')
    expect(parseOpenMode('popup')).toBe('')
    expect(parseOpenMode(undefined)).toBe('')
    expect(effectiveMode('', 'tab')).toBe('tab')
    expect(effectiveMode(undefined, 'frame')).toBe('frame')
    expect(effectiveMode('frame', 'tab')).toBe('frame')
    expect(effectiveMode('tab', 'frame')).toBe('tab')
  })
  it('gives an address its scheme the way the hook of the plugin does, and refuses the rest', () => {
    expect(withScheme(' example.org/a ')).toBe('https://example.org/a')
    expect(withScheme('localhost:8080/app')).toBe('https://localhost:8080/app')
    expect(withScheme('http://example.org')).toBe('http://example.org')
    expect(withScheme('javascript:alert(1)')).toBe('')
    expect(withScheme('ftp://example.org')).toBe('')
    expect(withScheme('')).toBe('')
  })
  it('draws only small data images as a thumbnail', () => {
    const ok = 'data:image/jpeg;base64,/9j/4AAQ'
    expect(safeThumbnail(ok)).toBe(ok)
    expect(safeThumbnail('https://example.org/x.png')).toBe('')
    expect(safeThumbnail('data:image/svg+xml;base64,AAAA')).toBe('')
    expect(safeThumbnail('data:image/png;base64,' + 'A'.repeat(300000))).toBe('')
    expect(safeThumbnail(7)).toBe('')
  })
  it('keeps one colour for one name', () => {
    expect(hueOf('example.org')).toBe(hueOf('example.org'))
    expect(hueOf('example.org')).toBeGreaterThanOrEqual(0)
    expect(hueOf('example.org')).toBeLessThan(360)
  })
})
