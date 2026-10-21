// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Msk, type Bridge, type FileEntry, type Level } from '@mosaikit/plugin-api'
import { FileManager } from './app.ts'

function entry(id: string, name: string, o: Partial<FileEntry> = {}): FileEntry {
  return { id, name, is_dir: false, size: 10, mime: '', created: '2026-01-01T00:00:00Z', modified: '2026-01-01T00:00:00Z', owner_id: 'me', owner_name: 'Io', my_level: 'manage', shared: false, parent_id: null, ...o }
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
  const msk = new Msk(bridge, { public: false, user: { id: 'me', username: 'me', name: 'Io' } })
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
  it('mostra gli elementi, il badge dei condivisi e non interpreta i nomi come HTML', async () => {
    const el = document.createElement('div')
    document.body.append(el)
    const { msk } = fake([
      entry('1', '<img src=x onerror=alert(1)>.txt'),
      entry('2', 'Progetti', { is_dir: true }),
      entry('3', 'di bruno.pdf', { owner_id: 'bruno', owner_name: 'Bruno', my_level: 'read', shared: true }),
    ])
    fm = new FileManager(el, msk)
    await tick()
    expect(el.querySelectorAll('tr.it').length).toBe(3)
    expect(el.querySelector('tbody img')).toBeNull()
    expect(el.textContent).toContain('<img src=x')
    expect(el.textContent).toContain('Condiviso da Bruno')
    // cartelle in testa
    expect(el.querySelector('tr.it .n')!.textContent).toBe('Progetti')
  })

  it('nasconde le azioni non permesse dal livello', async () => {
    const el = document.createElement('div')
    document.body.append(el)
    const { msk } = fake([entry('3', 'di bruno.zip', { owner_id: 'bruno', owner_name: 'Bruno', my_level: 'read' })])
    fm = new FileManager(el, msk)
    await tick()
    ;(el.querySelector('tr.it') as HTMLElement).click()
    const labels = [...el.querySelectorAll('.fm-bar button')].map((b) => b.textContent)
    expect(labels).toContain('Scarica')
    expect(labels).toContain('Copia in…')
    expect(labels).not.toContain('Rinomina')
    expect(labels).not.toContain('Sposta in…')
    expect(labels).not.toContain('Elimina')
    expect(labels).not.toContain('Condividi')
  })

  it('carica un file con conflitto scegliendo "mantieni entrambi"', async () => {
    const el = document.createElement('div')
    document.body.append(el)
    const { msk, calls } = fake([entry('1', 'foto.png')])
    fm = new FileManager(el, msk)
    await tick()
    const done = fm.upload([new File(['x'], 'foto.png'), new File(['y'], 'altro.txt')], null)
    await tick()
    const keep = [...document.querySelectorAll<HTMLButtonElement>('.fm-dlg button')].find((b) => b.textContent === 'Mantieni entrambi')!
    keep.click()
    await done
    const ups = calls.filter((c) => c.op === 'files.upload').map((c) => [c.args.name, c.args.replace])
    expect(ups).toEqual([
      ['foto (1).png', false],
      ['altro.txt', false],
    ])
  })
})
