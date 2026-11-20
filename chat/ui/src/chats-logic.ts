// What the chats of Chat 2.0 decide without the DOM: times, the list of chats (titles, filters, sections, previews), messages
// in runs of the same person, who has seen what, mentions, calls and the formatting of the composer.
import { prefixLines, wrapSelection } from '@mosaikit/plugin-api'

export interface Person {
  id: string
  name: string
}

export interface Member extends Person {
  last_read_at: string | null
  left?: boolean
}

export interface Chat {
  id: string
  name: string
  kind: 'direct' | 'group'
  created_by: string
  last_at: string | null
  last_preview: string
  last_author: string
  last_kind: string
  unread: number
  mentions: number
  marked_unread: boolean
  pinned_at: string | null
  muted: boolean
  hidden: boolean
  last_read_at: string | null
  history_from: string | null
  members: Member[]
}

export interface Attachment {
  id: string
  name: string
  size: number
  mime: string
}

export interface CallInfo {
  live: Person[]
  joined: Person[]
  last: string | null
}

export interface ChatMsg {
  id: string
  chat: string
  at: string
  kind: 'message' | 'system' | 'call'
  text: string
  author: string
  reply_to: string
  edited: boolean
  deleted: boolean
  importance: 'normal' | 'important' | 'urgent'
  mentions: string[]
  attachments: Attachment[]
  meta: Record<string, unknown>
  pinned: boolean
  pinned_by: string
  reactions: Record<string, Person[]>
  call?: CallInfo
}

export type Filter = 'all' | 'unread' | 'chats' | 'meetings'

/** The emoji of the quick bar (like, heart, laugh, surprised, sad, angry) and the ones of the picker. */
export const QUICK = ['👍', '❤️', '😂', '😮', '😢', '😡']
export const EMOJI = [
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😊', '🙂', '😉', '😍', '😘', '😋', '😎', '🤔', '🤗', '😴', '😬', '🙄', '😏',
  '😢', '😭', '😤', '😡', '😱', '😳', '🤯', '🥳', '🤝', '🙏', '👏', '🙌', '👍', '👎', '👌', '✌️', '💪', '👀', '🔥', '✨',
  '🎉', '💯', '✅', '❌', '⚠️', '❤️', '💔', '☕', '🍕', '🚀', '📌', '📎', '📅', '💡', '🔔', '⭐',
]

// ------------------------------------------------------------------------------------------------------------------ time

/** Milliseconds of a time as the database gives it: `2026-11-20T10:00:00Z`, or `2026-11-20 10:00:00+00`, or with no zone (UTC). */
export function parseTime(v: unknown): number {
  if (typeof v !== 'string' || !v) return 0
  let s = v.trim().replace(' ', 'T')
  const zone = /(Z|[+-]\d\d(:?\d\d)?)$/
  if (!zone.test(s)) s += 'Z'
  else if (/[+-]\d\d$/.test(s)) s += ':00'
  else if (/[+-]\d\d\d\d$/.test(s)) s = s.slice(0, -2) + ':' + s.slice(-2)
  const t = Date.parse(s)
  return Number.isNaN(t) ? 0 : t
}

const dayStart = (t: number) => {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** The time of the last message in the list: the hour today, «yesterday», the weekday this week, else the date. */
export function listTime(t: number, now: number, lang: string, yesterday: string): string {
  if (!t) return ''
  const days = Math.round((dayStart(now) - dayStart(t)) / 86_400_000)
  if (days <= 0) return new Date(t).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return yesterday
  if (days < 7) return new Date(t).toLocaleDateString(lang, { weekday: 'short' })
  return new Date(t).toLocaleDateString(lang, { day: 'numeric', month: 'short' })
}

export const dayKey = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function duration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000))
  if (m < 1) return '<1 min'
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
}

export function fileSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

// ------------------------------------------------------------------------------------------------------------ the list

/** The other people of a chat (the caller is left out, unless they are alone: a chat with oneself). */
export function others(chat: Chat, me: string): Member[] {
  const o = chat.members.filter((m) => m.id !== me)
  return o.length ? o : chat.members
}

