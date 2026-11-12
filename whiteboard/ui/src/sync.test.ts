import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import type { Obj } from './logic.ts'
import { Board, Live, MAX_FRAME_B64, MAX_SNAPSHOT, Reassembler, applySnapshot, encodeSnapshot, fitsSnapshot, frames, fromB64, presenceState, toB64, type ChannelLike, type ChannelPerson, type Cursor, type Wire } from './sync.ts'

const obj = (id: string, o: Partial<Obj> = {}): Obj => ({ id, type: 'note', x: 0, y: 0, w: 180, h: 140, text: '', color: 'yellow', points: [], z: 1, author: 'u', ...o })
const sync = (a: Y.Doc, b: Y.Doc) => {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)))
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)))
}
const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms))
/** Waits for a condition instead of a fixed time: the timers of the code under test are real, a busy machine only makes them later. */
const until = (f: () => void) => vi.waitFor(f, { timeout: 10_000, interval: 10 })

describe('the board document', () => {
  it('adds, patches and removes objects', () => {
    const b = new Board()
    b.add(obj('a', { text: 'hello' }))
    expect(b.get('a')?.text).toBe('hello')
    b.patch({ a: { x: 40, text: 'bye' }, nope: { x: 1 } })
    expect(b.get('a')).toMatchObject({ x: 40, text: 'bye', y: 0 })
    b.remove(['a'])
    expect(b.get('a')).toBeUndefined()
    expect(b.size).toBe(0)
  })
  it('reads a damaged object safely', () => {
    const b = new Board()
    const m = new Y.Map<unknown>()
    b.objects.set('z', m)
    m.set('id', 'z')
    m.set('type', 'weird')
    m.set('x', 'far')
    m.set('points', [1, 'x', 2])
    expect(b.get('z')).toMatchObject({ id: 'z', type: 'rect', x: 0, points: [1, 2], color: 'yellow' })
  })
  it('two people changing different properties of one object both keep their change; the same property: one wins, the same for both', () => {
    const a = new Board()
    a.add(obj('o', { text: 'start' }))
    const b = new Board()
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))
    a.patch({ o: { x: 100, color: 'blue' } })
    b.patch({ o: { y: 200, color: 'green' } })
    sync(a.doc, b.doc)
    expect(a.get('o')).toEqual(b.get('o'))
    expect(a.get('o')).toMatchObject({ x: 100, y: 200, text: 'start' })
    expect(['blue', 'green']).toContain(a.get('o')!.color)
  })
  it('an edit of an object someone deleted does nothing and does not break', () => {
    const a = new Board()
    a.add(obj('o'))
    const b = new Board()
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))
    a.remove(['o'])
    b.patch({ o: { x: 5 } })
    sync(a.doc, b.doc)
    expect(a.size).toBe(0)
    expect(b.size).toBe(0)
  })
  it('undo and redo only touch what this person did', () => {
    const a = new Board()
    const b = new Board()
    a.add(obj('mine'))
    sync(a.doc, b.doc)
    b.add(obj('theirs'))
    sync(a.doc, b.doc)
    a.undo.stopCapturing()
    a.patch({ mine: { x: 50 } })
    a.undo.undo()
    expect(a.get('mine')?.x).toBe(0)
    a.undo.undo()
    expect(a.get('mine')).toBeUndefined()
    expect(a.get('theirs')).toBeDefined()
    a.undo.redo()
    expect(a.get('mine')).toBeDefined()
  })
  it('the state is the same whoever seeds it: loading a snapshot twice adds nothing', () => {
    const a = new Board()
    a.add(obj('o'))
    const snap = encodeSnapshot(a.doc)
    const b = new Board()
    expect(applySnapshot(b.doc, snap)).toBe(true)
    expect(applySnapshot(b.doc, snap)).toBe(true)
    const c = new Board()
    applySnapshot(c.doc, snap)
    sync(b.doc, c.doc)
    expect(b.size).toBe(1)
    expect(c.size).toBe(1)
  })
  it('bad snapshots are refused and the size is bounded', () => {
    expect(applySnapshot(new Y.Doc(), '!!not base64!!')).toBe(false)
    expect(applySnapshot(new Y.Doc(), '')).toBe(true)
    expect(fitsSnapshot('A'.repeat(MAX_SNAPSHOT))).toBe(true)
    expect(fitsSnapshot('A'.repeat(MAX_SNAPSHOT + 1))).toBe(false)
  })
  it('reports the objects an event is about', () => {
    const b = new Board()
    const seen: string[][] = []
    b.objects.observeDeep((evs) => seen.push(b.touched(evs)))
    b.add(obj('a'))
    b.patch({ a: { x: 1 } })
    b.remove(['a'])
    expect(seen).toEqual([['a'], ['a'], ['a']])
  })
})

