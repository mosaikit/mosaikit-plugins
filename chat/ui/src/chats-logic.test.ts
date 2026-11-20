import { describe, expect, it } from 'vitest'
import {
  applyFormat,
  callState,
  chatTitle,
  duration,
  fileSize,
  insertAt,
  lastOwn,
  linkHost,
  listTime,
  mentionAt,
  mentionChoices,
  mentionPieces,
  parseTime,
  previewLine,
  runs,
  sections,
  seenBy,
  sendsOnEnter,
  totalUnread,
  upsert,
  visibleChats,
  type Chat,
  type ChatMsg,
  type Member,
} from './chats-logic.ts'

const mem = (id: string, name: string, read: string | null = null, left = false): Member => ({ id, name, last_read_at: read, left })
const chat = (id: string, extra: Partial<Chat> = {}): Chat => ({
  id, name: '', kind: 'direct', created_by: 'me', last_at: '2026-11-20T10:00:00Z', last_preview: 'hi', last_author: 'u2', last_kind: 'message',
  unread: 0, mentions: 0, marked_unread: false, pinned_at: null, muted: false, hidden: false, last_read_at: null, history_from: null,
  members: [mem('me', 'Me Myself'), mem('u2', 'Ann Rossi')], ...extra,
})
const msg = (id: string, at: string, extra: Partial<ChatMsg> = {}): ChatMsg => ({
  id, chat: 'c', at, kind: 'message', text: id, author: 'u2', reply_to: '', edited: false, deleted: false, importance: 'normal', mentions: [], attachments: [],
  meta: {}, pinned: false, pinned_by: '', reactions: {}, ...extra,
})

