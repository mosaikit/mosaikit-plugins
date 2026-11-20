// @vitest-environment happy-dom
// The chats driven like a person would: the list, opening a chat, writing, formatting, mentions, reactions, a call. The host is faked.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountChats } from './chats.ts'

const ME = '00000000-0000-0000-0000-000000000001'
const ANN = '00000000-0000-0000-0000-0000000000a1'
const BOB = '00000000-0000-0000-0000-0000000000b2'
const C1 = '0b8e6f5a-1c2d-4e3f-8a9b-0c1d2e3f4a5b'
const C2 = '1b8e6f5a-1c2d-4e3f-8a9b-0c1d2e3f4a5b'
const C3 = '2b8e6f5a-1c2d-4e3f-8a9b-0c1d2e3f4a5b'

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
const chat = (id: string, extra: Record<string, unknown>) => ({
  id, name: '', kind: 'direct', created_by: ME, last_at: ago(5), last_preview: 'hi', last_author: ANN, last_kind: 'message', unread: 0, mentions: 0, marked_unread: false,
  pinned_at: null, muted: false, hidden: false, last_read_at: ago(60), history_from: null,
  members: [{ id: ME, name: 'Me Myself', last_read_at: null }, { id: ANN, name: 'Ann Rossi', last_read_at: ago(1) }], ...extra,
})
const message = (id: string, author: string, text: string, min: number, extra: Record<string, unknown> = {}) => ({
  id, chat: C1, at: ago(min), kind: 'message', text, author, reply_to: '', edited: false, deleted: false, importance: 'normal', mentions: [], attachments: [], meta: {}, pinned: false, pinned_by: '', reactions: {}, ...extra,
})

function fakeMsk() {
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const sent: unknown[] = []
  let overview = [
    chat(C1, { unread: 2, last_preview: 'Lunch?' }),
    chat(C2, { name: 'Team', kind: 'group', pinned_at: ago(1000), last_author: BOB, last_preview: 'Ship it', members: [{ id: ME, name: 'Me Myself', last_read_at: null }, { id: ANN, name: 'Ann Rossi', last_read_at: null }, { id: BOB, name: 'Bob Verdi', last_read_at: null }] }),
    chat(C3, { last_kind: 'call', last_preview: '📞', members: [{ id: ME, name: 'Me Myself', last_read_at: null }, { id: BOB, name: 'Bob Verdi', last_read_at: null }] }),
  ]
  const thread = [message('m1', ANN, 'Hello **there**', 30), message('m2', ME, 'Hi Ann', 20), message('m3', ANN, 'Lunch?', 3)]
  const channel = { send: async (d: unknown) => (sent.push(d), { seq: 1 }), setState: async () => undefined, onMessage: () => () => undefined, onPresence: () => () => undefined, onStatus: () => () => undefined, close: () => undefined, people: [], status: 'live' }
  const msk = {
    user: { id: ME, name: 'Me Myself', username: 'me' },
    context: { lang: 'en' },
    at: undefined,
    plugin: { id: 'com.mosaikit.chat', version: '0.4.0' },
    can: () => true,
    loading: <T>(p: Promise<T>) => p,
    onContext: () => () => undefined,
    open: async () => undefined,
    realtime: { open: () => channel },
    t: (s: string) => s,
    directory: { search: async () => [{ id: ANN, username: 'ann', name: 'Ann Rossi' }, { id: BOB, username: 'bob', name: 'Bob Verdi' }] },
    files: { list: async () => ({ entries: [] }) },
    crud: () => ({ update: async () => ({}) }),
    call: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      switch (name) {
        case 'chats.overview':
          return { me: ME, chats: overview }
        case 'chats.messages':
          return { messages: thread, more: false, members: overview[0]!.members }
        case 'chats.send': {
          const m = message('m4', ME, String(args.text), 0, { importance: args.importance })
          thread.push(m)
          return m
        }
        case 'chats.react':
          return message('m3', ANN, 'Lunch?', 3, { reactions: { '👍': [{ id: ME, name: 'Me Myself' }] } })
        case 'chats.call_start':
          return message('call1', ME, '', 0, { kind: 'call', meta: { engine: 'jitsi', room: 'mosaikit-room', audio_only: false, started_at: ago(0) }, call: { live: [{ id: ME, name: 'Me Myself' }], joined: [{ id: ME, name: 'Me Myself' }], last: null } })
        case 'chats.mark_read':
          overview = overview.map((c) => (c.id === args.chat ? { ...c, unread: 0 } : c))
          return { ok: true }
        case 'chats.settings':
          overview = overview.map((c) => (c.id === args.chat ? { ...c, ...(args.muted !== undefined ? { muted: args.muted } : {}) } : c))
          return { ok: true }
        default:
          return {}
      }
    },
  }
  return { msk: msk as never, calls, sent }
}

