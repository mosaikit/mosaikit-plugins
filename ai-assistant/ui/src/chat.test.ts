import { describe, expect, it } from 'vitest'
import type { AssistantMessage } from '@mosaikit/plugin-api'
import { desktopConfig, fmtDuration, fmtStamp, parseMessages, resultText, rowsOf, titleOf, toolLabel, toolMessage, unanswered } from './chat.ts'

const call = { id: 'c1', name: 'notes__create', arguments: { title: 'a' } }
const chat: AssistantMessage[] = [
  { role: 'user', content: 'make a note' },
  { role: 'assistant', content: '', tool_calls: [call] },
]

describe('saved chats', () => {
  it('reads the messages and drops what is not a message', () => {
    const raw = JSON.stringify([{ role: 'user', content: 'hi' }, { role: 'system', content: 'x' }, 5, { role: 'tool', content: '{}', tool_call_id: 'c1' }, { role: 'assistant', tool_calls: [{ id: 1 }, call] }])
    const m = parseMessages(raw)
    expect(m.map((x) => x.role)).toEqual(['user', 'tool', 'assistant'])
    expect(m[2]!.tool_calls).toEqual([call])
    expect(parseMessages('not json')).toEqual([])
    expect(parseMessages(undefined)).toEqual([])
  })

  it('titles a chat with the first words of the first question', () => {
    expect(titleOf([{ role: 'user', content: '  how is   the tenant?  ' }], 'New chat')).toBe('how is the tenant?')
    expect(titleOf([], 'New chat')).toBe('New chat')
    expect(titleOf([{ role: 'user', content: 'x'.repeat(200) }], 'n').length).toBe(60)
  })
})

describe('proposals', () => {
  it('finds the calls that wait for the person, and none once they are answered', () => {
    expect(unanswered(chat)).toEqual([call])
    expect(unanswered([...chat, toolMessage(call, { result: 1 })])).toEqual([])
    expect(unanswered([])).toEqual([])
  })

  it('shows a step with its result, or waiting', () => {
    const waiting = rowsOf(chat)
    expect(waiting).toEqual([{ kind: 'user', text: 'make a note' }, { kind: 'step', call, result: null }])
    const done = rowsOf([...chat, toolMessage(call, { error: 'no' }), { role: 'assistant', content: 'Could not.' }])
    expect(done[1]).toMatchObject({ kind: 'step', result: { ok: false, text: 'no' } })
    expect(done[2]).toEqual({ kind: 'assistant', text: 'Could not.' })
  })
})

describe('time', () => {
  it('writes how long a reply took', () => {
    expect(fmtDuration(3400, 'en')).toBe('3.4 s')
    expect(fmtDuration(3400, 'it')).toBe('3,4 s')
    expect(fmtDuration(42_400)).toBe('42 s')
    expect(fmtDuration(88_000)).toBe('1 min 28 s')
    expect(fmtDuration(-1)).toBe('')
  })
  it('writes the date of a message, and nothing for a bad one', () => {
    expect(fmtStamp('2026-11-27T16:22:05', 'en')).toContain('22:05')
    expect(fmtStamp('2026-11-27T16:22:05', 'en')).toContain('27')
    expect(fmtStamp(undefined)).toBe('')
    expect(fmtStamp('not a date')).toBe('')
  })
  it('keeps the time of a saved message and the duration of its step', () => {
    const m = parseMessages(JSON.stringify([{ role: 'user', content: 'hi', at: '2026-11-27T10:00:00Z' }, { role: 'assistant', content: 'yo', ms: 4200, at: 'bad' }]))
    expect(m[0]).toMatchObject({ at: '2026-11-27T10:00:00Z' })
    expect(m[1]!.ms).toBe(4200)
    expect(m[1]!.at).toBeUndefined()
    const rows = rowsOf(m)
    expect(rows[0]).toMatchObject({ kind: 'user', at: '2026-11-27T10:00:00Z' })
    expect(rows[1]).toMatchObject({ kind: 'assistant', ms: 4200 })
  })
})

describe('texts', () => {
  it('labels a tool by app and name', () => {
    expect(toolLabel('notes__create')).toBe('notes › create')
    expect(toolLabel('plain')).toBe('plain')
  })
  it('reads a result', () => {
    expect(resultText('{"result":"fine"}')).toEqual({ ok: true, text: 'fine' })
    expect(resultText('{"result":{"a":1}}')).toEqual({ ok: true, text: '{"a":1}' })
    expect(resultText('plain')).toEqual({ ok: true, text: 'plain' })
  })
  it('writes the settings for Claude Desktop', () => {
    const c = JSON.parse(desktopConfig('https://h/api/t/x/mcp', 'mska_1'))
    expect(c.mcpServers.mosaikit.args).toEqual(['mcp-remote', 'https://h/api/t/x/mcp', '--header', 'Authorization: Bearer mska_1'])
  })
})
