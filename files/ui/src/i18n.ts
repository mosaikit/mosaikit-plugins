// Texts of the UI in the language of the host: English by default, Italian when the host is in
// Italian. The key of a text is the English phrase; `{name}` marks a placeholder.
import type { Msk } from '@mosaikit/plugin-api'
import { IT } from './it.ts'

export type Lang = 'en' | 'it'

function pick(l: string | undefined): Lang {
  return (l ?? '').toLowerCase().startsWith('it') ? 'it' : 'en'
}

let lang: Lang = pick(typeof navigator === 'undefined' ? undefined : navigator.language)

export function getLang(): Lang {
  return lang
}

export function setLang(l: string | undefined) {
  lang = pick(l)
}

/** Locale for dates and numbers. */
export function locale(): string {
  return lang === 'it' ? 'it-IT' : 'en-GB'
}

/** The text in the current language. */
export function t(en: string, vars: Record<string, string | number> = {}): string {
  const s = lang === 'it' ? (IT[en] ?? en) : en
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))
}

/** `n` and the singular or plural form, in the current language. */
export function plural(n: number, one: string, many: string): string {
  return n + ' ' + t(n === 1 ? one : many)
}

/** Takes the language of the host; when it changes the page reloads (the UI is built once). */
export function followHost(msk: Msk) {
  setLang(msk.context?.lang ?? (typeof navigator === 'undefined' ? undefined : navigator.language))
  msk.onContext((ctx) => {
    if (pick(ctx.lang) !== lang) location.reload()
  })
}
