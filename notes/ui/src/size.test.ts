import { describe, expect, it } from 'vitest'
import { SIZE, clampSize, resizedBy, tiltOf } from './size.ts'

describe('size of a post-it', () => {
  it('stays inside the bounds', () => {
    expect(clampSize(1, 1)).toEqual({ w: SIZE.minW, h: SIZE.minH })
    expect(clampSize(9999, 9999)).toEqual({ w: SIZE.maxW, h: SIZE.maxH })
    expect(clampSize(null, undefined)).toEqual({ w: SIZE.w, h: SIZE.h })
    expect(clampSize('300', NaN)).toEqual({ w: SIZE.w, h: SIZE.h })
  })
  it('follows the arrows with Alt', () => {
    expect(resizedBy('ArrowRight', 240, 200)).toEqual({ w: 260, h: 200 })
    expect(resizedBy('ArrowUp', 240, 200, true)).toEqual({ w: 240, h: 140 })
    expect(resizedBy('ArrowLeft', SIZE.minW, 200)).toEqual({ w: SIZE.minW, h: 200 })
    expect(resizedBy('a', 240, 200)).toBeNull()
  })
  it('the tilt of a note is always the same, and slight', () => {
    expect(tiltOf('abc-123')).toBe(tiltOf('abc-123'))
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) expect(Math.abs(tiltOf(id))).toBeLessThanOrEqual(1.8)
  })
})
