// @vitest-environment happy-dom
// The editor driven like a person would: pointer events on the canvas, keys, the toolbar. The host is faked.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openEditor } from './editor.ts'
import { TEXTS } from './texts.ts'
import { Board, encodeSnapshot } from './sync.ts'
import type { ChannelLike } from './sync.ts'

const tr = TEXTS.en

function fakeMsk(level: 'read' | 'write' | 'manage', snapshot = '') {
  const updates: Record<string, unknown>[] = []
  const sent: unknown[] = []
  const channel: ChannelLike & { opened?: unknown } = {
    send: async (d) => void sent.push(d),
    setState: async () => undefined,
    onMessage: () => () => undefined,
    onPresence: () => () => undefined,
    onStatus: () => () => undefined,
    close: () => undefined,
  }
  const row = { id: 'b1', values: { title: 'Plan', snapshot, bg: 'plain' }, owner_id: 'u', owner_name: 'Ann', my_level: level, shared: false, parent_id: null, created_at: '', updated_at: '' }
  const msk = {
    user: { id: 'u1', name: 'Ann' },
    context: { lang: 'en' },
    crud: () => ({
      get: async () => ({ ...row, values: { ...row.values, snapshot: updates.length ? (updates[updates.length - 1] as { snapshot: string }).snapshot : snapshot } }),
      update: async (_id: string, v: Record<string, unknown>) => {
        updates.push(v)
        return row
      },
    }),
    realtime: { open: (o: unknown) => ((channel.opened = o), channel) },
    share: async () => undefined,
  }
  return { msk: msk as never, row: row as never, updates, sent, channel }
}

const ptr = (type: string, x: number, y: number, id = 1) => {
  const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0 })
  Object.defineProperty(e, 'pointerId', { value: id })
  return e
}
const click = (svg: Element, x: number, y: number) => {
  svg.dispatchEvent(ptr('pointerdown', x, y))
  svg.dispatchEvent(ptr('pointerup', x, y))
}
const drag = (svg: Element, a: [number, number], b: [number, number]) => {
  svg.dispatchEvent(ptr('pointerdown', ...a))
  svg.dispatchEvent(ptr('pointermove', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2))
  svg.dispatchEvent(ptr('pointermove', ...b))
  svg.dispatchEvent(ptr('pointerup', ...b))
}
const until = (f: () => void) => vi.waitFor(f, { timeout: 10_000, interval: 10 })
const key = (target: Element, k: string, o: KeyboardEventInit = {}) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }))

let opened: ReturnType<typeof openEditor> | null = null
afterEach(async () => {
  await opened?.destroy()
  opened = null
  document.body.replaceChildren()
  vi.useRealTimers()
})

function start(level: 'read' | 'write' | 'manage', snapshot = '') {
  const f = fakeMsk(level, snapshot)
  opened = openEditor({ msk: f.msk, row: f.row, tr, onBack: () => undefined })
  document.body.append(opened.el)
  const svg = opened.el.querySelector('svg.wb-svg') as SVGSVGElement
  const tool = (t: string) => (opened!.el.querySelector(`[data-tool="${t}"]`) as HTMLButtonElement).click()
  return { ...f, svg, tool, root: opened.el }
}

