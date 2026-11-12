import { describe, expect, it } from 'vitest'
import { addDaysIso, bucketOf, joinLabels, splitLabels, weekDays } from './group.ts'

describe('group', () => {
  const today = '2026-11-11'
  it('puts a task in its bucket', () => {
    expect(bucketOf({ done: true, due: '2020-01-01' }, today)).toBe('done')
    expect(bucketOf({ done: false, due: '' }, today)).toBe('nodate')
    expect(bucketOf({ done: false, due: '2026-11-10' }, today)).toBe('overdue')
    expect(bucketOf({ done: false, due: '2026-11-11' }, today)).toBe('today')
    expect(bucketOf({ done: false, due: '2026-11-17' }, today)).toBe('week')
    expect(bucketOf({ done: false, due: '2026-11-18' }, today)).toBe('later')
  })
  it('adds days across months and years', () => {
    expect(addDaysIso('2026-12-30', 3)).toBe('2027-01-02')
    expect(weekDays(today)).toHaveLength(7)
    expect(weekDays(today)[6]).toBe('2026-11-17')
  })
  it('labels', () => {
    expect(splitLabels(' a, b ,,A,c')).toEqual(['a', 'b', 'c'])
    expect(splitLabels(null)).toEqual([])
    expect(joinLabels(['x', 'y'])).toBe('x,y')
  })
})
