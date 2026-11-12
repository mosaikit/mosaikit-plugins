// What the polls UI decides, with no DOM: the options of a poll, whether it takes votes, the winner and the filters.

export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 12
export const MAX_OPTION = 100

export type Results = 'always' | 'after_vote' | 'after_close'
export type Filter = 'open' | 'closed' | 'all'
export type OptionProblem = 'empty' | 'count' | 'duplicate' | 'long'

/** The options of a poll as stored (a JSON array in text; an array is accepted too): only the texts survive. */
export function parseOptions(raw: unknown): string[] {
  let v: unknown = raw
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw)
    } catch {
      return []
    }
  }
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/** The options of the form checked as the plugin does: 2 to 12, none empty, none repeated, each at most 100 characters. */
export function checkOptions(list: string[]): { options: string[] } | { problem: OptionProblem } {
  const options = list.map((o) => o.trim())
  if (options.some((o) => !o)) return { problem: 'empty' }
  if (options.some((o) => [...o].length > MAX_OPTION)) return { problem: 'long' }
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return { problem: 'duplicate' }
  if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) return { problem: 'count' }
  return { options }
}

/** The way the results are shown, with a safe default. */
export function resultsOf(v: unknown): Results {
  return v === 'always' || v === 'after_close' ? v : 'after_vote'
}

/** Whether the poll is closed on `today` (YYYY-MM-DD): by hand, or its closing date is before today. */
export function isClosed(p: { closed: boolean; closesOn: string }, today: string): boolean {
  return p.closed || (!!p.closesOn && p.closesOn < today)
}

/** The polls of a filter, the newest first. */
export function applyFilter<T extends { closed: boolean; closesOn: string; createdAt: string }>(list: T[], filter: Filter, today: string): T[] {
  return list
    .filter((p) => filter === 'all' || (filter === 'closed') === isClosed(p, today))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** The indexes of the option(s) with the most votes (none while nobody voted). */
export function winners(votes: number[]): number[] {
  const top = Math.max(0, ...votes)
  return top === 0 ? [] : votes.flatMap((v, i) => (v === top ? [i] : []))
}

/** The choices after a click: one at a time for a single choice, a toggle for a multiple one. */
export function toggleChoice(chosen: number[], i: number, multiple: boolean): number[] {
  if (!multiple) return [i]
  return chosen.includes(i) ? chosen.filter((c) => c !== i) : [...chosen, i].sort((a, b) => a - b)
}

/** Today as YYYY-MM-DD in the local time of the person. */
export function todayLocal(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

/** Calls `fn` once after `ms` of silence (the live results arrive in bursts). */
export function debounce(fn: () => void, ms: number): () => void {
  let t: ReturnType<typeof setTimeout> | undefined
  return () => {
    clearTimeout(t)
    t = setTimeout(fn, ms)
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Whether a text is a UUID (the id of a browser that votes from a public link). */
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v)
}

/** A new random browser id (a UUID v4). */
export function newBrowserId(): string {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID()
  const b = new Uint8Array(16)
  if (c?.getRandomValues) c.getRandomValues(b)
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const x = Array.from(b, (n) => n.toString(16).padStart(2, '0')).join('')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}

export type PublicProblem = 'already' | 'closed' | 'rate' | 'off' | 'cap' | 'other'

/** What went wrong in a public call, from the code of the error. */
export function publicProblem(e: unknown): PublicProblem {
  const code = (e as { code?: unknown } | null)?.code
  switch (code) {
    case 'already_voted':
      return 'already'
    case 'poll_closed':
      return 'closed'
    case 'public_rate_limited':
      return 'rate'
    case 'public_commands_off':
      return 'off'
    case 'poll_voters_cap':
      return 'cap'
    default:
      return 'other'
  }
}