describe('frames of at most 14000 characters', () => {
  const big = (n: number) => {
    const b = new Board()
    for (let i = 0; i < n; i++) b.add(obj('o' + i, { text: 'some text of note number ' + i, points: Array.from({ length: 60 }, (_, j) => j * 1.5) }))
    return b
  }
  it('a small update is one frame', () => {
    const b = new Board()
    b.add(obj('a'))
    const f = frames(Y.encodeStateAsUpdate(b.doc), 'c')
    expect(f).toHaveLength(1)
    expect(f[0]!.t).toBe('up')
  })
  it('a big state is cut in pieces that each fit, and put together again it is the state', () => {
    const b = big(300)
    const u = Y.encodeStateAsUpdate(b.doc)
    expect(u.length).toBeGreaterThan(100_000)
    const f = frames(u, 'c', 'g1')
    expect(f.length).toBeGreaterThan(5)
    const re = new Reassembler()
    let whole: Uint8Array | null = null
    for (const m of [...f].reverse()) {
      expect(m.t).toBe('part')
      if (m.t !== 'part') continue
      expect(m.d.length).toBeLessThanOrEqual(MAX_FRAME_B64)
      expect(JSON.stringify(m).length).toBeLessThan(16 * 1024)
      whole = re.add('p', m) ?? whole
    }
    expect(whole).not.toBeNull()
    const d = new Y.Doc()
    Y.applyUpdate(d, whole!)
    expect(d.getMap('objects').size).toBe(300)
  })
  it('the reassembler ignores nonsense and forgets groups that never complete', () => {
    let t = 0
    const re = new Reassembler(() => t, 1000, 10)
    const piece = (g: string, i: number, n: number) => ({ g, i, n, d: toB64(Uint8Array.from([i])) })
    expect(re.add('p', piece('a', 5, 2))).toBeNull()
    expect(re.add('p', piece('a', 0, 99))).toBeNull()
    expect(re.add('p', { g: 'a', i: 0, n: 2, d: 5 as unknown as string })).toBeNull()
    expect(re.add('p', piece('a', 0, 2))).toBeNull()
    t = 5000
    expect(re.add('p', piece('a', 1, 2))).toBeNull()
    expect(re.add('p', piece('a', 0, 2))).toEqual(Uint8Array.from([0, 1]))
    expect(re.add('q', piece('a', 0, 1))).toEqual(Uint8Array.from([0]))
  })
})

// ------------------------------------------------------------------------------------------------------------ the channel

/** A channel as the kernel relays it: a message goes to everyone (also the sender) or to one person; 16 KB at most; readers cannot send. */
class Hub {
  members: { ch: Chan; person: ChannelPerson; write: boolean }[] = []
  frames: Wire[] = []
  join(user: string, write: boolean, state: Record<string, unknown>) {
    const ch = new Chan(this, user)
    const person = { id: user, name: user, state }
    this.members.push({ ch, person, write })
    ch.person = person
    queueMicrotask(() => this.presence())
    return ch
  }
  presence() {
    const list = this.members.map((m) => m.person)
    for (const m of this.members) m.ch.pres.forEach((f) => f(list))
  }
}
class Chan implements ChannelLike {
  msg = new Set<(m: { from: ChannelPerson; data: unknown }) => void>()
  pres = new Set<(p: ChannelPerson[]) => void>()
  stat = new Set<(s: string) => void>()
  person!: ChannelPerson
  closed = false
  constructor(
    private hub: Hub,
    private user: string,
  ) {}
  async send(data: unknown, opts?: { to?: string }) {
    const me = this.hub.members.find((m) => m.ch === this)!
    if (!me.write) throw Object.assign(new Error('forbidden'), { code: 'rt_forbidden' })
    const text = JSON.stringify(data)
    if (text.length > 16 * 1024) throw Object.assign(new Error('too large'), { code: 'rt_too_large' })
    this.hub.frames.push(data as Wire)
    for (const m of this.hub.members) {
      if (opts?.to && m.person.id !== opts.to) continue
      queueMicrotask(() => m.ch.msg.forEach((f) => f({ from: { id: this.user, name: this.user }, data: JSON.parse(text) })))
    }
  }
  async setState(state: unknown) {
    this.person.state = state
    this.hub.presence()
  }
  onMessage(f: (m: { from: ChannelPerson; data: unknown }) => void) {
    this.msg.add(f)
    return () => void this.msg.delete(f)
  }
  onPresence(f: (p: ChannelPerson[]) => void) {
    this.pres.add(f)
    return () => void this.pres.delete(f)
  }
  onStatus(f: (s: string) => void) {
    this.stat.add(f)
    return () => void this.stat.delete(f)
  }
  close() {
    this.closed = true
    this.hub.members = this.hub.members.filter((m) => m.ch !== this)
    this.hub.presence()
  }
}

