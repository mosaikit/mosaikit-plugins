import { describe, expect, it } from 'vitest'
import { addReview, MAX_REVIEWS, parseHistory } from './history.ts'

describe('history of the reviews', () => {
  it('reads only well formed reviews', () => {
    expect(parseHistory(null)).toEqual([])
    expect(parseHistory('not json')).toEqual([])
    expect(parseHistory('{"a":1}')).toEqual([])
    const raw = JSON.stringify([{ at: '2026-10-22T10:00:00Z', by: 'Anna', reviewed: true, note: ' ok ' }, { at: 1 }, 'x'])
    expect(parseHistory(raw)).toEqual([{ at: '2026-10-22T10:00:00Z', by: 'Anna', reviewed: true, note: 'ok' }])
  })

  it('adds a review, without an empty comment, keeping the newest ones', () => {
    let raw: string | null = null
    for (let i = 0; i < MAX_REVIEWS + 3; i++) raw = addReview(raw, { at: `t${i}`, by: 'Bruno', reviewed: i % 2 === 0, note: i === 0 ? '  ' : `n${i}` })
    const list = parseHistory(raw)
    expect(list).toHaveLength(MAX_REVIEWS)
    expect(list[0].at).toBe('t3')
    expect(list.at(-1)).toEqual({ at: `t${MAX_REVIEWS + 2}`, by: 'Bruno', reviewed: true, note: `n${MAX_REVIEWS + 2}` })
    expect(parseHistory(addReview(null, { at: 'x', by: 'A', reviewed: true, note: ' ' }))[0]).not.toHaveProperty('note')
  })
})
