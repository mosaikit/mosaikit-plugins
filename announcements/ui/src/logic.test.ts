import { describe, expect, it } from 'vitest'
import { boardOrder, levelOf, periodOf, todayLocal, ackRows, fileStem, initials } from './logic.ts'

const n = (id: string, level: string, pinned = false, createdAt = '2026-05-01T10:00:00Z') => ({ id, level, pinned, startsOn: '', endsOn: '', createdAt })

describe('periodOf', () => {
  it('is current without dates and inside the period, upcoming before it, past after it', () => {
    expect(periodOf({ startsOn: '', endsOn: '' }, '2026-05-10')).toBe('current')
    expect(periodOf({ startsOn: '2026-05-10', endsOn: '2026-05-10' }, '2026-05-10')).toBe('current')
    expect(periodOf({ startsOn: '2026-05-11', endsOn: '' }, '2026-05-10')).toBe('upcoming')
    expect(periodOf({ startsOn: '', endsOn: '2026-05-09' }, '2026-05-10')).toBe('past')
  })
})

describe('boardOrder', () => {
  it('puts pinned first, then urgent before important before information, then the newest', () => {
    const list = [n('a', 'info'), n('b', 'urgent', false, '2026-05-02T10:00:00Z'), n('c', 'info', true), n('d', 'urgent', false, '2026-05-03T10:00:00Z'), n('e', 'important')]
    expect(boardOrder(list).map((x) => x.id)).toEqual(['c', 'd', 'b', 'e', 'a'])
  })
  it('does not change the list it is given', () => {
    const list = [n('a', 'info'), n('b', 'urgent')]
    boardOrder(list)
    expect(list.map((x) => x.id)).toEqual(['a', 'b'])
  })
})

describe('levelOf and todayLocal', () => {
  it('knows three levels', () => {
    expect(levelOf('urgent')).toBe('urgent')
    expect(levelOf('loud')).toBe('info')
    expect(levelOf(undefined)).toBe('info')
  })
  it('writes the local day', () => {
    expect(todayLocal(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('acknowledgement export', () => {
  it('lists who confirmed, the earliest first', () => {
    expect(ackRows([{ name: 'Bo', at: '2026-11-02T10:00:00Z' }, { name: 'Ada', at: '2026-11-01T09:00:00Z' }])).toEqual([
      ['Ada', '2026-11-01T09:00:00Z'],
      ['Bo', '2026-11-02T10:00:00Z'],
    ])
  })
  it('makes a file name and initials', () => {
    expect(fileStem('Office closed on Friday!')).toBe('office-closed-on-friday')
    expect(fileStem('???')).toBe('notice')
    expect(initials('Ada Lovelace')).toBe('AL')
    expect(initials('plato')).toBe('P')
    expect(initials('  ')).toBe('?')
  })
})
