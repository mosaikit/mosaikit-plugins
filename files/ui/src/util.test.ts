import { describe, expect, it } from 'vitest'
import type { FileEntry } from '@mosaikit/plugin-api'
import { atLeast, fmtSize, freeName, isConflict, kindLabel, previewMode, sortEntries, validName } from './util.ts'

function entry(name: string, is_dir = false, size = 0, modified = '2026-01-01T00:00:00Z'): FileEntry {
  return { id: name, name, is_dir, size, mime: '', created: modified, modified, owner_id: 'u', owner_name: 'anna', my_level: 'manage', shared: false, parent_id: null }
}

describe('freeName', () => {
  it('aggiunge (n) prima dell’estensione e salta i nomi presi', () => {
    expect(freeName('foto.png', new Set(['foto.png']))).toBe('foto (1).png')
    expect(freeName('foto.png', new Set(['foto.png', 'foto (1).png']))).toBe('foto (2).png')
    expect(freeName('archivio.tar.gz', new Set())).toBe('archivio.tar (1).gz')
  })
  it('senza estensione, file nascosti e cartelle', () => {
    expect(freeName('LEGGIMI', new Set())).toBe('LEGGIMI (1)')
    expect(freeName('.env', new Set())).toBe('.env (1)')
    expect(freeName('v1.2', new Set(), true)).toBe('v1.2 (1)')
  })
})

describe('sortEntries', () => {
  const list = [entry('b.txt', false, 10, '2026-03-01T00:00:00Z'), entry('Zeta', true), entry('a10.txt', false, 5), entry('a2.txt', false, 50), entry('alfa', true)]
  it('cartelle in testa, poi ordine naturale per nome', () => {
    expect(sortEntries(list, 'name', 1).map((e) => e.name)).toEqual(['alfa', 'Zeta', 'a2.txt', 'a10.txt', 'b.txt'])
    expect(sortEntries(list, 'name', -1).map((e) => e.name)).toEqual(['Zeta', 'alfa', 'b.txt', 'a10.txt', 'a2.txt'])
  })
  it('per dimensione e data, con filtro', () => {
    expect(sortEntries(list, 'size', -1).filter((e) => !e.is_dir).map((e) => e.name)).toEqual(['a2.txt', 'b.txt', 'a10.txt'])
    expect(sortEntries(list, 'modified', -1)[2].name).toBe('b.txt')
    expect(sortEntries(list, 'name', 1, 'A1').map((e) => e.name)).toEqual(['a10.txt'])
  })
  it('non modifica l’array originale', () => {
    const copy = [...list]
    sortEntries(list, 'size', 1)
    expect(list).toEqual(copy)
  })
})

describe('anteprime e tipi', () => {
  it('HTML e SVG solo come testo', () => {
    expect(previewMode(entry('pagina.html'))).toBe('text')
    expect(previewMode(entry('logo.svg'))).toBe('text')
    expect(previewMode(entry('foto.JPG'))).toBe('image')
    expect(previewMode(entry('doc.pdf'))).toBe('pdf')
    expect(previewMode(entry('a.zip'))).toBeNull()
    expect(previewMode(entry('foto.png', true))).toBeNull()
  })
  it('etichette e dimensioni', () => {
    expect(kindLabel(entry('x.pdf'))).toBe('Documento PDF · PDF')
    expect(kindLabel(entry('cartella', true))).toBe('Cartella')
    expect(fmtSize(512)).toBe('512 B')
    expect(fmtSize(1536)).toBe('1,5 KB')
  })
})

describe('nomi e permessi', () => {
  it('valida come il server', () => {
    expect(validName('ok.txt')).toBe('')
    expect(validName('')).not.toBe('')
    expect(validName(' spazio')).not.toBe('')
    expect(validName('a/b')).not.toBe('')
    expect(validName('..')).not.toBe('')
  })
  it('livelli', () => {
    expect(atLeast('manage', 'write')).toBe(true)
    expect(atLeast('read', 'write')).toBe(false)
    expect(atLeast(undefined, 'read')).toBe(false)
  })
  it('riconosce i conflitti di nome', () => {
    expect(isConflict(new Error("esiste gia' un file 'a.txt'"))).toBe(true)
    expect(isConflict(new Error('permesso negato'))).toBe(false)
  })
})