const until = (f: () => void) => vi.waitFor(f, { timeout: 5000, interval: 10 })
const $ = <T extends Element>(root: ParentNode, sel: string) => root.querySelector(sel) as T
const $$ = (root: ParentNode, sel: string) => Array.from(root.querySelectorAll(sel))

afterEach(() => {
  document.body.replaceChildren()
})

async function start() {
  const host = fakeMsk()
  const app = document.createElement('div')
  document.body.append(app)
  mountChats(host.msk, app)
  await until(() => expect($$(app, '.cl-row').length).toBe(3))
  return { ...host, app }
}

describe('the list of chats', () => {
  it('shows pinned and recent chats, the unread one in bold with its count, the call chat with its sign', async () => {
    const { app } = await start()
    const sections = $$(app, '.cl-section').map((s) => s.textContent)
    expect(sections).toEqual(['Pinned', 'Recent'])
    const rows = $$(app, '.cl-row')
    expect(rows[0]!.textContent).toContain('Team')
    const ann = rows.find((r) => r.textContent?.includes('Ann Rossi'))!
    expect(ann.classList.contains('unread')).toBe(true)
    expect($(ann, '.cl-badge').textContent).toBe('2')
    expect(ann.textContent).toContain('Lunch?')
    const bob = rows.find((r) => r.textContent?.includes('Bob Verdi'))!
    expect(bob.textContent).toContain('📞')
    // the group preview names who wrote
    expect(rows[0]!.textContent).toContain('Bob: Ship it')
  })

  it('filters by Unread and by Meetings, and searches by name', async () => {
    const { app } = await start()
    const filter = (name: string) => $$(app, '.cl-filter').find((b) => b.textContent === name) as HTMLButtonElement
    filter('Unread').click()
    await until(() => expect($$(app, '.cl-row').length).toBe(1))
    filter('Meetings').click()
    await until(() => expect($$(app, '.cl-row')[0]!.textContent).toContain('Bob Verdi'))
    filter('All').click()
    const search = $<HTMLInputElement>(app, '.cl-search')
    search.value = 'team'
    search.dispatchEvent(new Event('input'))
    await until(() => expect($$(app, '.cl-row').length).toBe(1))
    search.value = 'zzz'
    search.dispatchEvent(new Event('input'))
    await until(() => expect($(app, '[data-testid="empty-filtered"]')).toBeTruthy())
  })

  it('mutes a chat from its menu', async () => {
    const { app, calls } = await start()
    const row = $$(app, '.cl-item').find((r) => r.textContent?.includes('Ann Rossi'))!
    ;($(row, '.cl-more') as HTMLButtonElement).click()
    ;($$(document.body, '.msk-menuitem').find((b) => b.textContent === 'Mute') as HTMLButtonElement).click()
    await until(() => expect(calls.find((c) => c.name === 'chats.settings')?.args).toEqual({ chat: C1, muted: true }))
  })
})