describe('time', () => {
  it('reads the formats of both databases', () => {
    const t = Date.UTC(2026, 10, 20, 10, 30, 0)
    for (const s of ['2026-11-20T10:30:00Z', '2026-11-20T10:30:00.000+00:00', '2026-11-20 10:30:00+00', '2026-11-20 10:30:00', '2026-11-20T10:30:00+0000']) expect(parseTime(s)).toBe(t)
    expect(parseTime('2026-11-20 12:30:00+02')).toBe(t)
    for (const bad of [null, undefined, '', 'nope', 5]) expect(parseTime(bad)).toBe(0)
  })

  it('shows the hour today, yesterday, the weekday, then the date', () => {
    const now = new Date(2026, 10, 20, 15, 0).getTime()
    const at = (d: number, h = 9) => new Date(2026, 10, d, h, 5).getTime()
    expect(listTime(at(20), now, 'en', 'Yesterday')).toMatch(/09:05|9:05/)
    expect(listTime(at(19, 23), now, 'en', 'Yesterday')).toBe('Yesterday')
    expect(listTime(at(16), now, 'en', 'Yesterday')).toBe('Mon')
    expect(listTime(at(1), now, 'en', 'Yesterday')).toBe('Nov 1')
    expect(listTime(0, now, 'en', 'Yesterday')).toBe('')
  })

  it('durations and sizes', () => {
    expect(duration(20_000)).toBe('<1 min')
    expect(duration(12 * 60_000)).toBe('12 min')
    expect(duration(75 * 60_000)).toBe('1 h 15 min')
    expect(fileSize(500)).toBe('500 B')
    expect(fileSize(2048)).toBe('2.0 KB')
    expect(fileSize(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})

describe('the list of chats', () => {
  it('names a chat after the group, or after the others', () => {
    expect(chatTitle(chat('a', { name: ' Team ', kind: 'group' }), 'me')).toBe('Team')
    expect(chatTitle(chat('a'), 'me')).toBe('Ann Rossi')
    expect(chatTitle(chat('a', { kind: 'group', members: [mem('me', 'Me'), mem('1', 'A'), mem('2', 'B'), mem('3', 'C'), mem('4', 'D')] }), 'me')).toBe('A, B, C +1')
    expect(chatTitle(chat('a', { members: [mem('me', 'Me')] }), 'me', 'You')).toBe('Me (You)')
  })

  it('filters: hidden chats stay out until they have something unread; unread, chats, meetings, search', () => {
    const list = [
      chat('a'),
      chat('b', { hidden: true }),
      chat('c', { hidden: true, unread: 2 }),
      chat('d', { unread: 1, last_kind: 'call' }),
      chat('e', { marked_unread: true, name: 'Budget', kind: 'group' }),
    ]
    const ids = (f: 'all' | 'unread' | 'chats' | 'meetings', q = '') => visibleChats(list, { filter: f, q, me: 'me' }).map((c) => c.id)
    expect(ids('all')).toEqual(['a', 'c', 'd', 'e'])
    expect(ids('unread')).toEqual(['c', 'd', 'e'])
    expect(ids('chats')).toEqual(['a', 'c', 'e'])
    expect(ids('meetings')).toEqual(['d'])
    expect(ids('all', 'budg')).toEqual(['e'])
    // the people of a chat can be searched too
    expect(ids('all', 'rossi')).toEqual(['a', 'c', 'd', 'e'])
  })

  it('pinned first in the order of pinning, then the recent ones, newest first', () => {
    const list = [
      chat('old', { last_at: '2026-11-01T10:00:00Z' }),
      chat('new', { last_at: '2026-11-19T10:00:00Z' }),
      chat('p2', { pinned_at: '2026-11-10T10:00:00Z' }),
      chat('p1', { pinned_at: '2026-11-05T10:00:00Z' }),
      chat('none', { last_at: null }),
    ]
    const s = sections(list)
    expect(s.pinned.map((c) => c.id)).toEqual(['p1', 'p2'])
    expect(s.recent.map((c) => c.id)).toEqual(['new', 'old', 'none'])
  })

  it('previews with who wrote and a sign for a call', () => {
    const l = { you: 'You', call: 'Call' }
    expect(previewLine(chat('a', { last_author: 'me' }), 'me', l)).toBe('You: hi')
    expect(previewLine(chat('a'), 'me', l)).toBe('hi')
    expect(previewLine(chat('a', { kind: 'group' }), 'me', l)).toBe('Ann: hi')
    expect(previewLine(chat('a', { last_kind: 'call', last_preview: '📞' }), 'me', l)).toBe('📞 Call')
    expect(previewLine(chat('a', { last_preview: '', last_author: '' }), 'me', l)).toBe('')
  })

  it('counts the unread chats that are not muted', () => {
    expect(totalUnread([chat('a', { unread: 3 }), chat('b', { unread: 1, muted: true }), chat('c', { marked_unread: true }), chat('d')])).toBe(2)
  })
})

describe('messages', () => {
  it('upsert replaces by id and keeps the order', () => {
    let l = [msg('b', '2026-11-20T10:02:00Z')]
    l = upsert(l, msg('a', '2026-11-20T10:01:00Z'))
    l = upsert(l, msg('b', '2026-11-20T10:02:00Z', { text: 'changed' }))
    expect(l.map((m) => m.id)).toEqual(['a', 'b'])
    expect(l[1]!.text).toBe('changed')
  })

  it('groups the messages of one person within five minutes, per day', () => {
    const l = [
      msg('a', '2026-11-20T10:00:00Z'),
      msg('b', '2026-11-20T10:03:00Z'),
      msg('c', '2026-11-20T10:10:00Z'),
      msg('d', '2026-11-20T10:11:00Z', { author: 'me' }),
      msg('e', '2026-11-20T10:12:00Z', { author: 'me', reply_to: 'a' }),
      msg('f', '2026-11-20T10:13:00Z', { author: 'me', importance: 'urgent' }),
      msg('g', '2026-11-20T10:14:00Z', { author: 'me', kind: 'system' }),
      msg('h', '2026-11-20T10:15:00Z', { author: 'me' }),
    ]
    const r = runs(l, 'me')
    const heads = r.flatMap((x) => x.items.map((i) => `${i.msg.id}${i.head ? '*' : ''}${i.own ? '^' : ''}`))
    expect(heads).toEqual(['a*', 'b', 'c*', 'd*^', 'e*^', 'f*^', 'g*^', 'h*^'])
  })

  it('a new day starts with a head', () => {
    const r = runs([msg('a', '2026-11-20T10:00:00Z'), msg('b', '2026-11-21T10:01:00Z')], 'me')
    expect(r.length).toBe(2)
    expect(r[1]!.items[0]!.head).toBe(true)
  })

  it('works out who has seen the last message of the caller', () => {
    const l = [msg('a', '2026-11-20T10:00:00Z', { author: 'me' }), msg('b', '2026-11-20T10:05:00Z', { author: 'u2' }), msg('c', '2026-11-20T10:06:00Z', { author: 'me', deleted: true })]
    const last = lastOwn(l, 'me')!
    expect(last.id).toBe('a')
    const members = [mem('me', 'Me', '2026-11-20T11:00:00Z'), mem('u2', 'Ann', '2026-11-20T10:01:00Z'), mem('u3', 'Bob', '2026-11-20T09:00:00Z'), mem('u4', 'Cy', '2026-11-20T12:00:00Z', true)]
    expect(seenBy(last, members, 'me').map((m) => m.id)).toEqual(['u2'])
    expect(lastOwn([msg('x', '2026-11-20T10:00:00Z')], 'me')).toBeUndefined()
  })

  it('a call is live while someone is in it, then it has a duration', () => {
    const call = (extra: Partial<ChatMsg>) => msg('k', '2026-11-20T10:00:00Z', { kind: 'call', meta: { started_at: '2026-11-20T10:00:00Z' }, ...extra })
    const ann = { id: 'u2', name: 'Ann' }
    const live = callState(call({ call: { live: [ann], joined: [ann], last: '2026-11-20T10:05:00Z' } }))
    expect(live.live).toBe(true)
    expect(live.live_people).toEqual([ann])
    const over = callState(call({ meta: { started_at: '2026-11-20T10:00:00Z', ended_at: '2026-11-20T10:30:00Z' }, call: { live: [], joined: [ann], last: null } }))
    expect(over).toMatchObject({ live: false, ms: 30 * 60_000 })
    // nobody is live and nobody closed it (a closed tab): it ended when the last person was seen
    const stale = callState(call({ call: { live: [], joined: [ann], last: '2026-11-20T10:12:00Z' } }))
    expect(stale).toMatchObject({ live: false, ms: 12 * 60_000 })
    expect(callState(call({})).ms).toBe(0)
  })
})

describe('mentions', () => {
  const members = [mem('me', 'Me'), mem('u2', 'Ann Rossi'), mem('u3', 'Bob'), mem('u4', 'Cy', null, true)]
  it('suggests the others by what is typed, everyone first in a group', () => {
    expect(mentionChoices(members, 'me', '', true).map((p) => p.name)).toEqual(['everyone', 'Ann Rossi', 'Bob'])
    expect(mentionChoices(members, 'me', 'bo', true).map((p) => p.name)).toEqual(['Bob'])
    expect(mentionChoices(members, 'me', 'ev', false).map((p) => p.name)).toEqual([])
    expect(mentionChoices(members, 'me', 'ev', true)[0]).toEqual({ id: '*', name: 'everyone' })
  })

  it('finds the @query under the caret', () => {
    expect(mentionAt('hi @an', 6)).toEqual({ q: 'an', from: 3 })
    expect(mentionAt('hi @', 4)).toEqual({ q: '', from: 3 })
    expect(mentionAt('mail me@x', 9)).toBeNull()
    expect(mentionAt('hi @an there', 12)).toEqual({ q: 'an there', from: 3 })
    expect(mentionAt('hi @an\nthere', 12)).toBeNull()
  })

  it('cuts the mentioned names out of a text, the longest first and only whole names', () => {
    expect(mentionPieces('hi @Ann Rossi and @bob, @Anna', ['Ann Rossi', 'Bob', 'Ann'])).toEqual([
      { t: 'text', v: 'hi ' },
      { t: 'mention', v: '@Ann Rossi' },
      { t: 'text', v: ' and ' },
      { t: 'mention', v: '@bob' },
      { t: 'text', v: ', @Anna' },
    ])
    expect(mentionPieces('no mentions', ['Bob'])).toEqual([{ t: 'text', v: 'no mentions' }])
    expect(mentionPieces('@Bob', [])).toEqual([{ t: 'text', v: '@Bob' }])
  })

  it('the host of the first link', () => {
    expect(linkHost('see https://www.example.org/a?b=1 and more')).toBe('example.org')
    expect(linkHost('no link')).toBe('')
    expect(linkHost('ftp://x')).toBe('')
  })
})

describe('the composer', () => {
  it('wraps the selection in Markdown, with a sample when nothing is selected', () => {
    expect(applyFormat('bold', 'say hello now', 4, 9)).toEqual({ text: 'say **hello** now', start: 6, end: 11 })
    expect(applyFormat('italic', '', 0, 0, 'text').text).toBe('*text*')
    expect(applyFormat('underline', 'a', 0, 1).text).toBe('++a++')
    expect(applyFormat('strike', 'a', 0, 1).text).toBe('~~a~~')
    expect(applyFormat('code', 'a', 0, 1).text).toBe('`a`')
    expect(applyFormat('code', 'a\nb', 0, 3).text).toBe('```\na\nb\n```')
    expect(applyFormat('link', 'site', 0, 4).text).toBe('[site](https://)')
  })

  it('prefixes the lines of the selection and takes the prefix off again', () => {
    expect(applyFormat('bullets', 'a\nb', 0, 3).text).toBe('- a\n- b')
    expect(applyFormat('bullets', '- a\n- b', 0, 7).text).toBe('a\nb')
    expect(applyFormat('quote', 'a', 0, 1).text).toBe('> a')
    expect(applyFormat('numbers', 'a\nb', 0, 3).text).toBe('1. a\n2. b')
    expect(applyFormat('numbers', '1. a\n2. b', 0, 9).text).toBe('a\nb')
  })

  it('inserts an emoji at the caret', () => {
    expect(insertAt('ab', 1, 1, '😀')).toEqual({ text: 'a😀b', start: 3, end: 3 })
    expect(insertAt('abc', 0, 3, 'x').text).toBe('x')
  })

  it('Enter sends, Shift+Enter and an open composition do not', () => {
    expect(sendsOnEnter({ key: 'Enter', shiftKey: false })).toBe(true)
    expect(sendsOnEnter({ key: 'Enter', shiftKey: true })).toBe(false)
    expect(sendsOnEnter({ key: 'Enter', shiftKey: false, isComposing: true })).toBe(false)
    expect(sendsOnEnter({ key: 'a', shiftKey: false })).toBe(false)
  })
})