describe('the editor of a writer', () => {
  it('has the canvas labelled and described, and buttons with names', async () => {
    const { svg, root } = start('write')
    expect(svg.getAttribute('role')).toBe('application')
    expect(svg.getAttribute('aria-label')).toBe(tr.canvas)
    expect(document.getElementById('wb-desc')?.textContent).toContain(tr.empty)
    for (const b of root.querySelectorAll('button')) expect((b.getAttribute('aria-label') ?? b.textContent ?? '').trim(), b.outerHTML).not.toBe('')
    expect(root.querySelectorAll('.wb-sw')).toHaveLength(8)
  })

  it('a note: pick the tool, click, type, and it is there; undo takes it away', async () => {
    const { svg, tool, root } = start('write')
    tool('note')
    click(svg, 300, 200)
    const ta = root.querySelector('textarea.wb-edit') as HTMLTextAreaElement
    await until(() => expect(ta.hidden).toBe(false))
    ta.value = 'First idea'
    ta.dispatchEvent(new Event('input'))
    key(ta, 'Escape')
    await until(() => {
      expect(root.querySelectorAll('.wb-obj[data-type="note"]')).toHaveLength(1)
      expect(root.querySelector('.wb-obj text')?.textContent).toContain('First')
      expect(document.getElementById('wb-desc')?.textContent).toContain('1 sticky notes')
    })
    ;(root.querySelector('[aria-label^="Undo"]') as HTMLButtonElement).click()
    // typing and creating are one step each, but a fast run merges: undo until it is gone
    for (let i = 0; i < 3; i++) (root.querySelector('[aria-label^="Undo"]') as HTMLButtonElement).click()
    await until(() => expect(root.querySelectorAll('.wb-obj')).toHaveLength(0))
  })

  it('a rectangle by dragging, moved by dragging, deleted with the key, and the pen draws a stroke', async () => {
    const { svg, tool, root } = start('write')
    tool('rect')
    drag(svg, [100, 100], [260, 200])
    await until(() => expect(root.querySelector('.wb-obj[data-type="rect"] rect')).not.toBeNull())
    const rect = () => root.querySelector('.wb-obj[data-type="rect"] rect') as SVGRectElement
    expect(rect().getAttribute('width')).toBe('160')
    expect(rect().getAttribute('x')).toBe('100')
    drag(svg, [180, 150], [280, 190])
    await until(() => {
      expect(rect().getAttribute('x')).toBe('200')
      expect(rect().getAttribute('y')).toBe('140')
    })
    key(svg, 'ArrowRight')
    await until(() => {
      expect(rect().getAttribute('x')).toBe('201')
    })
    key(svg, 'd', { ctrlKey: true })
    await until(() => {
      expect(root.querySelectorAll('.wb-obj[data-type="rect"]')).toHaveLength(2)
    })
    key(svg, 'Delete')
    await until(() => {
      expect(root.querySelectorAll('.wb-obj[data-type="rect"]')).toHaveLength(1)
    })
    tool('pen')
    svg.dispatchEvent(ptr('pointerdown', 400, 300))
    for (let i = 1; i <= 20; i++) svg.dispatchEvent(ptr('pointermove', 400 + i * 5, 300 + Math.sin(i / 3) * 30))
    svg.dispatchEvent(ptr('pointerup', 500, 300))
    await until(() => {
      expect(root.querySelectorAll('.wb-obj[data-type="pen"] path')).toHaveLength(1)
    })
  })

  it('the keys choose tools and Tab walks the objects', async () => {
    const { svg, tool, root } = start('write')
    tool('rect')
    drag(svg, [10, 10], [110, 80])
    tool('ellipse')
    drag(svg, [200, 10], [300, 80])
    await until(() => expect(root.querySelectorAll('.wb-obj')).toHaveLength(2))
    key(svg, 'Escape')
    key(svg, 'Tab')
    await until(() => {
      expect(document.getElementById('wb-desc')?.textContent).toContain('1 selected')
    })
    key(svg, 'n')
    expect(root.querySelector('[data-tool="note"]')?.getAttribute('aria-pressed')).toBe('true')
    key(svg, 'Escape')
    expect(root.querySelector('[data-tool="select"]')?.getAttribute('aria-pressed')).toBe('true')
  })

  it('saves what changed after 3 seconds, once, with the whole state', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { svg, tool, updates, root } = start('write')
    tool('rect')
    drag(svg, [10, 10], [110, 80])
    expect(root.querySelector('.wb-save')?.textContent).toBe(tr.unsaved)
    await vi.advanceTimersByTimeAsync(2900)
    expect(updates).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(300)
    expect(updates).toHaveLength(1)
    expect(String(updates[0]!.snapshot).length).toBeGreaterThan(10)
    expect(updates[0]!.bg).toBe('plain')
    expect(root.querySelector('.wb-save')?.textContent).toBe(tr.saved)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(updates).toHaveLength(1)
  })

  it('opens a saved board with its objects and the live channel with the state of this tab', async () => {
    const b = new Board()
    b.add({ id: 'n1', type: 'note', x: 5, y: 5, w: 180, h: 140, text: 'Saved note', color: 'blue', points: [], z: 1, author: 'x' })
    const { root, channel } = start('write', encodeSnapshot(b.doc))
    await until(() => {
      expect(root.querySelector('.wb-obj text')?.textContent).toContain('Saved')
      expect(channel.opened).toMatchObject({ resource: 'b1', name: 'doc', state: { w: 1 } })
    })
  })
})

