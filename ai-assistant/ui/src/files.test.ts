import { describe, expect, it } from 'vitest'
import { kindOf, MAX_IMAGE_BYTES, speechLang } from './files.ts'

describe('what can be attached', () => {
  it('takes images, PDF and text, by type or by the extension a browser leaves untyped', () => {
    expect(kindOf('a.png', 'image/png')).toMatchObject({ kind: 'image', limit: MAX_IMAGE_BYTES })
    expect(kindOf('r.pdf', 'application/pdf')?.kind).toBe('pdf')
    expect(kindOf('r.PDF', '')?.kind).toBe('pdf')
    expect(kindOf('notes.md', '')).toMatchObject({ kind: 'text', mime: 'text/markdown' })
    expect(kindOf('t.csv', 'application/octet-stream')).toMatchObject({ kind: 'text', mime: 'text/csv' })
    expect(kindOf('d.json', 'application/json')?.kind).toBe('text')
    expect(kindOf('main.rs', '')).toMatchObject({ kind: 'text', mime: 'text/plain' })
  })
  it('refuses the rest', () => {
    expect(kindOf('a.exe', 'application/x-msdownload')).toBeNull()
    expect(kindOf('v.mp4', 'video/mp4')).toBeNull()
    expect(kindOf('x.svg', 'image/svg+xml')).toBeNull()
    expect(kindOf('noext', '')).toBeNull()
  })
})

describe('the language of the voice', () => {
  it('follows the language of the interface', () => {
    expect(speechLang('it')).toBe('it-IT')
    expect(speechLang('IT-it')).toBe('it-IT')
    expect(speechLang('zh')).toBe('zh-CN')
  })
})
