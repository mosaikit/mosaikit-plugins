// The live document of a board. Every object is a `Y.Map` of its own inside the map `objects`, and every property is an entry of
// that map: two people who change the same object at once both keep their change unless they changed the same property (then the
// last one wins, the same everywhere). The updates travel on the real-time channel `doc` of the item, which the kernel only relays,
// and the writers save the whole state in the item (`snapshot`) as base64.
//
// What keeps it simple and safe:
// - every client starts from the saved snapshot (applying it is idempotent: the same operations are never added twice), then asks
//   the writers who are there for what it lacks (`sv`, the state vector, answered with `up`);
// - a frame is at most 16 KB: an update that does not fit is cut in raw pieces (`part`) that the receiver puts together again;
// - only a writer sends (the kernel refuses a reader anyway); what arrives from a person that says they are a reader is ignored;
// - a reader cannot ask: a writer who sees a reader arrive sends them the whole state.
import * as Y from 'yjs'
import { acceptsFrom, personColor, throttle, type Obj, type ObjType } from './logic.ts'

// ------------------------------------------------------------------------------------------------------------------ bytes

export const toB64 = (u: Uint8Array): string => {
  let s = ''
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s)
}
export const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

/** The most characters of base64 in one frame (the frame limit is 16 KB with the rest of the message around it). */
export const MAX_FRAME_B64 = 14000
/** Raw bytes in one piece: base64 grows them by a third, so a piece is 12000 characters. */
export const PIECE_BYTES = 9000
/** The most characters of base64 in a snapshot (the same limit as the hook of the plugin). */
export const MAX_SNAPSHOT = 400_000

// ------------------------------------------------------------------------------------------------------------------ the messages

export type Wire =
  | { t: 'sv'; v: string; c: string }
  | { t: 'up'; u: string; c: string }
  | { t: 'part'; g: string; i: number; n: number; d: string; c: string }

/** An update as the messages to send: one `up` when it fits a frame, else the `part`s of it. */
export function frames(update: Uint8Array, cid: string, group: string = crypto.randomUUID().slice(0, 8)): Wire[] {
  const b = toB64(update)
  if (b.length <= MAX_FRAME_B64) return [{ t: 'up', u: b, c: cid }]
  const n = Math.ceil(update.length / PIECE_BYTES)
  const out: Wire[] = []
  for (let i = 0; i < n; i++) out.push({ t: 'part', g: group, i, n, d: toB64(update.subarray(i * PIECE_BYTES, (i + 1) * PIECE_BYTES)), c: cid })
  return out
}

/** Puts the pieces of an update together again. A group that does not complete in `ttl` ms is forgotten. */
export class Reassembler {
  private groups = new Map<string, { n: number; parts: Map<number, Uint8Array>; at: number }>()
  constructor(
    private now: () => number = Date.now,
    private ttl = 20_000,
    private maxPieces = 400,
  ) {}
  /** Takes a piece; returns the whole update when it is the last one that was missing. */
  add(from: string, m: { g: string; i: number; n: number; d: string }): Uint8Array | null {
    if (!Number.isInteger(m.i) || !Number.isInteger(m.n) || m.n < 1 || m.n > this.maxPieces || m.i < 0 || m.i >= m.n || typeof m.d !== 'string') return null
    const t = this.now()
    for (const [k, g] of this.groups) if (t - g.at > this.ttl) this.groups.delete(k)
    const key = from + ':' + m.g
    let g = this.groups.get(key)
    if (!g || g.n !== m.n) {
      g = { n: m.n, parts: new Map(), at: t }
      this.groups.set(key, g)
    }
    g.parts.set(m.i, fromB64(m.d))
    if (g.parts.size < g.n) return null
    this.groups.delete(key)
    let len = 0
    for (let i = 0; i < g.n; i++) len += g.parts.get(i)!.length
    const out = new Uint8Array(len)
    let at = 0
    for (let i = 0; i < g.n; i++) {
      const p = g.parts.get(i)!
      out.set(p, at)
      at += p.length
    }
    return out
  }
}

// ------------------------------------------------------------------------------------------------------------------ the board

