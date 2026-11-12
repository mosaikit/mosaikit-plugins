import { describe, expect, it } from 'vitest'
import { nextWeekday, parseQuickAdd, toValues } from './quickadd.ts'

// Wednesday 2026-11-11
const now = new Date(2026, 10, 11)

describe('quick add', () => {
  it('reads everything it knows and keeps the rest as the title', () => {
    const p = parseQuickAdd('Call Ana tomorrow !high #work @phone @ana every week', now)
    expect(p).toEqual({ title: 'Call Ana', due: '2026-11-12', priority: 'high', project: 'work', labels: ['phone', 'ana'], repeat: 'weekly' })
  })
  it('understands Italian and Spanish', () => {
    expect(parseQuickAdd('Chiamare Ana domani !alta ogni giorno', now)).toMatchObject({ title: 'Chiamare Ana', due: '2026-11-12', priority: 'high', repeat: 'daily' })
    expect(parseQuickAdd('Llamar mañana !baja', now)).toMatchObject({ title: 'Llamar', due: '2026-11-12', priority: 'low' })
  })
  it('days of the week are the next one, never today', () => {
    expect(parseQuickAdd('Report friday', now).due).toBe('2026-11-13')
    expect(parseQuickAdd('Report wednesday', now).due).toBe('2026-11-18')
    expect(nextWeekday(now, 0).getDate()).toBe(15)
  })
  it('in N days and ISO dates', () => {
    expect(parseQuickAdd('Pay in 10 days', now)).toMatchObject({ title: 'Pay', due: '2026-11-21' })
    expect(parseQuickAdd('Pay 2027-01-05 invoice', now)).toMatchObject({ title: 'Pay invoice', due: '2027-01-05' })
  })
  it('a title with no marks stays untouched; an unknown !word stays in it', () => {
    expect(parseQuickAdd('  Buy   milk ', now)).toEqual({ title: 'Buy milk', labels: [] })
    expect(parseQuickAdd('Wow !amazing deal', now)).toMatchObject({ title: 'Wow !amazing deal' })
  })
  it('does not eat words that only contain a keyword', () => {
    expect(parseQuickAdd('Todayville meeting', now)).toMatchObject({ title: 'Todayville meeting' })
    expect(parseQuickAdd('Issue #12 fix', now)).toMatchObject({ project: '12', title: 'Issue fix' })
  })
  it('makes the values', () => {
    expect(toValues(parseQuickAdd('X today !low @a @b', now))).toEqual({ title: 'X', done: false, due: '2026-11-11', priority: 'low', labels: 'a,b' })
  })
})