describe('a conversation', () => {
  const openAnn = async () => {
    const t = await start()
    ;($$(t.app, '.cl-row').find((r) => r.textContent?.includes('Ann Rossi')) as HTMLButtonElement).click()
    await until(() => expect($$(t.app, '.cb').length).toBe(3))
    return t
  }

  it('draws the day, bubbles on both sides, Markdown, the title and marks the chat read', async () => {
    const { app, calls } = await openAnn()
    expect($(app, '.cr-titles h2').textContent).toBe('Ann Rossi')
    expect($$(app, '.cr-day').length).toBe(1)
    const bubbles = $$(app, '.cb')
    expect(bubbles.map((b) => (b.classList.contains('own') ? 'own' : 'other'))).toEqual(['other', 'own', 'other'])
    expect($(bubbles[0]!, '.cb-bubble strong').textContent).toBe('there')
    // the first of two messages of the same person has the name; the divider marks what is new
    expect($(bubbles[0]!, '.cb-meta strong').textContent).toBe('Ann Rossi')
    expect($(app, '.cr-new')).toBeTruthy()
    await until(() => expect(calls.some((c) => c.name === 'chats.mark_read' && c.args.chat === C1)).toBe(true))
    // «seen» under the last message of the caller (Ann read it a minute ago)
    expect($(bubbles[1]!, '.cb-seen').textContent).toContain('Seen')
  })

  it('sends with Enter, keeps Shift+Enter for a new line, and shows the message at once', async () => {
    const { app, calls, sent } = await openAnn()
    const box = $<HTMLTextAreaElement>(app, '.cc-input')
    box.value = 'see you at 1'
    box.dispatchEvent(new Event('input'))
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }))
    expect(calls.some((c) => c.name === 'chats.send')).toBe(false)
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await until(() => expect($$(app, '.cb').length).toBe(4))
    expect(calls.find((c) => c.name === 'chats.send')?.args).toMatchObject({ chat: C1, text: 'see you at 1', importance: 'normal', attachments: [] })
    expect(box.value).toBe('')
    // the others hear about it on the live channel
    await until(() => expect(sent).toContainEqual({ t: 'msg', id: 'm4' }))
  })

  it('formats with the toolbar, and sends the importance chosen', async () => {
    const { app, calls } = await openAnn()
    const box = $<HTMLTextAreaElement>(app, '.cc-input')
    ;($$(app, '.cc-tool').find((b) => b.getAttribute('aria-label') === 'Format') as HTMLButtonElement).click()
    expect($(app, '.cc-fmt').hasAttribute('hidden')).toBe(false)
    box.value = 'big news'
    box.setSelectionRange(4, 8)
    ;($(app, '.cc-fmtbtn[data-key="bold"]') as HTMLButtonElement).click()
    expect(box.value).toBe('big **news**')
    ;($(app, '.cc-fmtbtn[data-key="underline"]') as HTMLButtonElement).click()
    expect(box.value).toBe('big **++news++**')
    ;($(app, '.cc-tool[data-importance]') as HTMLButtonElement).click()
    ;($$(document.body, '.msk-menuitem').find((b) => b.textContent?.includes('Urgent')) as HTMLButtonElement).click()
    ;($(app, '.cc-send') as HTMLButtonElement).click()
    await until(() => expect(calls.find((c) => c.name === 'chats.send')?.args).toMatchObject({ text: 'big **++news++**', importance: 'urgent' }))
    await until(() => expect($$(app, '.cb.own').length).toBe(2))
    // the message draws the underline and the urgent mark
    const last = $$(app, '.cb.own').pop()!
    expect($(last, 'u')).toBeTruthy()
    expect($(last, '.cb-imp').textContent).toContain('Urgent')
  })

  it('suggests people while typing @ and inserts the name chosen', async () => {
    const { app } = await openAnn()
    const box = $<HTMLTextAreaElement>(app, '.cc-input')
    box.value = 'hi @an'
    box.setSelectionRange(6, 6)
    box.dispatchEvent(new Event('input'))
    await until(() => expect($$(app, '.cc-mention').length).toBe(1))
    ;($(app, '.cc-mention') as HTMLButtonElement).click()
    expect(box.value).toBe('hi @Ann Rossi ')
  })

  it('reacts with the quick bar and the pill shows who reacted', async () => {
    const { app, calls } = await openAnn()
    const third = $$(app, '.cb')[2]!
    ;($(third, '.cb-act[aria-label^="React 👍"]') as HTMLButtonElement).click()
    await until(() => expect(calls.find((c) => c.name === 'chats.react')?.args).toEqual({ id: 'm3', emoji: '👍' }))
    await until(() => expect($(app, '.cb-react')).toBeTruthy())
    expect($(app, '.cb-react').getAttribute('title')).toContain('You reacted with 👍')
  })

  it('starts a call: the card shows in the chat and the call opens with the engine in a frame', async () => {
    // the fake DOM does not load pages: it says so on the console
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { app, calls } = await openAnn()
    ;($(app, '.cr-act[aria-label="Video call"]') as HTMLButtonElement).click()
    await until(() => expect(calls.find((c) => c.name === 'chats.call_start')?.args).toEqual({ chat: C1, audio_only: false }))
    await until(() => expect($(document, 'iframe.ccall-frame')).toBeTruthy())
    const src = $<HTMLIFrameElement>(document, 'iframe.ccall-frame').src
    expect(src).toContain('https://meet.jit.si/mosaikit-room#')
    expect(src).not.toContain('startAudioOnly')
    expect(calls.some((c) => c.name === 'chats.call_join')).toBe(true)
    expect($(app, '.cm-call.live')).toBeTruthy()
    ;($(document, '.ccall .msk-btn.danger') as HTMLButtonElement).click()
    await until(() => expect(calls.some((c) => c.name === 'chats.call_leave')).toBe(true))
    expect($(document, 'iframe.ccall-frame')).toBeNull()
  })
})