/** The objects of a board and what can be done with them; `origin` of the changes made here is `'local'` (what undo tracks). */
export class Board {
  readonly doc: Y.Doc
  readonly objects: Y.Map<Y.Map<unknown>>
  readonly meta: Y.Map<unknown>
  readonly undo: Y.UndoManager

  constructor(doc: Y.Doc = new Y.Doc()) {
    this.doc = doc
    this.objects = doc.getMap('objects')
    this.meta = doc.getMap('meta')
    this.undo = new Y.UndoManager(this.objects, { trackedOrigins: new Set(['local']), captureTimeout: 500 })
  }

  get(id: string): Obj | undefined {
    const m = this.objects.get(id)
    return m ? read(m) : undefined
  }

  all(): Obj[] {
    const out: Obj[] = []
    this.objects.forEach((m) => out.push(read(m)))
    return out
  }

  get size(): number {
    return this.objects.size
  }

  add(o: Obj): void {
    this.doc.transact(() => {
      const m = new Y.Map<unknown>()
      for (const [k, v] of Object.entries(o)) m.set(k, v)
      this.objects.set(o.id, m)
    }, 'local')
  }

  /** Changes some properties of objects: only the ones named, so a change of someone else to another property stays. */
  patch(changes: Record<string, Partial<Obj>>): void {
    this.doc.transact(() => {
      for (const [id, p] of Object.entries(changes)) {
        const m = this.objects.get(id)
        if (!m) continue
        for (const [k, v] of Object.entries(p)) if (v !== undefined && !same(m.get(k), v)) m.set(k, v)
      }
    }, 'local')
  }

  remove(ids: string[]): void {
    this.doc.transact(() => {
      for (const id of ids) this.objects.delete(id)
    }, 'local')
  }

  get bg(): string | undefined {
    const v = this.meta.get('bg')
    return typeof v === 'string' ? v : undefined
  }
  setBg(bg: string): void {
    this.doc.transact(() => this.meta.set('bg', bg), 'local-meta')
  }

  /** The id of the object an event of `objects.observeDeep` is about (a change to a property, or one added or removed). */
  touched(events: Y.YEvent<Y.AbstractType<unknown>>[]): string[] {
    const ids = new Set<string>()
    for (const ev of events) {
      if (ev.target === this.objects) for (const k of (ev as Y.YMapEvent<unknown>).keysChanged) ids.add(k)
      else if (typeof ev.path[0] === 'string') ids.add(ev.path[0])
    }
    return [...ids]
  }

  destroy(): void {
    this.undo.destroy()
    this.doc.destroy()
  }
}

const same = (a: unknown, b: unknown) => (Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((x, i) => x === b[i]) : a === b)

/** An object from its map; a missing or wrong property gets a safe value (a person's client may be newer or older). */
export function read(m: Y.Map<unknown>): Obj {
  const g = (k: string) => m.get(k)
  const num = (k: string, d = 0) => (typeof g(k) === 'number' && Number.isFinite(g(k) as number) ? (g(k) as number) : d)
  const str = (k: string) => (typeof g(k) === 'string' ? (g(k) as string) : '')
  const pts = g('points')
  const type = str('type') as ObjType
  return {
    id: str('id'),
    type: ['note', 'rect', 'ellipse', 'text', 'arrow', 'pen'].includes(type) ? type : 'rect',
    x: num('x'),
    y: num('y'),
    w: num('w'),
    h: num('h'),
    text: str('text'),
    color: str('color') || 'yellow',
    points: Array.isArray(pts) ? pts.filter((n): n is number => typeof n === 'number') : [],
    z: num('z'),
    author: str('author'),
  }
}

// ------------------------------------------------------------------------------------------------------------------ snapshot

/** The whole state of a board as base64. */
export const encodeSnapshot = (doc: Y.Doc): string => toB64(Y.encodeStateAsUpdate(doc))

/** Puts a saved snapshot into the document (merging: what the document already has stays). False when it is not a snapshot. */
export function applySnapshot(doc: Y.Doc, b64: string, origin: unknown = 'seed'): boolean {
  if (!b64) return true
  try {
    Y.applyUpdate(doc, fromB64(b64), origin)
    return true
  } catch {
    return false
  }
}

/** Does the snapshot fit in the item? */
export const fitsSnapshot = (b64: string): boolean => b64.length <= MAX_SNAPSHOT

