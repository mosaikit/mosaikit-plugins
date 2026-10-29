import { describe, expect, it } from 'vitest'
import { cleanName, hasTag, parseTags, removeTag, renameTag, tagValues } from './tags.ts'

describe('tags of a note', () => {
  it('reads a list of names and nothing else', () => {
    expect(parseTags('["work","Home"]')).toEqual(['work', 'Home'])
    expect(parseTags('["work","WORK"," work "]')).toEqual(['work'])
    expect(parseTags(null)).toEqual([])
    expect(parseTags('work')).toEqual([])
    expect(parseTags('[1,{"a":2},"x"]')).toEqual(['x'])
    expect(parseTags('[broken')).toEqual([])
  })
  it('cleans a name', () => {
    expect(cleanName('  my   tag ')).toBe('my tag')
    expect(cleanName('x'.repeat(100))).toHaveLength(40)
  })
  it('renames and removes without repeats', () => {
    expect(renameTag(['a', 'b'], 'A', 'c')).toEqual(['c', 'b'])
    expect(renameTag(['a', 'b'], 'a', 'B')).toEqual(['B'])
    expect(removeTag(['a', 'b'], 'B')).toEqual(['a'])
    expect(hasTag(['Work'], 'work')).toBe(true)
  })
  it('keeps the first tag in the field tag', () => {
    expect(tagValues(['x', 'y'])).toEqual({ tags: '["x","y"]', tag: 'x' })
    expect(tagValues([])).toEqual({ tags: '[]', tag: null })
  })
})
