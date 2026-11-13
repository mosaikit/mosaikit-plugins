import { describe, expect, it } from 'vitest'
import {
  behindBy,
  chartGeometry,
  pointsAttr,
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

describe('burndown chart', () => {
  const days = [
    { date: '2026-06-01', remaining: 4, ideal: 4 },
    { date: '2026-06-02', remaining: 3, ideal: 3 },
    { date: '2026-06-03', remaining: 3, ideal: 2 },
    { date: '2026-06-04', remaining: null, ideal: 1 },
    { date: '2026-06-05', remaining: null, ideal: 0 },
  ]

  it('draws the ideal line over every day and the real one only up to today', () => {
    const g = chartGeometry(days, 4, 560, 260)
    expect(g.ideal).toHaveLength(5)
    expect(g.actual).toHaveLength(3)
    // from the first day at the left edge to the last at the right edge
    expect(g.ideal[0].x).toBe(g.left)
    expect(g.ideal[4].x).toBe(g.right)
    // all the tasks are at the top of the plot and none on the bottom line
    expect(g.ideal[0].y).toBe(g.top)
    expect(g.ideal[4].y).toBe(g.bottom)
    // a fall is a rise of y
    expect(g.actual[1].y).toBeGreaterThan(g.actual[0].y)
  })

  it('has a scale that reaches the most tasks, in whole steps', () => {
    const g = chartGeometry(days, 4)
    expect(g.ticks.map((t) => t.value)).toEqual([0, 1, 2, 3, 4])
    const big = chartGeometry([{ date: 'a', remaining: 30, ideal: 30 }, { date: 'b', remaining: 0, ideal: 0 }], 30)
    expect(big.ticks.map((t) => t.value)).toEqual([0, 6, 12, 18, 24, 30])
  })

  it('does not break with a single day or no tasks drawn', () => {
    const one = chartGeometry([{ date: 'a', remaining: 2, ideal: 0 }], 2)
    expect(one.ideal).toHaveLength(1)
    expect(chartGeometry([], 0).ticks.map((t) => t.value)).toEqual([0, 1])
  })

  it('writes the points of a line', () => {
    expect(pointsAttr([{ x: 1.234, y: 2 }, { x: 3, y: 4.56 }])).toBe('1.2,2 3,4.6')
  })

  it('says how far behind or ahead the work is on the last day that has come', () => {
    expect(behindBy(days)).toBe(1)
    expect(behindBy([{ date: 'a', remaining: 1, ideal: 3 }])).toBe(-2)
    expect(behindBy([{ date: 'a', remaining: null, ideal: 3 }])).toBeNull()
  })
})
