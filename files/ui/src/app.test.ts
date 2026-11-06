// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Msk, type Bridge, type FileEntry, type Level } from '@mosaikit/plugin-api'
import { FileManager } from './app.ts'

function entry(id: string, name: string, o: Partial<FileEntry> = {}): FileEntry {
  return { id, name, is_dir: false, size: 10, mime: '', created: '2026-01-01T00:00:00Z', modified: '2026-01-01T00:00:00Z', owner_id: 'me', owner_name: 'Me', my_level: 'manage', shared: false, parent_id: null, ...o }
}

function fake(entries: FileEntry[], level: Level = 'write') {
  const calls: { op: string; args: any }[] = []
  const bridge = {
    call: async (op: string, args: any) => {
      calls.push({ op, args })
      if (op === 'files.list') return { parent: args.parent, path: [], entries, my_level: level }
      if (op === 'files.upload') return entry('new-' + args.name, args.name)
      if (op === 'files.upload.begin') return { id: 'u1', received: 0, size: args.size }
      if (op === 'files.upload.chunk') return { id: 'u1', received: Math.min(bigSize, args.offset + (8 << 20)), size: bigSize }
      if (op === 'files.upload.finish') return entry('big-done', 'big.bin')
      if (op === 'files.mkdir') return entry('dir-' + args.name, args.name, { is_dir: true })
      if (op === 'files.profiles') return { suggestions }
      if (op === 'files.unzip') return { folder: args.folder ? entry('made', args.folder, { is_dir: true }) : null, files: 2, folders: 1, skipped: 0, suggestions }
      if (op === 'confirm') return true
      return {}
    },
    onEvent: () => () => {},
  } as unknown as Bridge
  const msk = new Msk(bridge, { public: false, user: { id: 'me', username: 'me', name: 'Me' } })
  return { msk, calls }
}

let suggestions: unknown[] = []
let bigSize = 0
const tick = () => new Promise((r) => setTimeout(r, 0))
let fm: FileManager | null = null

afterEach(() => {
  suggestions = []
  fm?.dispose()
  fm = null
  document.body.replaceChildren()
})

