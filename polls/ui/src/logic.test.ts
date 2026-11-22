import { describe, expect, it, vi } from 'vitest'
import { applyFilter, checkOptions, debounce, fileStem, isClosed, isUuid, newBrowserId, parseOptions, publicProblem, qrMode, qrTarget, resultsOf, resultsRows, toggleChoice, winners } from './logic.ts'

describe('parseOptions', () => {
  it('reads a JSON array in text or an array', () => {
    expect(parseOptions('["a","b"]')).toEqual(['a', 'b'])
    expect(parseOptions(['a', 'b'])).toEqual(['a', 'b'])
  })
  it('gives nothing for anything else', () => {
    expect(parseOptions('nope')).toEqual([])
    expect(parseOptions(undefined)).toEqual([])
    expect(parseOptions('[1,"x"]')).toEqual(['x'])
  })
})

describe('checkOptions', () => {
  it('trims and accepts 2 to 12 distinct texts', () => {
    expect(checkOptions([' a ', 'b'])).toEqual({ options: ['a', 'b'] })
    expect(checkOptions(Array.from({ length: 12 }, (_, i) => `o${i}`))).toHaveProperty('options')
  })
  it('refuses an empty, a repeated, a long one and a wrong count', () => {
    expect(checkOptions(['a', ' '])).toEqual({ problem: 'empty' })
    expect(checkOptions(['a', 'A'])).toEqual({ problem: 'duplicate' })
    expect(checkOptions(['a', 'x'.repeat(101)])).toEqual({ problem: 'long' })
    expect(checkOptions(['a'])).toEqual({ problem: 'count' })
    expect(checkOptions(Array.from({ length: 13 }, (_, i) => `o${i}`))).toEqual({ problem: 'count' })
  })
})

describe('closing and filters', () => {
  const p = (closed: boolean, closesOn: string, createdAt: string) => ({ closed, closesOn, createdAt })
  it('a poll closes by hand or when its date has passed', () => {
    expect(isClosed({ closed: true, closesOn: '' }, '2026-05-01')).toBe(true)
    expect(isClosed({ closed: false, closesOn: '2026-04-30' }, '2026-05-01')).toBe(true)
    expect(isClosed({ closed: false, closesOn: '2026-05-01' }, '2026-05-01')).toBe(false)
  })
  it('filters and puts the newest first', () => {
    const list = [p(false, '', '2026-01-01'), p(true, '', '2026-01-02'), p(false, '', '2026-01-03')]
    expect(applyFilter(list, 'open', '2026-05-01').map((x) => x.createdAt)).toEqual(['2026-01-03', '2026-01-01'])
    expect(applyFilter(list, 'closed', '2026-05-01')).toHaveLength(1)
    expect(applyFilter(list, 'all', '2026-05-01')).toHaveLength(3)
  })
})

describe('winners, choices and results', () => {
  it('finds the leading options, none when nobody voted', () => {
    expect(winners([0, 0])).toEqual([])
    expect(winners([1, 3, 3])).toEqual([1, 2])
  })
  it('a single choice replaces, a multiple one toggles', () => {
    expect(toggleChoice([0], 2, false)).toEqual([2])
    expect(toggleChoice([0], 2, true)).toEqual([0, 2])
    expect(toggleChoice([0, 2], 0, true)).toEqual([2])
  })
  it('results default to after the vote', () => {
    expect(resultsOf('always')).toBe('always')
    expect(resultsOf('x')).toBe('after_vote')
  })
})

describe('debounce', () => {
  it('calls once after a burst', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = debounce(fn, 100)
    d()
    d()
    d()
    vi.advanceTimersByTime(150)
    expect(fn).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})

describe('public voting', () => {
  it('knows a uuid and makes one', () => {
    expect(isUuid('0f8fad5b-d9cb-469f-a165-70867728950e')).toBe(true)
    expect(isUuid('nope')).toBe(false)
    expect(isUuid(5)).toBe(false)
    const id = newBrowserId()
    expect(isUuid(id)).toBe(true)
    expect(newBrowserId()).not.toBe(id)
  })
  it('makes a uuid without crypto.randomUUID', () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) })
    expect(isUuid(newBrowserId())).toBe(true)
    vi.unstubAllGlobals()
  })
  it('reads the problem from the code of the error', () => {
    expect(publicProblem({ code: 'already_voted' })).toBe('already')
    expect(publicProblem({ code: 'poll_closed' })).toBe('closed')
    expect(publicProblem({ code: 'public_rate_limited' })).toBe('rate')
    expect(publicProblem({ code: 'public_commands_off' })).toBe('off')
    expect(publicProblem({ code: 'poll_voters_cap' })).toBe('cap')
    expect(publicProblem(new Error('x'))).toBe('other')
    expect(publicProblem(null)).toBe('other')
  })
})

describe('export and QR', () => {
  const o = { total_voters: 3, options: [{ label: 'Pizza', votes: 2, percent: 67, voters: [{ name: 'Ada' }, { name: 'Bo' }] }, { label: 'Sushi, hot', votes: 1, percent: 33, voters: [] }] }
  it('makes one row per option, with the names only when asked', () => {
    expect(resultsRows(o, false)).toEqual([['Pizza', 2, 0.67], ['Sushi, hot', 1, 0.33]])
    expect(resultsRows(o, true)[0]).toEqual(['Pizza', 2, 0.67, 'Ada; Bo'])
  })
  it('makes a file name from a question', () => {
    expect(fileStem('Where do we eat on Friday? Café!')).toBe('where-do-we-eat-on-friday-cafe')
    expect(fileStem('???')).toBe('poll')
    expect(fileStem('x'.repeat(80)).length).toBe(40)
  })
  it('accepts only web addresses for the QR code', () => {
    expect(qrTarget(' https://example.org/p/abc ')).toBe('https://example.org/p/abc')
    expect(qrTarget('javascript:alert(1)')).toBeNull()
    expect(qrTarget('not a url')).toBeNull()
    expect(qrTarget('')).toBeNull()
    expect(qrTarget('https://a.b/' + 'x'.repeat(1000))).toBeNull()
  })
  it('chooses what the QR dialog offers', () => {
    expect(qrMode(null, '')).toBe('manual')
    expect(qrMode({ active: false }, 'https://a.b/x')).toBe('create')
    expect(qrMode({ active: true }, 'https://a.b/x')).toBe('show')
    expect(qrMode({ active: true }, '')).toBe('paste')
    expect(qrMode({ active: true }, 'javascript:1')).toBe('paste')
  })
})