function client(hub: Hub, user: string, write: boolean, snapshot = '', opts: { onCursors?: (c: Cursor[]) => void; onWriterLeft?: () => void } = {}) {
  const board = new Board()
  applySnapshot(board.doc, snapshot)
  const cid = 'tab-' + user
  const ch = hub.join(user, write, presenceState(cid, write))
  const live = new Live(board, ch, { cid, me: user, canWrite: write, gap: 0, ...opts })
  return { board, live, ch }
}

describe('live between people', () => {
  it('an object drawn by one appears for the other, and so does its change and its removal', async () => {
    const hub = new Hub()
    const a = client(hub, 'ann', true)
    const b = client(hub, 'bob', true)
    await tick()
    a.board.add(obj('n1', { text: 'idea' }))
    await until(() => {
      expect(b.board.get('n1')?.text).toBe('idea')
    })
    b.board.patch({ n1: { x: 99 } })
    await until(() => {
      expect(a.board.get('n1')?.x).toBe(99)
    })
    a.board.remove(['n1'])
    await until(() => {
      expect(b.board.get('n1')).toBeUndefined()
    })
  })

  it('undo of one person reaches the others', async () => {
    const hub = new Hub()
    const a = client(hub, 'ann', true)
    const b = client(hub, 'bob', true)
    await tick()
    a.board.add(obj('n1'))
    await until(() => {
      expect(b.board.size).toBe(1)
    })
    a.board.undo.undo()
    await until(() => {
      expect(b.board.size).toBe(0)
    })
  })

  it('a newcomer gets what is not saved yet, in pieces that all fit, however big the board', async () => {
    const hub = new Hub()
    const a = client(hub, 'ann', true)
    await tick()
    for (let i = 0; i < 250; i++) a.board.add(obj('o' + i, { text: 'note ' + i, points: Array.from({ length: 80 }, (_, j) => j * 1.25) }))
    const b = client(hub, 'bob', true)
    await until(() => {
      expect(b.board.size).toBe(250)
      expect(hub.frames.length).toBeGreaterThan(3)
    })
    for (const f of hub.frames) {
      if (f.t === 'part') expect(f.d.length).toBeLessThanOrEqual(MAX_FRAME_B64)
      if (f.t === 'up') expect(f.u.length).toBeLessThanOrEqual(MAX_FRAME_B64)
    }
  })

  it('a newcomer with the saved snapshot only gets what it lacks', async () => {
    const hub = new Hub()
    const a = client(hub, 'ann', true)
    await tick()
    a.board.add(obj('saved'))
    const snap = encodeSnapshot(a.board.doc)
    a.board.add(obj('later'))
    const b = client(hub, 'bob', true, snap)
    await until(() => {
      expect(b.board.size).toBe(2)
      expect(a.board.size).toBe(2)
    })
  })

  it('two people who both start from the same snapshot do not double the objects', async () => {
    const hub = new Hub()
    const seed = new Board()
    seed.add(obj('x'))
    const snap = encodeSnapshot(seed.doc)
    const a = client(hub, 'ann', true, snap)
    const b = client(hub, 'bob', true, snap)
    await until(() => {
      expect(a.board.size).toBe(1)
      expect(b.board.size).toBe(1)
    })
  })

  it('a reader sees everything live and gets the unsaved state when they arrive, but never sends and is never believed', async () => {
    const hub = new Hub()
    const a = client(hub, 'ann', true)
    await tick()
    a.board.add(obj('before'))
    const r = client(hub, 'rita', false)
    await until(() => {
      expect(r.board.get('before')).toBeDefined()
    })
    a.board.add(obj('after'))
    await until(() => {
      expect(r.board.get('after')).toBeDefined()
    })
    // a reader that tries (a hacked client) sends nothing: the live part does not even try
    r.board.doc.transact(() => r.board.objects.set('sneaky', new Y.Map()), 'local')
    r.live.flush()
    // a later change of the writer reaches the reader after it: by then anything the reader had sent would have gone out
    a.board.add(obj('marker'))
    await until(() => {
      expect(r.board.get('marker')).toBeDefined()
    })
    expect(hub.frames.some((f) => f.c === 'tab-rita')).toBe(false)
    expect(a.board.get('sneaky')).toBeUndefined()
    // and what claims to come from a reader is not believed by a writer
    const forged = Y.encodeStateAsUpdate(r.board.doc)
    for (const m of hub.members) if (m.person.id === 'ann') m.ch.msg.forEach((f) => f({ from: { id: 'rita', name: 'rita' }, data: { t: 'up', u: toB64(forged), c: 'tab-rita' } }))
    expect(a.board.get('sneaky')).toBeUndefined()
  })

  it('shows the pointer of the others, not the own tab, and tells when a writer leaves', async () => {
    const hub = new Hub()
    let seen: { name: string; x: number; y: number }[] = []
    let left = 0
    const a = client(hub, 'ann', true, '', { onCursors: (c) => (seen = c), onWriterLeft: () => left++ })
    const b = client(hub, 'bob', true)
    await tick()
    b.live.pointer({ x: 120.4, y: 80 })
    await until(() => {
      expect(seen).toEqual([expect.objectContaining({ name: 'bob', x: 120, y: 80 })])
    })
    a.live.pointer({ x: 1, y: 1 })
    await until(() => {
      expect(seen.find((c) => c.name === 'ann')).toBeUndefined()
    })
    b.live.stop()
    await until(() => {
      expect(left).toBe(1)
    })
  })

  it('pointer updates are at most 10 per second', async () => {
    const hub = new Hub()
    const a = client(hub, 'ann', true)
    await tick()
    let sets = 0
    const real = a.ch.setState.bind(a.ch)
    a.ch.setState = async (s) => {
      sets++
      return real(s)
    }
    for (let i = 0; i < 200; i++) a.live.pointer({ x: i, y: i })
    // 200 calls in a row: the first goes out at once and the last one after the interval, nothing in between
    await until(() => {
      expect(sets).toBe(2)
    })
    await tick(250)
    expect(sets).toBe(2)
  })

  it('what is still to send goes out before the channel closes', async () => {
    const hub = new Hub()
    const a = client(hub, 'ann', true)
    const b = client(hub, 'bob', true)
    await tick()
    a.board.add(obj('last'))
    a.live.stop()
    await until(() => {
      expect(b.board.get('last')).toBeDefined()
      expect(a.ch.closed).toBe(true)
    })
  })

  it('many quick changes (a drag) are merged into few messages', async () => {
    const hub = new Hub()
    const a = client(hub, 'ann', true)
    const b = client(hub, 'bob', true)
    await tick()
    a.board.add(obj('d'))
    await until(() => {
      expect(b.board.get('d')).toBeDefined()
    })
    hub.frames.length = 0
    for (let i = 0; i < 100; i++) a.board.patch({ d: { x: i } })
    await until(() => {
      expect(b.board.get('d')?.x).toBe(99)
    })
    expect(hub.frames.filter((f) => f.t === 'up').length).toBeLessThanOrEqual(3)
  })
})

describe('the wire', () => {
  it('base64 round-trips bytes', () => {
    const bytes = Uint8Array.from({ length: 70000 }, (_, i) => i % 251)
    expect(fromB64(toB64(bytes))).toEqual(bytes)
  })
})