describe('FileManager', () => {
  it('shows the items, the badge of the shared ones and does not read the names as HTML', async () => {
    const el = document.createElement('div')
    document.body.append(el)
    const { msk } = fake([
      entry('1', '<img src=x onerror=alert(1)>.txt'),
      entry('2', 'Projects', { is_dir: true }),
      entry('3', 'from bruno.pdf', { owner_id: 'bruno', owner_name: 'Bruno', my_level: 'read', shared: true }),
    ])
    fm = new FileManager(el, msk)
    await tick()
    expect(el.querySelectorAll('tr.it').length).toBe(3)
    expect(el.querySelector('tbody img')).toBeNull()
    expect(el.textContent).toContain('<img src=x')
    expect(el.textContent).toContain('Shared by Bruno')
    // folders first
    expect(el.querySelector('tr.it .n')!.textContent).toBe('Projects')
  })

  it('hides the actions the level does not allow', async () => {
    const el = document.createElement('div')
    document.body.append(el)
    const { msk } = fake([entry('3', 'from bruno.zip', { owner_id: 'bruno', owner_name: 'Bruno', my_level: 'read' })])
    fm = new FileManager(el, msk)
    await tick()
    ;(el.querySelector('tr.it') as HTMLElement).click()
    const labels = [...el.querySelectorAll('.fm-bar button')].map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(labels).toContain('Download')
    expect(labels).toContain('Copy to…')
    expect(labels).not.toContain('Rename')
    expect(labels).not.toContain('Move to…')
    expect(labels).not.toContain('Delete')
    expect(labels).not.toContain('Share')
  })

  it('draws a big folder a page at a time and keeps the selection on all of it', async () => {
    const el = document.createElement('div')
    document.body.append(el)
    const many = Array.from({ length: 5000 }, (_, i) => entry(`f${i}`, `file-${String(i).padStart(4, '0')}.txt`))
    const { msk } = fake(many)
    const t0 = performance.now()
    fm = new FileManager(el, msk)
    await tick()
    // a page of 100 rows, not 5000: the bound only catches drawing everything at once, and holds on a busy machine
    expect(performance.now() - t0).toBeLessThan(15_000)
    expect(el.querySelectorAll('tr.it').length).toBe(100)
    expect(el.querySelector('.fm-foot .msk-count')!.textContent).toBe('100 of 5000 items')
    // the button draws the next page
    ;(el.querySelector('.fm-foot button') as HTMLButtonElement).click()
    expect(el.querySelectorAll('tr.it').length).toBe(200)
    // Ctrl+A selects the whole folder, drawn or not
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }))
    expect(el.querySelector('.fm-bar .count')!.textContent).toBe('5000 items selected')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    // the arrows go on past the drawn rows: the next page is drawn up to the focused one
    ;(el.querySelectorAll('tr.it')[199] as HTMLElement).click()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(el.querySelectorAll('tr.it').length).toBe(300)
    expect(el.querySelector('tr.it.sel .n')!.textContent).toBe('file-0200.txt')
  }, 60_000)

  it('uploads a file with a conflict choosing "keep both"', async () => {
    const el = document.createElement('div')
    document.body.append(el)
    const { msk, calls } = fake([entry('1', 'photo.png')])
    fm = new FileManager(el, msk)
    await tick()
    const done = fm.upload([new File(['x'], 'photo.png'), new File(['y'], 'other.txt')], null)
    await tick()
    const keep = [...document.querySelectorAll<HTMLButtonElement>('.fm-dlg button')].find((b) => b.textContent === 'Keep both')!
    keep.click()
    await done
    const ups = calls.filter((c) => c.op === 'files.upload').map((c) => [c.args.name, c.args.replace])
    expect(ups).toEqual([
      ['photo (1).png', false],
      ['other.txt', false],
    ])
  })

  it('unpacks a zip into a new folder and offers the plugin that knows what it is', async () => {
    suggestions = [{ plugin: 'com.test.geo', plugin_label: 'Geo data', profile: 'tiles3d', label: '3D Tiles dataset', folder: 'made', marker: 'tileset.json', at: 'profile/tiles3d/made?source=com.mosaikit.files' }]
    const el = document.createElement('div')
    document.body.append(el)
    const { msk, calls } = fake([entry('1', 'city', { is_dir: true })])
    fm = new FileManager(el, msk)
    await tick()
    const done = fm.upload([new File(['z'], 'city.zip'), new File(['t'], 'note.txt')], null)
    await tick()
    expect(document.querySelector('.fm-dlg')!.textContent).toContain('“city.zip” is a zip archive')
    ;[...document.querySelectorAll<HTMLButtonElement>('.fm-dlg button')].find((b) => b.textContent === 'Unpack into a new folder')!.click()
    await done
    const unzip = calls.find((c) => c.op === 'files.unzip')!
    // the name "city" is taken: the new folder gets another one; the zip itself is not uploaded as a file
    expect(unzip.args).toMatchObject({ folder: 'city (1)', conflict: 'fail' })
    expect(calls.filter((c) => c.op === 'files.upload').map((c) => c.args.name)).toEqual(['note.txt'])
    const note = document.querySelector('.fm-note')!
    expect(note.textContent).toContain('“city (1)” looks like a 3D Tiles dataset')
    ;[...note.querySelectorAll('button')].find((b) => b.textContent === 'Open in Geo data')!.click()
    await tick()
    expect(calls.find((c) => c.op === 'nav.open')!.args).toEqual({ plugin: 'com.test.geo', at: 'profile/tiles3d/made?source=com.mosaikit.files' })
    expect(document.querySelector('.fm-note')).toBeNull()
  })

  it('uploads a folder with its structure into a new folder, then offers the apps that recognise it', async () => {
    suggestions = [{ plugin: 'com.test.geo', plugin_label: 'Geo data', profile: 'tiles3d', label: '3D Tiles dataset', folder: 'dir-pics (1)', marker: 'tileset.json', at: 'profile/tiles3d/dir-pics (1)' }]
    const el = document.createElement('div')
    document.body.append(el)
    // a folder called "pics" is already there: the new one gets another name, nothing is merged
    const { msk, calls } = fake([entry('1', 'pics', { is_dir: true })])
    fm = new FileManager(el, msk)
    await tick()
    const file = (path: string) => Object.defineProperty(new File(['x'], path.split('/').pop()!), 'webkitRelativePath', { value: path })
    ;(fm as unknown as { pickDirectory: () => void }).pickDirectory()
    const picker = document.querySelector<HTMLInputElement>('input[webkitdirectory]')!
    Object.defineProperty(picker, 'files', { value: [file('pics/a.txt'), file('pics/sub/b.txt')], configurable: true })
    picker.dispatchEvent(new Event('change'))
    for (let i = 0; i < 20; i++) await tick()
    expect(calls.filter((c) => c.op === 'files.mkdir').map((c) => [c.args.name, c.args.parent])).toEqual([
      ['pics (1)', null],
      ['sub', 'dir-pics (1)'],
    ])
    expect(calls.filter((c) => c.op === 'files.upload').map((c) => [c.args.name, c.args.parent])).toEqual([
      ['a.txt', 'dir-pics (1)'],
      ['b.txt', 'dir-sub'],
    ])
    expect(calls.find((c) => c.op === 'files.profiles')!.args.id).toBe('dir-pics (1)')
    expect(document.querySelector('.fm-note')!.textContent).toContain('looks like a 3D Tiles dataset')
  })

  it('asks which apps recognise a folder from its menu, and says so when none does', async () => {
    const el = document.createElement('div')
    document.body.append(el)
    const { msk, calls } = fake([entry('1', 'city', { is_dir: true })])
    fm = new FileManager(el, msk)
    await tick()
    ;(el.querySelector('tr.it') as HTMLElement).click()
    const button = [...el.querySelectorAll<HTMLButtonElement>('.fm-bar button')].find((b) => b.getAttribute('aria-label') === 'Use in another app…')!
    button.click()
    await tick()
    expect(calls.find((c) => c.op === 'files.profiles')!.args.id).toBe('1')
    expect(calls.find((c) => c.op === 'toast')!.args.text).toBe('No app recognises “city”')
    expect(document.querySelector('.fm-note')).toBeNull()
  })

  it('sends a big file in pieces, and keeps a zip too big to unpack as a file', async () => {
    const el = document.createElement('div')
    document.body.append(el)
    const { msk, calls } = fake([])
    fm = new FileManager(el, msk)
    await tick()
    const sized = (name: string, size: number) => {
      bigSize = size
      return Object.defineProperty(new File(['x'], name), 'size', { value: size })
    }
    await fm.upload([sized('big.bin', 300 << 20)], null)
    expect(calls.filter((c) => c.op === 'files.upload')).toHaveLength(0)
    expect(calls.map((c) => c.op).filter((o) => o.startsWith('files.upload.')).slice(0, 2)).toEqual(['files.upload.begin', 'files.upload.chunk'])
    expect(calls.some((c) => c.op === 'files.upload.finish')).toBe(true)

    // a zip over the limit: «Unpack here» is chosen but nothing is unpacked, the zip goes up as a file
    calls.length = 0
    const done = fm.upload([sized('city.zip', 500 << 20)], null)
    await tick()
    ;[...document.querySelectorAll<HTMLButtonElement>('.fm-dlg button')].find((b) => b.textContent === 'Unpack here')!.click()
    await done
    expect(calls.some((c) => c.op === 'files.unzip')).toBe(false)
    expect(calls.some((c) => c.op === 'files.upload.begin' && c.args.name === 'city.zip')).toBe(true)
    expect(calls.find((c) => c.op === 'toast')!.args.text).toContain('too big to unpack')
  })
})
