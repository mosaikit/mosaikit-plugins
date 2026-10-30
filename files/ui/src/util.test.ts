import { afterEach, describe, expect, it } from 'vitest'
import type { FileEntry } from '@mosaikit/plugin-api'
import { setLang } from './i18n.ts'
import { atLeast, growFor, fmtDate, fmtSize, freeName, isConflict, kindLabel, previewMode, sortEntries, validName } from './util.ts'

function entry(name: string, is_dir = false, size = 0, modified = '2026-01-01T00:00:00Z'): FileEntry {
  return { id: name, name, is_dir, size, mime: '', created: modified, modified, owner_id: 'u', owner_name: 'anna', my_level: 'manage', shared: false, parent_id: null }
}

afterEach(() => setLang('en'))

describe('growFor', () => {
  it('keeps the drawn count when the item is drawn and adds whole pages up to it otherwise', () => {
    expect(growFor(100, 99)).toBe(100)
    expect(growFor(100, 100)).toBe(200)
    expect(growFor(100, 4999)).toBe(5000)
    expect(growFor(200, 100)).toBe(200)
  })
})

describe('freeName', () => {
  it('adds (n) before the extension and skips the names taken', () => {
    expect(freeName('photo.png', new Set(['photo.png']))).toBe('photo (1).png')
    expect(freeName('photo.png', new Set(['photo.png', 'photo (1).png']))).toBe('photo (2).png')
    expect(freeName('archive.tar.gz', new Set())).toBe('archive.tar (1).gz')
  })
  it('without extension, hidden files and folders', () => {
    expect(freeName('README', new Set())).toBe('README (1)')
    expect(freeName('.env', new Set())).toBe('.env (1)')
    expect(freeName('v1.2', new Set(), true)).toBe('v1.2 (1)')
  })
})

describe('sortEntries', () => {
  const list = [entry('b.txt', false, 10, '2026-03-01T00:00:00Z'), entry('Zeta', true), entry('a10.txt', false, 5), entry('a2.txt', false, 50), entry('alpha', true)]
  it('folders first, then natural order by name', () => {
    expect(sortEntries(list, 'name', 1).map((e) => e.name)).toEqual(['alpha', 'Zeta', 'a2.txt', 'a10.txt', 'b.txt'])
    expect(sortEntries(list, 'name', -1).map((e) => e.name)).toEqual(['Zeta', 'alpha', 'b.txt', 'a10.txt', 'a2.txt'])
  })
  it('by size and date, with a filter', () => {
    expect(sortEntries(list, 'size', -1).filter((e) => !e.is_dir).map((e) => e.name)).toEqual(['a2.txt', 'b.txt', 'a10.txt'])
    expect(sortEntries(list, 'modified', -1)[2].name).toBe('b.txt')
    expect(sortEntries(list, 'name', 1, 'A1').map((e) => e.name)).toEqual(['a10.txt'])
  })
  it('does not change the original array', () => {
    const copy = [...list]
    sortEntries(list, 'size', 1)
    expect(list).toEqual(copy)
  })
})

describe('previews and kinds', () => {
  it('HTML and SVG only as text', () => {
    expect(previewMode(entry('page.html'))).toBe('text')
    expect(previewMode(entry('logo.svg'))).toBe('text')
    expect(previewMode(entry('photo.JPG'))).toBe('image')
    expect(previewMode(entry('doc.pdf'))).toBe('pdf')
    expect(previewMode(entry('a.zip'))).toBeNull()
    expect(previewMode(entry('photo.png', true))).toBeNull()
  })
  it('labels and sizes', () => {
    expect(kindLabel(entry('x.pdf'))).toBe('PDF document · PDF')
    expect(kindLabel(entry('folder', true))).toBe('Folder')
    expect(kindLabel(entry('x.bin'))).toBe('BIN file')
    expect(fmtSize(512)).toBe('512 B')
    expect(fmtSize(1536)).toBe('1.5 KB')
  })
  it('in Italian when the host is in Italian', () => {
    setLang('it')
    expect(kindLabel(entry('x.pdf'))).toBe('Documento PDF · PDF')
    expect(kindLabel(entry('folder', true))).toBe('Cartella')
    expect(kindLabel(entry('x.bin'))).toBe('File BIN')
    expect(fmtSize(1536)).toBe('1,5 KB')
    expect(validName('')).toBe('il nome non può essere vuoto')
    const now = new Date('2026-05-10T12:00:00Z')
    expect(fmtDate('2026-05-10T11:30:00Z', false, now)).toMatch(/^Oggi, /)
  })
})

describe('names and permissions', () => {
  it('validates as the server does', () => {
    expect(validName('ok.txt')).toBe('')
    expect(validName('')).toBe('the name cannot be empty')
    expect(validName(' space')).not.toBe('')
    expect(validName('a/b')).not.toBe('')
    expect(validName('..')).not.toBe('')
  })
  it('levels', () => {
    expect(atLeast('manage', 'write')).toBe(true)
    expect(atLeast('read', 'write')).toBe(false)
    expect(atLeast(undefined, 'read')).toBe(false)
  })
  it('recognizes the name conflicts', () => {
    expect(isConflict(new Error("a file 'a.txt' already exists"))).toBe(true)
    expect(isConflict(new Error("esiste gia' un file 'a.txt'"))).toBe(true)
    expect(isConflict(new Error('permission denied'))).toBe(false)
  })
})