/** What the list shows as the name: the group name, or the names of the others (a few, then «+n»). */
export function chatTitle(chat: Chat, me: string, you = 'You'): string {
  if (chat.name.trim()) return chat.name.trim()
  const o = chat.members.filter((m) => m.id !== me)
  if (!o.length) return chat.members[0] ? `${chat.members[0].name} (${you})` : '…'
  const names = o.map((m) => m.name)
  return names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} +${names.length - 3}`
}

export const isUnread = (c: Chat) => c.unread > 0 || c.marked_unread
export const isMeeting = (c: Chat) => c.last_kind === 'call'
const at = (c: Chat) => parseTime(c.last_at)

export function visibleChats(list: Chat[], opts: { filter: Filter; q: string; me: string }): Chat[] {
  const q = opts.q.trim().toLowerCase()
  return list.filter((c) => {
    if (c.hidden && !isUnread(c)) return false
    if (opts.filter === 'unread' && !isUnread(c)) return false
    if (opts.filter === 'chats' && isMeeting(c)) return false
    if (opts.filter === 'meetings' && !isMeeting(c)) return false
    if (!q) return true
    return chatTitle(c, opts.me).toLowerCase().includes(q) || c.members.some((m) => m.name.toLowerCase().includes(q))
  })
}

/** The pinned chats (the ones pinned first on top) and the recent ones (newest first). */
export function sections(list: Chat[]): { pinned: Chat[]; recent: Chat[] } {
  const pinned = list.filter((c) => c.pinned_at).sort((a, b) => parseTime(a.pinned_at) - parseTime(b.pinned_at) || a.id.localeCompare(b.id))
  const recent = list.filter((c) => !c.pinned_at).sort((a, b) => at(b) - at(a) || a.id.localeCompare(b.id))
  return { pinned, recent }
}

/** The line under the name: «You: …», «Ann: …» in a group, the sign of a call. */
export function previewLine(c: Chat, me: string, labels: { you: string; call: string }): string {
  if (!c.last_preview && c.last_kind !== 'call') return ''
  const body = c.last_kind === 'call' ? `📞 ${labels.call}` : c.last_preview
  if (c.last_author === me) return `${labels.you}: ${body}`
  if (c.kind === 'group') {
    const who = c.members.find((m) => m.id === c.last_author)
    if (who) return `${who.name.split(/\s+/)[0]}: ${body}`
  }
  return body
}

export const totalUnread = (list: Chat[]) => list.filter((c) => isUnread(c) && !c.muted).length

// ------------------------------------------------------------------------------------------------------------ messages

export interface Run {
  day: string
  items: { msg: ChatMsg; head: boolean; own: boolean }[]
}

const byTime = (a: ChatMsg, b: ChatMsg) => parseTime(a.at) - parseTime(b.at) || a.id.localeCompare(b.id)

/** Puts `m` in the list (replacing the message with the same id), oldest first. */
export function upsert(list: ChatMsg[], m: ChatMsg): ChatMsg[] {
  const i = list.findIndex((x) => x.id === m.id)
  const out = i < 0 ? [...list, m] : list.map((x, k) => (k === i ? m : x))
  return out.sort(byTime)
}

/** Messages by day; a message follows the previous one of the same person without a head if it is within five minutes. */
export function runs(list: ChatMsg[], me: string): Run[] {
  const out: Run[] = []
  let prev: ChatMsg | null = null
  for (const msg of [...list].sort(byTime)) {
    const d = dayKey(parseTime(msg.at))
    if (!out.length || out[out.length - 1]!.day !== d) {
      out.push({ day: d, items: [] })
      prev = null
    }
    const plain = msg.kind === 'message'
    const close = plain && prev && prev.kind === 'message' && prev.author === msg.author && !msg.reply_to && !msg.deleted && msg.importance === 'normal' && parseTime(msg.at) - parseTime(prev.at) < 5 * 60_000
    out[out.length - 1]!.items.push({ msg, head: !close, own: msg.author === me })
    prev = msg
  }
  return out
}

/** The people who have seen `msg`: the others of the chat whose last reading is not before it. */
export function seenBy(msg: ChatMsg, members: Member[], me: string): Member[] {
  const t = parseTime(msg.at)
  return members.filter((m) => m.id !== me && !m.left && m.last_read_at && parseTime(m.last_read_at) >= t)
}

/** The last message of the caller that shows «seen» under it (never a deleted one or a call). */
export function lastOwn(list: ChatMsg[], me: string): ChatMsg | undefined {
  return [...list].sort(byTime).reverse().find((m) => m.author === me && m.kind === 'message' && !m.deleted)
}

/** The state of a call message: going on (someone is in it) or over, with how long it lasted and who took part. */
export function callState(m: ChatMsg): { live: boolean; ms: number; joined: Person[]; live_people: Person[] } {
  const started = parseTime(m.meta.started_at) || parseTime(m.at)
  const ended = parseTime(m.meta.ended_at)
  const call = m.call ?? { live: [], joined: [], last: null }
  const live = !ended && call.live.length > 0
  const end = ended || parseTime(call.last) || started
  return { live, ms: live ? 0 : Math.max(0, end - started), joined: call.joined, live_people: call.live }
}

// ------------------------------------------------------------------------------------------------------------- mentions

/** The people who may be mentioned while typing `@q` (the caller is left out); `everyone` leads in a group. */
export function mentionChoices(members: Member[], me: string, q: string, group: boolean, everyone = 'everyone'): Person[] {
  const low = q.toLowerCase()
  const list: Person[] = members.filter((m) => m.id !== me && !m.left && m.name.toLowerCase().includes(low)).map((m) => ({ id: m.id, name: m.name }))
  if (group && everyone.toLowerCase().startsWith(low)) list.unshift({ id: '*', name: everyone })
  return list.slice(0, 8)
}

/** The `@query` the caret is in at `pos` (no space between the `@` and the caret), with where it starts. */
export function mentionAt(text: string, pos: number): { q: string; from: number } | null {
  const upto = text.slice(0, pos)
  const i = upto.lastIndexOf('@')
  if (i < 0 || (i > 0 && !/\s/.test(upto[i - 1]!))) return null
  const q = upto.slice(i + 1)
  if (q.length > 40 || /[\n]/.test(q)) return null
  return { q, from: i }
}

/** The text with `@name` of the people mentioned cut out as pieces, so that the page can mark them. */
export function mentionPieces(text: string, names: string[]): { t: 'text' | 'mention'; v: string }[] {
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort((a, b) => b.length - a.length)
  if (!wanted.length || !text.includes('@')) return [{ t: 'text', v: text }]
  const out: { t: 'text' | 'mention'; v: string }[] = []
  const low = text.toLowerCase()
  let i = 0
  let last = 0
  while (i < text.length) {
    if (text[i] === '@') {
      const hit = wanted.find((n) => low.startsWith('@' + n.toLowerCase(), i) && !/[\p{L}\p{N}]/u.test(text[i + 1 + n.length] ?? ' '))
      if (hit) {
        if (i > last) out.push({ t: 'text', v: text.slice(last, i) })
        out.push({ t: 'mention', v: text.slice(i, i + 1 + hit.length) })
        i += 1 + hit.length
        last = i
        continue
      }
    }
    i++
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) })
  return out
}

/** The host name of the first address in a text, for the chip under a message; nothing is fetched. */
export function linkHost(text: string): string {
  const m = /\bhttps?:\/\/[^\s<>)\]]+/i.exec(text)
  if (!m) return ''
  try {
    return new URL(m[0]).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

// ----------------------------------------------------------------------------------------------------------- composer

export type Format = 'bold' | 'italic' | 'underline' | 'strike' | 'bullets' | 'numbers' | 'quote' | 'code' | 'link'

export interface Edit {
  text: string
  start: number
  end: number
}

/** The change of the text when a button of the toolbar is pressed on the selection `[start, end)`. Markdown, with `++` for underline and `~~` for strike. */
export function applyFormat(f: Format, text: string, start: number, end: number, sample = ''): Edit {
  switch (f) {
    case 'bold':
      return wrapSelection(text, start, end, '**', '**', sample)
    case 'italic':
      return wrapSelection(text, start, end, '*', '*', sample)
    case 'underline':
      return wrapSelection(text, start, end, '++', '++', sample)
    case 'strike':
      return wrapSelection(text, start, end, '~~', '~~', sample)
    case 'code':
      return text.slice(start, end).includes('\n') ? wrapSelection(text, start, end, '```\n', '\n```', sample) : wrapSelection(text, start, end, '`', '`', sample)
    case 'link':
      return wrapSelection(text, start, end, '[', '](https://)', sample)
    case 'bullets':
      return prefixLines(text, start, end, '- ')
    case 'quote':
      return prefixLines(text, start, end, '> ')
    case 'numbers': {
      const from = text.lastIndexOf('\n', start - 1) + 1
      const nl = text.indexOf('\n', end)
      const to = nl === -1 ? text.length : nl
      const lines = text.slice(from, to).split('\n')
      const numbered = lines.every((l) => /^\d+\.\s/.test(l))
      const block = lines.map((l, i) => (numbered ? l.replace(/^\d+\.\s/, '') : `${i + 1}. ${l}`)).join('\n')
      return { text: text.slice(0, from) + block + text.slice(to), start: from, end: from + block.length }
    }
  }
}

/** Inserts `s` at the caret (replacing the selection). */
export function insertAt(text: string, start: number, end: number, s: string): Edit {
  return { text: text.slice(0, start) + s + text.slice(end), start: start + s.length, end: start + s.length }
}

/** `Enter` sends, `Shift+Enter` makes a new line; never while a composition (an accent, an IME) is open. */
export const sendsOnEnter = (e: { key: string; shiftKey: boolean; isComposing?: boolean }) => e.key === 'Enter' && !e.shiftKey && !e.isComposing
