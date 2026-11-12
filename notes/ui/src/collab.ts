// Live co-editing of the text of a note (phase 8 of docs/plugins-plan.md). The text is a Yjs document (a CRDT: every client may
// edit at any time, offline too, and all end up with the same text); the updates travel on the real-time channel `doc` of the
// note, which the kernel only relays. The plugin saves the text as before, with the form: the channel is how people see each other
// type, not where the note is kept.
//
// Rules that keep the clients from duplicating the text: whoever finds nobody to ask seeds the document from the saved text with a
// fixed client id (so two seeds of the same text are the same operations and do not add up); everyone else starts empty and asks the
// people there for the document (`sv`, the state vector), who answer with what it lacks (`up`). A client is a tab (`cid`), not a person:
// two tabs of the same person edit together too.
import * as Y from 'yjs'
import { avatarStack, el, type Msk, type RealtimeChannel, type RealtimePerson } from '@mosaikit/plugin-api'

/** A text longer than this is not edited together: an update must fit in a frame of the channel (16 KB, as base64). */
export const MAX_TOGETHER = 8000
const MAX_FRAME_B64 = 14000
const SEED_CLIENT = 1

/** What changed between two texts, as one edit: at `index` remove `remove` characters and put `insert` (nothing: same text). */
export function diffText(a: string, b: string): { index: number; remove: number; insert: string } | null {
  if (a === b) return null
  let start = 0
  const max = Math.min(a.length, b.length)
  while (start < max && a.charCodeAt(start) === b.charCodeAt(start)) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a.charCodeAt(endA - 1) === b.charCodeAt(endB - 1)) {
    endA--
    endB--
  }
  // do not cut a surrogate pair in two
  const isLow = (i: number) => i < a.length && (a.charCodeAt(i) & 0xfc00) === 0xdc00
  if (start > 0 && (isLow(start) || (start < b.length && (b.charCodeAt(start) & 0xfc00) === 0xdc00))) start--
  return { index: start, remove: endA - start, insert: b.slice(start, endB) }
}

/** Where a position of the old text is in the new one, after the edits `delta` of a Yjs text event (retain, insert, delete). */
export function transformIndex(delta: { retain?: number; insert?: string | object; delete?: number }[], index: number): number {
  let pos = 0
  let out = index
  for (const op of delta) {
    if (op.retain) pos += op.retain
    else if (op.insert !== undefined) {
      const n = typeof op.insert === 'string' ? op.insert.length : 1
      // an insert at the cursor pushes it on, except a cursor at the very start of an insert that follows it
      if (pos <= index) out += n
    } else if (op.delete) {
      if (pos < index) out -= Math.min(op.delete, index - pos)
      // the characters that go were before `index`: later ops count against the old text
      pos += op.delete
    }
  }
  return Math.max(0, out)
}

export const toB64 = (u: Uint8Array): string => {
  let s = ''
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s)
}
export const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

/** A document seeded the way every first person seeds it (the same bytes for the same text). */
export function seedUpdate(text: string): Uint8Array {
  const d = new Y.Doc()
  d.clientID = SEED_CLIENT
  d.getText('t').insert(0, text)
  return Y.encodeStateAsUpdate(d)
}

export interface TogetherLabels {
  editingWith: string
  tooLong: string
}

export interface Together {
  stop(): void
}

type Wire = { t: 'sv'; v: string; c: string } | { t: 'up'; u: string; c: string }

/** How long a newcomer waits for an answer before it takes the saved text as the document. */
const WAIT_MS = 1200

/**
 * Edits `ta` together with the people who have the same note open for editing. `resource` is the note.
 * Returns a handle to stop; it stops by itself when the textarea leaves the page.
 */
