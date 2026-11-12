// Texts of the UI in the language of the host: English by default. The key of a text is the English phrase;
// `{name}` marks a placeholder. Other languages come from the language plugins (`lang/ui/<plugin id>.json`, read
// through `msk.t`); Italian is the table of this plugin (`it.ts`), given to `msk.ownTexts`.
import type { Msk } from '@mosaikit/plugin-api'
import { IT } from './it.ts'

export type Lang = 'en' | 'it'

function pick(l: string | undefined): Lang {
  return (l ?? '').toLowerCase().startsWith('it') ? 'it' : 'en'
}

let lang: Lang = pick(typeof navigator === 'undefined' ? undefined : navigator.language)
/** the code of the host language as it is (`es`, `ar`…): `lang` keeps only the two languages built in */
let code = 'en'
/** the connection to the host, once `followHost` has run: `msk.t` knows the texts of the language plugins */
let host: Msk | undefined

export function getLang(): Lang {
  return lang
}

export function setLang(l: string | undefined) {
  lang = pick(l)
  code = (l ?? '').toLowerCase().split('-')[0] || 'en'
}

/** Locale for dates and numbers. */
export function locale(): string {
  return lang === 'it' ? 'it-IT' : code === 'en' ? 'en-GB' : code
}

/** The text in the current language. */
export function t(en: string, vars: Record<string, string | number> = {}): string {
  if (host) return host.t(en, vars)
  const s = lang === 'it' ? (IT[en] ?? en) : en
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))
}

function ctxCode(l: string | undefined): string {
  return (l ?? '').toLowerCase().split('-')[0] || 'en'
}

/** `n` and the singular or plural form, in the current language. */
export function plural(n: number, one: string, many: string): string {
  return n + ' ' + t(n === 1 ? one : many)
}

let stale = false

/**
 * Takes the language of the host; when it changes the page reloads (the UI is built once). With `busy()`
 * true (a site is open: it changes language by itself) the reload waits for `reloadIfStale()`.
 */
export function followHost(msk: Msk, busy: () => boolean = () => false) {
  setLang(msk.context?.lang ?? (typeof navigator === 'undefined' ? undefined : navigator.language))
  msk.ownTexts({ it: IT })
  host = msk
  msk.onContext((ctx) => {
    if (ctxCode(ctx.lang) === code) return
    stale = true
    if (!busy()) location.reload()
  })
}

/** Reloads the page if the host changed language while the reload was held back. */
export function reloadIfStale() {
  if (stale) location.reload()
}
