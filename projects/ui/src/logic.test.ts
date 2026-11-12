import { describe, expect, it } from 'vitest'
import {
  byStatus,
  columnsFromText,
  columnsToText,
  currentSprint,
  isOverdue,
  newId,
  nextMilestone,
  parseColumns,
  parseMilestones,
  parseSprints,
  percentOf,
  statusOf,
  todayLocal,
} from './logic.ts'

const ms = JSON.stringify([
  { id: 'b', name: 'Launch', date: '2026-07-01', done: false },
  { id: 'a', name: 'Beta', date: '2026-06-01', done: true },
  { id: 'c', name: 'Docs', date: '2026-06-15', done: false },
  { id: '', name: 'broken', date: '2026-06-15' },
])

describe('the stored lists', () => {
  it('milestones come by date and a broken entry is dropped', () => {
    expect(parseMilestones(ms).map((m) => m.id)).toEqual(['a', 'c', 'b'])
    expect(parseMilestones('not json')).toEqual([])
    expect(parseMilestones(null)).toEqual([])
  })
  it('sprints come by start date', () => {
    const s = JSON.stringify([
      { id: '2', name: 'S2', start: '2026-06-15', end: '2026-06-28' },
      { id: '1', name: 'S1', start: '2026-06-01', end: '2026-06-14' },
    ])
    expect(parseSprints(s).map((x) => x.id)).toEqual(['1', '2'])
  })
  it('the columns fall back to the default three', () => {
    expect(parseColumns('["A","B"]')).toEqual(['A', 'B'])
    expect(parseColumns('["A"]')).toEqual(['To do', 'Doing', 'Done'])
    expect(parseColumns('')).toEqual(['To do', 'Doing', 'Done'])
  })
  it('the columns round-trip through the text of the form', () => {
    expect(columnsFromText(' Backlog \n\nLive\n')).toEqual(['Backlog', 'Live'])
    expect(columnsFromText(columnsToText(['A', 'B']))).toEqual(['A', 'B'])
  })
})

describe('dates', () => {
  it('a milestone is overdue when it is not done and its date has passed', () => {
    expect(isOverdue({ date: '2026-06-01', done: false }, '2026-06-02')).toBe(true)
    expect(isOverdue({ date: '2026-06-01', done: true }, '2026-06-02')).toBe(false)
    expect(isOverdue({ date: '2026-06-02', done: false }, '2026-06-02')).toBe(false)
  })
  it('the next milestone is the earliest one still to reach', () => {
    const list = parseMilestones(ms)
    expect(nextMilestone(list, '2026-06-10')?.id).toBe('c')
    expect(nextMilestone(list, '2026-06-15')?.id).toBe('c')
    expect(nextMilestone(list, '2026-06-16')?.id).toBe('b')
    expect(nextMilestone(list, '2026-07-02')).toBeNull()
  })
  it('the current sprint contains today, ends included', () => {
    const s = [
      { id: '1', name: 'S1', start: '2026-06-01', end: '2026-06-14' },
      { id: '2', name: 'S2', start: '2026-06-15', end: '2026-06-28' },
    ]
    expect(currentSprint(s, '2026-06-14')?.id).toBe('1')
    expect(currentSprint(s, '2026-06-15')?.id).toBe('2')
    expect(currentSprint(s, '2026-07-01')).toBeNull()
  })
  it('today is written with the local date', () => {
    expect(todayLocal(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('the list of projects', () => {
  const rows = [
    { name: 'Zed', status: 'active' as const },
    { name: 'Alfa', status: 'done' as const },
    { name: 'Beta', status: 'active' as const },
  ]
  it('filters by status and sorts by name', () => {
    expect(byStatus(rows, 'all').map((r) => r.name)).toEqual(['Alfa', 'Beta', 'Zed'])
    expect(byStatus(rows, 'active').map((r) => r.name)).toEqual(['Beta', 'Zed'])
    expect(byStatus(rows, 'planned')).toEqual([])
  })
  it('an unknown status is active', () => {
    expect(statusOf('on_hold')).toBe('on_hold')
    expect(statusOf('weird')).toBe('active')
    expect(statusOf(undefined)).toBe('active')
  })
  it('percent rounds and survives an empty project', () => {
    expect(percentOf(1, 3)).toBe(33)
    expect(percentOf(2, 3)).toBe(67)
    expect(percentOf(0, 0)).toBe(0)
  })
  it('an id has a prefix and letters or digits', () => {
    expect(newId('m', () => 0.5)).toMatch(/^m[0-9a-z]{6}$/)
    expect(newId('s', () => 0)).toBe('s000000')
  })
})
