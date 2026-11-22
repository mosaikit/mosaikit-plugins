import { describe, expect, it } from 'vitest'
import type { FileEntry } from '@mosaikit/plugin-api'
import { asFav, columnsFor, newest, parseFavs, refreshFavs, sharedWithMe, toggleFavs, walk } from './places.ts'

function entry(id: string, over: Partial<FileEntry> = {}): FileEntry {
  return { id, name: id, is_dir: false, size: 1, mime: '', created: '2026-01-01T00:00:00Z', modified: '2026-01-01T00:00:00Z', owner_id: 'me', owner_name: 'Me', my_level: 'manage', shared: false, parent_id: null, ...over }
}

describe('sharedWithMe and newest', () => {
  it('keeps what others own, and nothing without a user', () => {
    const l = [entry('a'), entry('b', { owner_id: 'bruno' })]
    expect(sharedWithMe(l, 'me').map((e) => e.id)).toEqual(['b'])
    expect(sharedWithMe(l, undefined)).toEqual([])
  })
  it('orders files by date, newest first, without folders, and cuts the list', () => {
    const l = [entry('old', { modified: '2026-01-01T00:00:00Z' }), entry('dir', { is_dir: true, modified: '2027-01-01T00:00:00Z' }), entry('new', { modified: '2026-06-01T00:00:00Z' }), entry('mid', { modified: '2026-03-01T00:00:00Z' })]
    expect(newest(l, 2).map((e) => e.id)).toEqual(['new', 'mid'])
  })
})

describe('walk', () => {
  const tree: Record<string, FileEntry[]> = {
    root: [entry('f1'), entry('d1', { is_dir: true }), entry('d2', { is_dir: true })],
    d1: [entry('f2', { parent_id: 'd1' }), entry('d3', { is_dir: true, parent_id: 'd1' })],
    d2: [entry('f3', { parent_id: 'd2' })],
    d3: [entry('f4', { parent_id: 'd3' })],
  }
  const list = async (p: string | null) => {
    const l = tree[p ?? 'root']
    if (!l) throw new Error('gone')
    return { entries: l }
  }
  it('lists every folder, nearest first, and says it is complete', async () => {
    const r = await walk(list)
    expect(r.entries.filter((e) => !e.is_dir).map((e) => e.id).sort()).toEqual(['f1', 'f2', 'f3', 'f4'])
    expect(r.folders).toBe(4)
    expect(r.complete).toBe(true)
  })
  it('stops at the limit and says it is not complete', async () => {
    const r = await walk(list, { maxFolders: 2, concurrency: 1 })
    expect(r.folders).toBe(2)
    expect(r.complete).toBe(false)
  })
  it('skips a folder that fails', async () => {
    const skipped: (string | null)[] = []
    const r = await walk(async (p) => (p === 'd2' ? Promise.reject(new Error('x')) : list(p)), { onSkip: (id) => skipped.push(id) })
    expect(skipped).toEqual(['d2'])
    expect(r.entries.some((e) => e.id === 'f3')).toBe(false)
  })
})

describe('favourites', () => {
  it('reads the stored text and ignores what is not a favourite', () => {
    expect(parseFavs(null)).toEqual([])
    expect(parseFavs('{')).toEqual([])
    expect(parseFavs('{"a":1}')).toEqual([])
    const good = JSON.stringify([asFav(entry('a')), { id: 5 }, asFav(entry('a')), { id: 'b', name: 'B', my_level: 'weird' }])
    const l = parseFavs(good)
    expect(l.map((f) => f.id)).toEqual(['a', 'b'])
    expect(l[1]!.my_level).toBe('read')
  })
  it('toggles: adds the missing ones, removes all when all are in', () => {
    const a = entry('a')
    const b = entry('b')
    const one = toggleFavs([], [a])
    expect(one.added).toBe(true)
    const two = toggleFavs(one.favs, [a, b])
    expect(two.added).toBe(true)
    expect(two.favs.map((f) => f.id)).toEqual(['a', 'b'])
    const none = toggleFavs(two.favs, [a, b])
    expect(none.added).toBe(false)
    expect(none.favs).toEqual([])
    expect(toggleFavs([], []).added).toBe(true)
  })
  it('checks them against their folders: renamed, gone, and a folder that cannot be read', async () => {
    const favs = [asFav(entry('a', { parent_id: 'p' })), asFav(entry('b', { parent_id: 'p' })), asFav(entry('c', { parent_id: 'q' }))]
    const out = await refreshFavs(favs, async (p) => {
      if (p === 'q') throw new Error('not available')
      return { entries: [entry('a', { parent_id: 'p', name: 'A renamed' })] }
    })
    expect(out.map((f) => [f.id, f.name])).toEqual([['a', 'A renamed'], ['c', 'c']])
  })
})

describe('columnsFor', () => {
  it('counts the columns that fit, one at least', () => {
    expect(columnsFor(1000, 132, 10)).toBe(7)
    expect(columnsFor(50, 132, 10)).toBe(1)
  })
})
