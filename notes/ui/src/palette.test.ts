import { describe, expect, it } from 'vitest'
import { COLORS, PALETTE, colorOfName, paletteCss, type Mode } from './palette.ts'

/** WCAG 2.1 relative luminance and contrast ratio of two #rrggbb colours. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

describe('palette of the post-its', () => {
  it('has 8 colours', () => {
    expect(COLORS).toHaveLength(8)
    expect(Object.keys(PALETTE).sort()).toEqual([...COLORS].sort())
  })

  for (const mode of ['light', 'dark'] as Mode[]) {
    it(`the ink reads on the background in ${mode} mode (WCAG AA, at least 4.5:1)`, () => {
      for (const c of COLORS) {
        const { bg, ink } = PALETTE[c][mode]
        expect(contrast(ink, bg), `${c} in ${mode}`).toBeGreaterThanOrEqual(4.5)
      }
    })
  }

  it('the colours stay apart from each other in each mode', () => {
    for (const mode of ['light', 'dark'] as Mode[]) {
      const bgs = COLORS.map((c) => PALETTE[c][mode].bg)
      expect(new Set(bgs).size).toBe(8)
    }
  })

  it('a name gives always the same colour', () => {
    expect(colorOfName('Work')).toBe(colorOfName('work'))
    expect(COLORS).toContain(colorOfName('anything'))
  })

  it('the CSS has a rule for every colour in both modes', () => {
    const css = paletteCss()
    for (const c of COLORS) {
      expect(css).toContain(`.pc-${c} {`)
      expect(css).toContain(`html[data-mode="dark"] .pc-${c} {`)
    }
  })
})
