// What the Chat UI decides without the DOM: messages from rows, reactions, order, runs of a sender, who is typing.
import type { Row } from '@mosaikit/plugin-api'

export interface Msg {
  id: string
  text: string
  from: { id: string; name: string }
  /** ISO time of creation */
  at: string
  /** the id of the message this one answers ('' for none) */
  replyTo: string
  edited: boolean
  reactions: Record<string, string[]>
}

export const QUICK = ['👍', '❤️', '😂', '🎉', '🙏', '👀']

/** The reactions of a message: `{ emoji: [user ids] }`; anything else is nothing. */
export function parseReactions(s: unknown): Record<string, string[]> {
  if (typeof s !== 'string' || !s) return {}
  try {
    const o = JSON.parse(s) as unknown
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {}
    const out: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(o)) if (Array.isArray(v) && v.every((x) => typeof x === 'string') && v.length) out[k] = v as string[]
    return out
  } catch {
    return {}
  }
}

/** The reactions after `user` pressed `emoji`: added, or taken back; an emoji nobody uses goes away. */
export function toggleReaction(r: Record<string, string[]>, emoji: string, user: string): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(r)) out[k] = [...v]
  const list = out[emoji] ?? []
  out[emoji] = list.includes(user) ? list.filter((u) => u !== user) : [...list, user]
  if (!out[emoji]!.length) delete out[emoji]
  return out
}

export const stringifyReactions = (r: Record<string, string[]>) => JSON.stringify(r)

export function fromRow(r: Row): Msg {
  const v = r.values
  return {
    id: r.id,
    text: typeof v.text === 'string' ? v.text : '',
    from: { id: r.owner_id, name: r.owner_name },
    at: r.created_at,
    replyTo: typeof v.reply_to === 'string' ? v.reply_to : '',
    edited: !!v.edited,
    reactions: parseReactions(v.reactions),
  }
}

const byTime = (a: Msg, b: Msg) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1)

/** Puts `m` in the list (replacing the message with the same id), oldest first. */
export function upsert(list: Msg[], m: Msg): Msg[] {
  const i = list.findIndex((x) => x.id === m.id)
  const out = i < 0 ? [...list, m] : list.map((x, k) => (k === i ? m : x))
  return out.sort(byTime)
}

export const without = (list: Msg[], id: string) => list.filter((m) => m.id !== id)

export interface Run {
  /** the day, `YYYY-MM-DD` of the local time */
  day: string
  /** `head`: starts a block of the same person, which shows the name and the face */
  items: { msg: Msg; head: boolean }[]
}

const day = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Messages by day; inside a day a message follows the previous one of the same person without a head if it is within 5 minutes. */
export function runs(list: Msg[]): Run[] {
  const out: Run[] = []
  let prev: Msg | null = null
  for (const msg of [...list].sort(byTime)) {
    const d = day(msg.at)
    if (!out.length || out[out.length - 1]!.day !== d) {
      out.push({ day: d, items: [] })
      prev = null
    }
    const close = prev && prev.from.id === msg.from.id && !msg.replyTo && new Date(msg.at).getTime() - new Date(prev.at).getTime() < 5 * 60_000
    out[out.length - 1]!.items.push({ msg, head: !close })
    prev = msg
  }
  return out
}

export interface Who {
  id: string
  name: string
  state?: unknown
}

/** Names of the others who typed less than `ttl` ms ago (`seen`: user id to the time of the last «typing» we heard). */
export function typingNames(people: Who[], me: string, seen: Map<string, number>, now: number, ttl = 6000): string[] {
  return people.filter((p) => p.id !== me && now - (seen.get(p.id) ?? 0) < ttl && (p.state as { typing?: boolean } | undefined)?.typing).map((p) => p.name)
}

/** A short plain version of a text for a quote. */
export function snippet(text: string, n = 90): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}
