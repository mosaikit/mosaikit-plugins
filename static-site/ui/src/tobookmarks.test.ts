import { describe, expect, it } from 'vitest'
import { BOOKMARKS_HEADER, bookmarkRows, hasAddress, thumbnailOf } from './tobookmarks.ts'

const site = (values: Record<string, unknown>) => ({ values })
const pic = 'data:image/jpeg;base64,/9j/4AAQ'

describe('sites by address as bookmarks', () => {
  const rows = [
    site({ name: 'Dashboard', url: 'https://grafana.example.org/d/1', description: 'Ops board', framable: 'yes', thumbnail: pic }),
    site({ name: 'Zip site', entry: 'index.html', files: 3 }),
    site({ name: 'Wiki', url: 'https://wiki.example.org', framable: 'no', thumbnail: 'https://evil.example/x.png' }),
  ]
  it('takes only the sites that have an address', () => {
    expect(rows.filter(hasAddress)).toHaveLength(2)
    expect(bookmarkRows(rows)).toHaveLength(2)
  })
  it('writes name, address, description, thumbnail and the way it opened, in the columns of Bookmarks', () => {
    const out = bookmarkRows(rows)
    expect(BOOKMARKS_HEADER).toEqual(['title', 'url', 'note', 'tags', 'favorite', 'open', 'thumbnail'])
    expect(out[0]).toEqual(['Dashboard', 'https://grafana.example.org/d/1', 'Ops board', '', 'no', 'frame', pic])
    expect(out.every((r) => r.length === BOOKMARKS_HEADER.length)).toBe(true)
  })
  it('opens in a new tab what forbade framing, and drops a thumbnail that is not a data image', () => {
    expect(bookmarkRows(rows)[1]).toEqual(['Wiki', 'https://wiki.example.org', '', '', 'no', 'tab', ''])
    expect(thumbnailOf(rows[2]!)).toBe('')
  })
  it('does not fail on a record with no values', () => {
    expect(bookmarkRows([{ values: null }, { values: undefined }])).toEqual([])
  })
})
