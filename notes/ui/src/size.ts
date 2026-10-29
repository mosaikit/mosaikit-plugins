// Size of a post-it in pixels: the default, the bounds and the step of the keyboard.
export const SIZE = { w: 240, h: 200, minW: 160, minH: 120, maxW: 480, maxH: 480, step: 20 }

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** A size inside the bounds (a value that is not a number gives the default). */
export function clampSize(w: unknown, h: unknown): { w: number; h: number } {
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : d)
  return { w: clamp(num(w, SIZE.w), SIZE.minW, SIZE.maxW), h: clamp(num(h, SIZE.h), SIZE.minH, SIZE.maxH) }
}

/** The size after an Alt+arrow key (`Shift` goes three steps), or null for another key. */
export function resizedBy(key: string, w: number, h: number, shift = false): { w: number; h: number } | null {
  const d = SIZE.step * (shift ? 3 : 1)
  const by: Record<string, [number, number]> = { ArrowRight: [d, 0], ArrowLeft: [-d, 0], ArrowDown: [0, d], ArrowUp: [0, -d] }
  const v = by[key]
  return v ? clampSize(w + v[0], h + v[1]) : null
}

/** A slight turn in degrees, always the same for the same note (no change when the list is drawn again). */
export function tiltOf(id: string): number {
  let h = 0
  for (const c of id) h = (h * 31 + c.codePointAt(0)!) % 9973
  return ((h % 7) - 3) * 0.6
}
