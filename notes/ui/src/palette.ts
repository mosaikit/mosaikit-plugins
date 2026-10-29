// The palette of the post-its and of the tags: 8 colours, each with a background and an ink for the light mode and for
// the dark mode. The pairs are checked for contrast (palette.test.ts); the CSS is made from this table, so it is the only place.

export const COLORS = ['yellow', 'orange', 'pink', 'violet', 'blue', 'teal', 'green', 'grey'] as const
export type Color = (typeof COLORS)[number]
export type Mode = 'light' | 'dark'
export interface Pair {
  bg: string
  ink: string
}

export const PALETTE: Record<Color, Record<Mode, Pair>> = {
  yellow: { light: { bg: '#fff3a3', ink: '#3d3200' }, dark: { bg: '#5c4d00', ink: '#fff3b0' } },
  orange: { light: { bg: '#ffd8a8', ink: '#4a2400' }, dark: { bg: '#6b3a0a', ink: '#ffe3c2' } },
  pink: { light: { bg: '#ffc9de', ink: '#5a0f33' }, dark: { bg: '#6b2142', ink: '#ffd9e8' } },
  violet: { light: { bg: '#e1d4ff', ink: '#2e1a63' }, dark: { bg: '#3f2d73', ink: '#e9e0ff' } },
  blue: { light: { bg: '#c6e2ff', ink: '#0b2f5c' }, dark: { bg: '#1d4470', ink: '#d6eaff' } },
  teal: { light: { bg: '#b8f0e6', ink: '#06403a' }, dark: { bg: '#14504a', ink: '#c9f5ee' } },
  green: { light: { bg: '#cdf2b0', ink: '#1f4310' }, dark: { bg: '#2f5a1c', ink: '#ddf7c8' } },
  grey: { light: { bg: '#e4e6ea', ink: '#22262d' }, dark: { bg: '#3a3f48', ink: '#eceef2' } },
}

export const isColor = (v: unknown): v is Color => typeof v === 'string' && (COLORS as readonly string[]).includes(v)

/** The colour of a tag that has none of its own: the same name always gives the same colour. */
export function colorOfName(name: string): Color {
  let h = 0
  for (const c of name.toLowerCase()) h = (h * 31 + c.codePointAt(0)!) % 997
  return COLORS[h % COLORS.length]!
}

/** The CSS of the colours: `.pc-<colour>` sets `--pi-bg` and `--pi-ink`, for the light mode and for the dark mode of the host. */
export function paletteCss(): string {
  const light = COLORS.map((c) => `.pc-${c} { --pi-bg: ${PALETTE[c].light.bg}; --pi-ink: ${PALETTE[c].light.ink}; }`)
  const dark = COLORS.map((c) => `html[data-mode="dark"] .pc-${c} { --pi-bg: ${PALETTE[c].dark.bg}; --pi-ink: ${PALETTE[c].dark.ink}; }`)
  return [...light, ...dark].join('\n')
}