describe('the editor of a reader', () => {
  it('has no tools, no colours, nothing to change, and never saves or sends', async () => {
    const { svg, root, updates, sent } = start('read')
    expect(root.querySelector('[data-tool="note"]')).toBeNull()
    expect(root.querySelector('.wb-sw')).toBeNull()
    expect(root.querySelector('.wb-chip')?.textContent).toBe(tr.viewOnly)
    expect((root.querySelector('.wb-title') as HTMLInputElement).readOnly).toBe(true)
    click(svg, 50, 50)
    key(svg, 'n')
    key(svg, 'Delete')
    key(svg, 'z', { ctrlKey: true })
    drag(svg, [10, 10], [100, 100])
    // nothing happens: a pause longer than any timer of the editor can only make the check stricter, never fail it
    await new Promise((r) => setTimeout(r, 400))
    expect(root.querySelectorAll('.wb-obj')).toHaveLength(0)
    expect(updates).toHaveLength(0)
    expect(sent).toHaveLength(0)
  })

  it('opened as a reader the board is still drawn and can be panned and zoomed', async () => {
    const b = new Board()
    b.add({ id: 'n1', type: 'rect', x: 0, y: 0, w: 100, h: 50, text: '', color: 'red', points: [], z: 1, author: 'x' })
    const { svg, root } = start('read', encodeSnapshot(b.doc))
    await until(() => {
      expect(root.querySelectorAll('.wb-obj')).toHaveLength(1)
    })
    const before = root.querySelector('.wb-world')!.getAttribute('transform')
    drag(svg, [100, 100], [160, 140])
    expect(root.querySelector('.wb-world')!.getAttribute('transform')).not.toBe(before)
    ;(root.querySelector('[aria-label^="Zoom in"]') as HTMLButtonElement).click()
    expect(root.querySelector('.wb-zoomval')?.textContent).not.toBe('100%')
    expect(root.querySelectorAll('.wb-obj')).toHaveLength(1)
  })
})

describe('frames and templates', () => {
  it('a frame is drawn behind a note, its title is edited, and moving it takes the note along', async () => {
    const { svg, tool, root } = start('write')
    tool('frame')
    drag(svg, [100, 100], [500, 400])
    const ta = root.querySelector('textarea.wb-edit') as HTMLTextAreaElement
    await until(() => expect(ta.hidden).toBe(false))
    ta.value = 'Plan'
    ta.dispatchEvent(new Event('input'))
    key(ta, 'Escape')
    await until(() => expect(root.querySelector('.wb-obj[data-type="frame"] text')?.textContent).toContain('Plan'))
    tool('note')
    click(svg, 300, 250)
    const ta2 = root.querySelector('textarea.wb-edit') as HTMLTextAreaElement
    await until(() => expect(ta2.hidden).toBe(false))
    key(ta2, 'Escape')
    await until(() => expect(root.querySelectorAll('.wb-obj')).toHaveLength(2))
    // the frame sits behind the note whatever the order they were made in
    const order = [...root.querySelectorAll('.wb-obj')].map((g) => g.getAttribute('data-type'))
    expect(order[0]).toBe('frame')
    tool('select')
    const noteX = () => Number(root.querySelector('.wb-obj[data-type="note"] rect')!.getAttribute('x'))
    const frameX = () => Number(root.querySelector('.wb-obj[data-type="frame"] rect')!.getAttribute('x'))
    const [n0, f0] = [noteX(), frameX()]
    // drag the frame by its title band
    drag(svg, [300, 110], [380, 110])
    await until(() => {
      expect(frameX()).toBe(f0 + 80)
      expect(noteX()).toBe(n0 + 80)
    })
  })

  it('a template puts its frames and notes on the board as one step and undo takes them away', async () => {
    const { root } = start('write')
    ;(root.querySelector('[data-testid="templates"]') as HTMLButtonElement).click()
    const kanban = document.querySelector('[data-template="kanban"]') as HTMLButtonElement
    expect(document.body.textContent).toContain(tr.tplKanbanText)
    kanban.click()
    await until(() => {
      expect(root.querySelectorAll('.wb-obj[data-type="frame"]')).toHaveLength(3)
      expect(root.querySelectorAll('.wb-obj[data-type="note"]')).toHaveLength(1)
    })
    expect(root.textContent).toContain(tr.tplTodo)
    ;(root.querySelector('[aria-label^="Undo"]') as HTMLButtonElement).click()
    await until(() => expect(root.querySelectorAll('.wb-obj')).toHaveLength(0))
  })

  it('a reader has no template button', () => {
    const { root } = start('read')
    expect(root.querySelector('[data-testid="templates"]')).toBeNull()
  })
})

