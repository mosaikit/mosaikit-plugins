// Pure logic of the chat (no DOM): the saved form of a chat, the calls nobody answered yet, what to show of a tool, the title.
import type { AssistantAttachment, AssistantMessage, AssistantToolCall } from '@mosaikit/plugin-api'

export const MAX_TITLE = 60

/** A message of the chat with when it was written (`at`, ISO) and how long it took (`ms`: a step, or for the last answer the whole
 *  reply since the question). The kernel ignores both; the saved chat keeps them. */
export type Stamped = AssistantMessage & { at?: string; ms?: number; stopped?: boolean }

/** `3,4 s`, `42 s`, `1 min 28 s` */
export function fmtDuration(ms: number, lang = 'en'): string {
  if (!Number.isFinite(ms) || ms < 0) return ''
  const s = ms / 1000
  if (s < 10) return `${new Intl.NumberFormat(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(s)} s`
  if (s < 60) return `${Math.round(s)} s`
  const m = Math.floor(s / 60)
  return `${m} min ${Math.round(s - m * 60)} s`
}

/** The date and the time of a message, in the language of the person: `27 nov, 16:22:05`. */
export function fmtStamp(at: string | undefined, lang = 'en'): string {
  const d = at ? new Date(at) : null
  if (!d || Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/** The messages of a saved chat; anything that is not a valid message is dropped (a damaged field never breaks the page). */
export function parseMessages(raw: unknown): Stamped[] {
  let v: unknown = raw
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(v)) return []
  const out: Stamped[] = []
  for (const m of v) {
    if (!m || typeof m !== 'object') continue
    const { role, content, tool_calls, tool_call_id, at, ms } = m as Record<string, unknown>
    if (role !== 'user' && role !== 'assistant' && role !== 'tool') continue
    const msg: Stamped = { role, content: typeof content === 'string' ? content : '' }
    if (typeof at === 'string' && !Number.isNaN(new Date(at).getTime())) msg.at = at
    if (typeof ms === 'number' && Number.isFinite(ms) && ms >= 0) msg.ms = ms
    if ((m as { stopped?: unknown }).stopped === true) msg.stopped = true
    if (role === 'assistant' && Array.isArray(tool_calls)) {
      msg.tool_calls = tool_calls
        .filter((c): c is AssistantToolCall => !!c && typeof c === 'object' && typeof (c as AssistantToolCall).id === 'string' && typeof (c as AssistantToolCall).name === 'string')
        .map((c) => ({ id: c.id, name: c.name, arguments: c.arguments ?? {} }))
    }
    if (role === 'tool' && typeof tool_call_id === 'string') msg.tool_call_id = tool_call_id
    if (role === 'user' && Array.isArray((m as { attachments?: unknown }).attachments)) {
      const files = ((m as { attachments: unknown[] }).attachments)
        .filter((a): a is AssistantAttachment => !!a && typeof a === 'object' && typeof (a as AssistantAttachment).name === 'string')
        .map((a) => ({ name: a.name, kind: a.kind, mime: a.mime, ...(typeof a.size === 'number' ? { size: a.size } : {}) }))
      if (files.length) msg.attachments = files
    }
    out.push(msg)
  }
  return out
}

/** The saved form of a chat: the files are kept by name, not by content (a chat would grow by megabytes). */
export const serialize = (messages: AssistantMessage[]): string =>
  JSON.stringify(messages.map((m) => (m.attachments?.length ? { ...m, attachments: m.attachments.map(({ data: _data, ...rest }) => rest) } : m)))

/** Drops the content of the files of the messages (the model has read them once). */
export function dropFileData(messages: AssistantMessage[]): void {
  for (const m of messages) if (m.attachments) m.attachments = m.attachments.map(({ data: _data, ...rest }) => rest)
}

/** The title of a chat: the first words of the first question. */
export function titleOf(messages: AssistantMessage[], fallback: string): string {
  const first = messages.find((m) => m.role === 'user')?.content.replace(/\s+/g, ' ').trim()
  if (!first) return fallback
  return first.length <= MAX_TITLE ? first : `${first.slice(0, MAX_TITLE - 1).trimEnd()}…`
}

/** The tool calls of the last assistant message that have no result yet: they wait for the person (a tool that writes). */
export function unanswered(messages: AssistantMessage[]): AssistantToolCall[] {
  const at = messages.map((m) => m.role).lastIndexOf('assistant')
  if (at < 0) return []
  const done = new Set(messages.slice(at + 1).filter((m) => m.role === 'tool').map((m) => m.tool_call_id))
  return (messages[at]!.tool_calls ?? []).filter((c) => !done.has(c.id))
}

/** `notes__create` → `notes › create` */
export function toolLabel(name: string): string {
  const [plugin, ...rest] = name.split('__')
  return rest.length ? `${plugin} › ${rest.join('__')}` : name
}

/** The text of a tool result: the model gets `{ result }` or `{ error }`; the person sees a short form. */
export function resultText(content: string): { ok: boolean; text: string } {
  try {
    const v = JSON.parse(content) as { result?: unknown; error?: unknown }
    if (typeof v.error === 'string') return { ok: false, text: v.error }
    if ('result' in v) return { ok: true, text: typeof v.result === 'string' ? v.result : JSON.stringify(v.result) }
  } catch {
    /* not JSON: shown as it is */
  }
  return { ok: true, text: content }
}

/** What the shell (or the person) asks to see in the chat: assistant text and the steps in between, in order. */
export type Row =
  | { kind: 'user'; text: string; at?: string; files?: AssistantAttachment[] }
  | { kind: 'assistant'; text: string; at?: string; ms?: number; stopped?: boolean }
  | { kind: 'stopped'; at?: string; ms?: number }
  | { kind: 'step'; call: AssistantToolCall; result: { ok: boolean; text: string } | null; ms?: number }

export function rowsOf(messages: Stamped[]): Row[] {
  const results = new Map<string, Stamped>()
  for (const m of messages) if (m.role === 'tool' && m.tool_call_id) results.set(m.tool_call_id, m)
  const rows: Row[] = []
  for (const m of messages) {
    if (m.role === 'user') rows.push({ kind: 'user', text: m.content, at: m.at, ...(m.attachments?.length ? { files: m.attachments } : {}) })
    else if (m.role === 'assistant') {
      if (m.stopped && !m.content.trim()) rows.push({ kind: 'stopped', at: m.at, ms: m.ms })
      else if (m.content.trim()) rows.push({ kind: 'assistant', text: m.content, at: m.at, ms: m.ms, ...(m.stopped ? { stopped: true } : {}) })
      for (const c of m.tool_calls ?? []) {
        const r = results.get(c.id)
        rows.push({ kind: 'step', call: c, result: r === undefined ? null : resultText(r.content), ms: r?.ms })
      }
    }
  }
  return rows
}

/** The message that closes a call: the result of the tool, or the refusal of the person. */
export function toolMessage(call: AssistantToolCall, outcome: { result: unknown } | { error: string }): AssistantMessage {
  return { role: 'tool', content: JSON.stringify(outcome), tool_call_id: call.id }
}

/** The MCP settings for a client that speaks only stdio (Claude Desktop): the `mcp-remote` bridge. */
export function desktopConfig(url: string, token: string): string {
  return JSON.stringify({ mcpServers: { mosaikit: { command: 'npx', args: ['mcp-remote', url, '--header', `Authorization: Bearer ${token}`] } } }, null, 2)
}
