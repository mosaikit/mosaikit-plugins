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
      if (op === 'confirm') return true
      return {}
    },
    onEvent: () => () => {},
  } as unknown as Bridge
  const msk = new Msk(bridge, { public: false, user: { id: 'me', username: 'me', name: 'Me' } })
  return { msk, calls }
}

const tick = () => new Promise((r) => setTimeout(r, 0))
let fm: FileManager | null = null

afterEach(() => {
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
})