export function editTogether(msk: Msk, ta: HTMLTextAreaElement, resource: string, labels: TogetherLabels, where: HTMLElement): Together {
  const me = msk.user?.id ?? ''
  const cid = crypto.randomUUID()
  const initial = ta.value
  const bar = el('div', { class: 'ncollab', 'aria-live': 'polite' })
  bar.hidden = true
  where.before(bar)
  if (ta.value.length > MAX_TOGETHER) {
    bar.hidden = false
    bar.textContent = labels.tooLong
    return { stop: () => bar.remove() }
  }

  const doc = new Y.Doc()
  const text = doc.getText('t')
  let ch: RealtimeChannel | null = null
  let synced = false
  let people: RealtimePerson[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const send = (m: { t: 'sv'; v: string } | { t: 'up'; u: string }, to?: string) => void ch?.send({ ...m, c: cid }, to ? { to } : undefined).catch(() => undefined)

  // what the others do reaches the textarea, and the cursor stays where it was in the text
  text.observe((ev) => {
    if (ev.transaction.origin === 'local') return
    const s = ta.selectionStart
    const e = ta.selectionEnd
    ta.value = text.toString()
    if (document.activeElement === ta) ta.setSelectionRange(transformIndex(ev.delta, s), transformIndex(ev.delta, e))
  })
  // what this person does goes to the others
  doc.on('update', (u: Uint8Array, origin: unknown) => {
    if (origin !== 'local') return
    const b = toB64(u)
    if (b.length > MAX_FRAME_B64) {
      bar.hidden = false
      bar.textContent = labels.tooLong
      return
    }
    send({ t: 'up', u: b })
  })
  const onInput = () => {
    // typing before anyone answered: the document is the saved text, and this is the first edit on it
    if (!synced) {
      clearTimeout(timer)
      seed()
    }
    const d = diffText(text.toString(), ta.value)
    if (!d) return
    doc.transact(() => {
      if (d.remove) text.delete(d.index, d.remove)
      if (d.insert) text.insert(d.index, d.insert)
    }, 'local')
  }
  ta.addEventListener('input', onInput)

  const seed = () => {
    if (synced) return
    synced = true
    Y.applyUpdate(doc, seedUpdate(initial), 'seed')
  }
  const drawPeople = () => {
    const others = people.filter((p) => p.id !== me)
    bar.hidden = !others.length
    bar.replaceChildren()
    if (others.length) bar.append(avatarStack(others.map((p) => p.name), 4), el('span', {}, labels.editingWith.replace('{n}', others.map((p) => p.name).join(', '))))
  }

  const channel = msk.realtime.open({ resource, name: 'doc', state: {} })
  ch = channel
  channel.onPresence((list) => {
    const first = people.length === 0 && !synced
    people = list
    drawPeople()
    if (first) {
      // ask whoever is here (another tab of this person too); if nobody answers the text is the saved one
      send({ t: 'sv', v: toB64(Y.encodeStateVector(doc)) })
      timer = setTimeout(seed, WAIT_MS)
    }
  })
  channel.onMessage((m) => {
    const d = m.data as Wire | null
    if (!d || typeof d !== 'object' || d.c === cid) return
    try {
      if (d.t === 'up' && typeof d.u === 'string') {
        // the first answer is the document: from then on this client edits too
        if (!synced) {
          synced = true
          clearTimeout(timer)
        }
        Y.applyUpdate(doc, fromB64(d.u), 'remote')
      } else if (d.t === 'sv' && typeof d.v === 'string' && synced) {
        send({ t: 'up', u: toB64(Y.encodeStateAsUpdate(doc, fromB64(d.v))) }, m.from.id)
      }
    } catch {
      /* a frame that is not an update of the document is dropped */
    }
  })
  // after a break in the connection the missing updates are asked again
  let was = false
  channel.onStatus((s) => {
    if (s === 'live' && was && synced) send({ t: 'sv', v: toB64(Y.encodeStateVector(doc)) })
    if (s === 'live') was = true
  })

  const stop = () => {
    if (stopped) return
    stopped = true
    clearTimeout(timer)
    ta.removeEventListener('input', onInput)
    channel.close()
    bar.remove()
    doc.destroy()
    obs.disconnect()
  }
  // the textarea goes away with the form
  const obs = new MutationObserver(() => {
    if (!ta.isConnected) stop()
  })
  obs.observe(document.body, { childList: true, subtree: true })
  return { stop }
}
