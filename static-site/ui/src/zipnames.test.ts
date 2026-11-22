import { describe, expect, it } from 'vitest'
import { LIMITS, hasIndexHtml, inspectZip, looksLikeZip, zipEntries, zipEntryNames } from './zipnames.ts'

const e = (name: string, size = 100) => ({ name, size })
const zip = { name: 'site.zip', size: 5000, type: 'application/zip' }

/** A stored (uncompressed) zip with the given names and contents, built by hand: local headers, central directory, end record. */
function makeZip(files: { name: string; data: string }[]): Blob {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name)
    const data = enc.encode(f.data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, data.length, true)
    local.setUint16(26, name.length, true)
    parts.push(new Uint8Array(local.buffer), name, data)
    const cen = new DataView(new ArrayBuffer(46))
    cen.setUint32(0, 0x02014b50, true)
    cen.setUint16(4, 20, true)
    cen.setUint16(6, 20, true)
    cen.setUint32(20, data.length, true)
    cen.setUint32(24, data.length, true)
    cen.setUint16(28, name.length, true)
    cen.setUint32(42, offset, true)
    central.push(new Uint8Array(cen.buffer), name)
    offset += 30 + name.length + data.length
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, cdSize, true)
  end.setUint32(16, offset, true)
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)].map((p) => p.slice().buffer as ArrayBuffer))
}

describe('reading a zip', () => {
  it('gives the names and the unpacked sizes', async () => {
    const z = makeZip([{ name: 'index.html', data: '<h1>hi</h1>' }, { name: 'css/a.css', data: 'body{}' }])
    expect(await zipEntries(z)).toEqual([{ name: 'index.html', size: 11 }, { name: 'css/a.css', size: 6 }])
    expect(await zipEntryNames(z)).toEqual(['index.html', 'css/a.css'])
  })
  it('says null for what is not a zip', async () => {
    expect(await zipEntries(new Blob(['not a zip at all'.repeat(5)]))).toBeNull()
  })
  it('finds the index at any level', () => {
    expect(hasIndexHtml(['a/b/Index.HTML'])).toBe(true)
    expect(hasIndexHtml(['a/b/home.html'])).toBe(false)
  })
})

describe('the type of the file', () => {
  it('accepts a .zip with a zip type, an empty type or the generic one', () => {
    expect(looksLikeZip('a.zip', 'application/zip')).toBe(true)
    expect(looksLikeZip('a.ZIP', '')).toBe(true)
    expect(looksLikeZip('a.zip', 'application/x-zip-compressed')).toBe(true)
    expect(looksLikeZip('a.zip', 'application/octet-stream')).toBe(true)
    expect(looksLikeZip('a.rar', 'application/zip')).toBe(false)
    expect(looksLikeZip('a.zip', 'image/png')).toBe(false)
  })
})

describe('the report of a zip', () => {
  it('is fine with an index.html at the root', () => {
    const r = inspectZip([e('index.html', 10), e('css/a.css', 30), e('img/', 0), e('img/logo.png', 60)], zip)
    expect(r.problems).toEqual([])
    expect(r.warnings).toEqual([])
    expect(r.files).toBe(3)
    expect(r.bytes).toBe(100)
    expect(r.entry).toBe('index.html')
    expect(r.top.map((t) => t.name)).toEqual(['img', 'css', 'index.html'])
    expect(r.top[0]).toEqual({ name: 'img', folder: true, files: 1, bytes: 60 })
  })
  it('refuses a zip without an index.html and one that is empty', () => {
    expect(inspectZip([e('about.html')], zip).problems).toEqual(['noindex'])
    expect(inspectZip([e('d/', 0)], zip).problems).toEqual(['empty'])
  })
  it('uses the least nested index and warns about it', () => {
    const r = inspectZip([e('site/docs/index.html'), e('site/index.html')], zip)
    expect(r.entry).toBe('site/index.html')
    expect(r.warnings).toEqual(['nested'])
  })
  it('refuses paths that leave the folder', () => {
    expect(inspectZip([e('index.html'), e('../evil.html')], zip).problems).toEqual(['unsafe'])
    expect(inspectZip([e('index.html'), e('/etc/passwd')], zip).problems).toEqual(['unsafe'])
    expect(inspectZip([e('index.html'), e('C:\\x.html')], zip).problems).toEqual(['unsafe'])
  })
  it('ignores the junk of the system but says so', () => {
    const r = inspectZip([e('index.html'), e('__MACOSX/._index.html'), e('.DS_Store')], zip)
    expect(r.files).toBe(1)
    expect(r.warnings).toEqual(['junk'])
  })
  it('judges the size and the type of the file', () => {
    expect(inspectZip([e('index.html')], { name: 'x.zip', size: LIMITS.zip + 1, type: '' }).problems).toEqual(['zipbig'])
    expect(inspectZip([e('index.html')], { name: 'x.tar', size: 10 }).problems).toEqual(['type'])
    expect(inspectZip([e('index.html', LIMITS.unpacked + 1)], zip).problems).toEqual(['unpackedbig'])
    expect(inspectZip([e('index.html'), e('v.mp4', LIMITS.file + 1)], zip).warnings).toEqual(['bigfile'])
  })
  it('leaves the rest to the server when the directory cannot be read', () => {
    const r = inspectZip(null, zip)
    expect(r.problems).toEqual([])
    expect(r.files).toBe(0)
  })
})

describe('a zip made of one folder', () => {
  it('lists what is inside the folder', () => {
    const r = inspectZip([e('site/index.html', 10), e('site/css/a.css', 30), e('site/css/b.css', 30)], zip)
    expect(r.top.map((t) => t.name)).toEqual(['css', 'index.html'])
    expect(r.top[0]!.files).toBe(2)
  })
})
