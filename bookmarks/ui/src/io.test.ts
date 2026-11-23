import { describe, expect, it } from 'vitest'
import { CSV_HEADER, clip, findDuplicates, normalizeUrl, parseBrowserHtml, parseCsvBookmarks, parseCsvText, planImport, toBrowserHtml, toCsvRows } from './io.ts'

describe('normalizeUrl', () => {
  it('makes the spellings of one page equal', () => {
    const a = normalizeUrl('https://www.Example.com/docs/?b=2&a=1&utm_source=x#top')
    expect(a).toBe('https://example.com/docs?a=1&b=2')
    expect(normalizeUrl('http://example.com:80/docs/?a=1&b=2')).toBe(a)
    expect(normalizeUrl('example.com/docs?b=2&a=1')).toBe(a)
  })
  it('keeps what makes pages different', () => {
    expect(normalizeUrl('https://example.com/a')).not.toBe(normalizeUrl('https://example.com/b'))
    expect(normalizeUrl('https://example.com:8443/')).toBe('https://example.com:8443')
    expect(normalizeUrl('https://example.com/?page=2')).not.toBe(normalizeUrl('https://example.com/'))
  })
  it('leaves non addresses alone', () => {
    expect(normalizeUrl('  ')).toBe('')
    expect(normalizeUrl('Hello World')).toBe('hello world')
  })
})

describe('duplicates', () => {
  const l = [{ url: 'https://a.example/x/' }, { url: 'http://www.a.example/x' }, { url: 'https://b.example' }]
  it('groups the same address', () => {
    expect(findDuplicates(l)).toEqual([[l[0], l[1]]])
  })
  it('plans an import: new, already saved, repeated in the file', () => {
    const inc = [{ url: 'https://a.example/x?utm_medium=mail' }, { url: 'https://c.example' }, { url: 'https://c.example/' }, { url: '' }]
    const p = planImport(l, inc)
    expect(p.fresh).toEqual([inc[1]])
    expect(p.duplicates).toHaveLength(3)
  })
})

const HTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><H3 ADD_DATE="1">Bookmarks bar</H3>
  <DL><p>
    <DT><A HREF="https://doc.rust-lang.org/book/" ADD_DATE="1">The Rust &amp; Book</A>
    <DT><H3>Dev Tools</H3>
    <DL><p>
      <DT><A HREF="https://crates.io" TAGS="rust, registry">Crates</A>
      <DD>Packages
    </DL><p>
    <DT><A HREF="javascript:alert(1)">bad</A>
    <DT><A HREF='https://example.org/?a=1&amp;b=2'>Single quoted</A>
  </DL><p>
</DL><p>`

describe('browser html', () => {
  const list = parseBrowserHtml(HTML)
  it('reads links, folders as tags, TAGS and notes, entities, and drops unsafe addresses', () => {
    expect(list.map((b) => b.title)).toEqual(['The Rust & Book', 'Crates', 'Single quoted'])
    expect(list[0]!.tags).toEqual([])
    expect(list[1]!.tags).toEqual(['dev tools', 'rust', 'registry'])
    expect(list[1]!.note).toBe('Packages')
    expect(list[2]!.url).toBe('https://example.org/?a=1&b=2')
  })
  it('writes a file that reads back the same', () => {
    const back = parseBrowserHtml(toBrowserHtml(list, 'Mosaikit'))
    expect(back.map((b) => [b.title, b.url, b.note])).toEqual(list.map((b) => [b.title, b.url, b.note]))
    expect(back[1]!.tags).toEqual(['mosaikit', 'dev tools', 'rust', 'registry'])
  })
  it('escapes markup in titles', () => {
    const html = toBrowserHtml([{ title: '<b>x</b> "q"', url: 'https://x.example', note: '', tags: [], favorite: false }])
    expect(html).not.toContain('<b>')
    expect(parseBrowserHtml(html)[0]!.title).toBe('<b>x</b> "q"')
  })
})

describe('csv', () => {
  it('writes rows and reads them back, with quotes and a semicolon file', () => {
    const rows = toCsvRows([{ title: 'A, "b"', url: 'https://a.example', note: 'two\nlines', tags: ['x', 'y'], favorite: true }])
    expect(rows[0]).toEqual(['A, "b"', 'https://a.example', 'two\nlines', 'x;y', 'yes', '', ''])
    const text = 'Title;Address;Tags;Starred\r\n"Un; titolo";https://it.example/a;uno|due;sì\r\nbroken;ftp://x;;\r\n'
    const got = parseCsvBookmarks(parseCsvText(text))
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ title: 'Un; titolo', url: 'https://it.example/a', tags: ['uno', 'due'], favorite: true })
  })
  it('carries the way of opening and the thumbnail, and refuses a thumbnail that is not a data image', () => {
    const pic = 'data:image/jpeg;base64,/9j/4AAQ'
    const rows = toCsvRows([{ title: 'S', url: 'https://s.example', note: '', tags: [], favorite: false, openMode: 'frame', thumbnail: pic }])
    expect(rows[0]!.slice(5)).toEqual(['frame', pic])
    const back = parseCsvBookmarks([CSV_HEADER, ...rows, ['E', 'https://e.example', '', '', 'no', 'sideways', 'https://evil.example/x.png']])
    expect(back[0]).toMatchObject({ openMode: 'frame', thumbnail: pic })
    expect(back[1]).toMatchObject({ openMode: '', thumbnail: '' })
  })
  it('needs an address column', () => {
    expect(parseCsvBookmarks([['name'], ['x']])).toEqual([])
  })
  it('clips to the limits of the server', () => {
    const c = clip({ title: 'x'.repeat(300), url: 'https://a.example/' + 'y'.repeat(3000), note: 'n'.repeat(3000), tags: [], favorite: false })
    expect([c.title.length, c.url.length, c.note.length]).toEqual([160, 2000, 2000])
  })
})