// ------------------------------------------------------------------------------------------------------------------ live

export interface ChannelPerson {
  id: string
  name: string
  state?: unknown
}
export interface ChannelLike {
  send(data: unknown, opts?: { to?: string }): Promise<unknown>
  setState(state: unknown): Promise<void>
  onMessage(fn: (m: { from: ChannelPerson; data: unknown }) => void): () => void
  onPresence(fn: (people: ChannelPerson[]) => void): () => void
  onStatus(fn: (s: string) => void): () => void
  close(): void
}

export interface Cursor {
  id: string
  name: string
  x: number
  y: number
  color: string
}

export interface LiveOptions {
  /** an id of this tab (two tabs of a person are two clients) */
  cid: string
  /** the user id of this person */
  me: string
  canWrite: boolean
  /** pointers of the others changed */
  onCursors?: (c: Cursor[]) => void
  /** the people there changed (the others, with the tabs of this person too) */
  onPeople?: (p: ChannelPerson[]) => void
  /** a writer left: whoever stays should save what they have */
  onWriterLeft?: () => void
  /** after a break in the connection a reader reads the saved board again */
  onReconnect?: () => void
  /** sends of a piece at least this many ms apart (the channel allows 30 messages per second in all) */
  gap?: number
  now?: () => number
}

/** What the others see of a tab: who it is (`c`), whether it can write (`w`) and where its pointer is. Also the state to open the channel with. */
export function presenceState(cid: string, canWrite: boolean, p: { x: number; y: number } | null = null): Record<string, unknown> {
  const s: Record<string, unknown> = { c: cid, w: canWrite ? 1 : 0 }
  if (p) {
    s.x = Math.round(p.x)
    s.y = Math.round(p.y)
  }
  return s
}

/** The live part of an open board: sends what this person does, applies what the others do, shows who is there. */
export class Live {
  private queue: { m: Wire; to?: string; tries: number }[] = []
  private draining = false
  private buffer: Uint8Array[] = []
  private flushTimer: ReturnType<typeof setTimeout> | undefined
  private people: ChannelPerson[] = []
  private greeted = new Set<string>()
  private asked = false
  private was = false
  private closing = false
  private readonly re = new Reassembler()
  private readonly offs: (() => void)[] = []
  private readonly cursor: (p: { x: number; y: number } | null) => void
  readonly sent: Wire[] = []

  constructor(
    private board: Board,
    private ch: ChannelLike,
    private o: LiveOptions,
  ) {
    const doc = board.doc
    const onUpdate = (u: Uint8Array, origin: unknown) => {
      // undo and redo are changes of this person too (their origin is the undo manager)
      if (origin !== 'local' && origin !== 'local-meta' && origin !== board.undo) return
      if (!o.canWrite) return
      this.buffer.push(u)
      this.flushTimer ??= setTimeout(() => this.flush(), 80)
    }
    doc.on('update', onUpdate)
    this.offs.push(() => doc.off('update', onUpdate))
    this.offs.push(ch.onPresence((list) => this.presence(list)))
    this.offs.push(ch.onMessage((m) => this.message(m)))
    this.offs.push(
      ch.onStatus((s) => {
        if (s !== 'live') return
        if (this.was) {
          // after a break: a writer asks again for what it missed, a reader reads the saved board again
          if (o.canWrite) this.ask()
          else o.onReconnect?.()
        }
        this.was = true
      }),
    )
    this.cursor = throttle((p) => void this.ch.setState(this.stateOf(p)).catch(() => undefined), 100, o.now ?? Date.now)
  }

  private stateOf(p: { x: number; y: number } | null): Record<string, unknown> {
    return presenceState(this.o.cid, this.o.canWrite, p)
  }

  /** The pointer of this person is at a point of the board (null: it left the canvas). */
  pointer(p: { x: number; y: number } | null): void {
    if (!this.closing) this.cursor(p)
  }

  // ---- sending
  private enqueue(m: Wire, to?: string) {
    this.queue.push({ m, to, tries: 0 })
    if (!this.draining) void this.drain()
  }
  private async drain() {
    this.draining = true
    const gap = this.o.gap ?? 70
    while (this.queue.length) {
      const it = this.queue.shift()!
      this.sent.push(it.m)
      try {
        await this.ch.send(it.m, it.to ? { to: it.to } : undefined)
      } catch (e) {
        // a message refused for the rate is sent again a little later; any other refusal is dropped (the next `sv` heals it)
        if ((e as { code?: string })?.code === 'rt_rate' && it.tries < 4) {
          it.tries++
          this.queue.unshift(it)
          await new Promise((r) => setTimeout(r, 400))
          continue
        }
      }
      if (this.queue.length) await new Promise((r) => setTimeout(r, gap))
    }
    this.draining = false
    if (this.closing) this.ch.close()
  }
  /** Sends what changed since the last flush as one update (merged: a drag is many changes, a few messages). */
  flush(): void {
    clearTimeout(this.flushTimer)
    this.flushTimer = undefined
    if (!this.buffer.length) return
    const u = this.buffer.length === 1 ? this.buffer[0]! : Y.mergeUpdates(this.buffer)
    this.buffer = []
    for (const m of frames(u, this.o.cid)) this.enqueue(m)
  }
  private ask() {
    this.enqueue({ t: 'sv', v: toB64(Y.encodeStateVector(this.board.doc)), c: this.o.cid })
  }
  private sendState(to: string, since?: Uint8Array) {
    for (const m of frames(Y.encodeStateAsUpdate(this.board.doc, since), this.o.cid)) this.enqueue(m, to)
  }

  // ---- presence
  private presence(list: ChannelPerson[]) {
    const before = this.people
    this.people = list
    const writers = (l: ChannelPerson[]) => l.filter((p) => acceptsFrom(p.state))
    if (this.o.canWrite) {
      if (!this.asked) {
        this.asked = true
        this.ask()
      }
      // the writer with the smallest id greets the readers that arrive (a reader cannot ask): the whole state, to them
      const mine = writers(list).map((p) => p.id).sort()[0]
      for (const p of list) {
        if (acceptsFrom(p.state) || this.greeted.has(p.id)) continue
        this.greeted.add(p.id)
        if (mine === this.o.me) this.sendState(p.id)
      }
      for (const p of before) if (!list.some((q) => q.id === p.id) && acceptsFrom(p.state) && p.id !== this.o.me) this.o.onWriterLeft?.()
    }
    for (const id of this.greeted) if (!list.some((p) => p.id === id)) this.greeted.delete(id)
    this.o.onPeople?.(list)
    this.o.onCursors?.(this.cursors(list))
  }
  private cursors(list: ChannelPerson[]): Cursor[] {
    const out: Cursor[] = []
    for (const p of list) {
      const s = p.state as { c?: unknown; x?: unknown; y?: unknown } | undefined
      if (!s || typeof s !== 'object' || s.c === this.o.cid || typeof s.x !== 'number' || typeof s.y !== 'number') continue
      out.push({ id: p.id + ':' + String(s.c ?? ''), name: p.name, x: s.x, y: s.y, color: personColor(p.id).stroke })
    }
    return out
  }

  // ---- receiving
  private message(m: { from: ChannelPerson; data: unknown }) {
    const d = m.data as Wire | null
    if (!d || typeof d !== 'object' || d.c === this.o.cid) return
    // a person that is not a writer cannot have made a change
    const sender = this.people.find((p) => p.id === m.from.id) ?? m.from
    try {
      if (d.t === 'up' && typeof d.u === 'string') {
        if (acceptsFrom(sender.state)) Y.applyUpdate(this.board.doc, fromB64(d.u), 'remote')
      } else if (d.t === 'part') {
        const whole = this.re.add(m.from.id + ':' + d.c, d)
        if (whole && acceptsFrom(sender.state)) Y.applyUpdate(this.board.doc, whole, 'remote')
      } else if (d.t === 'sv' && typeof d.v === 'string' && this.o.canWrite) {
        this.sendState(m.from.id, fromB64(d.v))
      }
    } catch {
      /* a frame that is not an update of the document is dropped */
    }
  }

  /** Stops listening; what is still to be sent goes out first, then the channel closes. */
  stop(): void {
    if (this.closing) return
    this.flush()
    this.closing = true
    for (const off of this.offs) off()
    if (!this.draining && !this.queue.length) this.ch.close()
  }
}
