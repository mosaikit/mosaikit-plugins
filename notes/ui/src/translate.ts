// «Translate» in the detail of a note: a language, a button, the translation below (nothing is saved).
// The logic of the plugin (command notes.translate) calls the translation service with the key the
// Administrator set; here only the answer is shown, and a clear text when the service is not ready.
import type { Msk, Row } from '@mosaikit/plugin-api'
import { errText } from '@mosaikit/plugin-api'

type Lang = 'en' | 'it'

const TEXTS = {
  en: {
    legend: 'Translation',
    to: 'Translate into',
    button: 'Translate note',
    working: 'Translating…',
    reasons: {
      no_key: 'No translation key is set. Ask your Administrator to set it in System › Keys of outside services.',
      no_endpoint: 'The address of the translation service is not set. Ask your Administrator to set it in System › Keys of outside services.',
      key_rejected: 'The translation service refused the key. Ask your Administrator to check it.',
      service_error: 'The translation service could not translate the note.',
      unreachable: 'The translation service cannot be reached.',
    } as Record<string, string>,
  },
  it: {
    legend: 'Traduzione',
    to: 'Traduci in',
    button: 'Traduci la nota',
    working: 'Traduzione in corso…',
    reasons: {
      no_key: 'Non è impostata nessuna chiave di traduzione. Chiedila all’Administrator: si imposta in Sistema › Chiavi dei servizi esterni.',
      no_endpoint: 'L’indirizzo del servizio di traduzione non è impostato. Chiedilo all’Administrator: si imposta in Sistema › Chiavi dei servizi esterni.',
      key_rejected: 'Il servizio di traduzione ha rifiutato la chiave. Chiedi all’Administrator di controllarla.',
      service_error: 'Il servizio di traduzione non è riuscito a tradurre la nota.',
      unreachable: 'Il servizio di traduzione non è raggiungibile.',
    } as Record<string, string>,
  },
}

const LANGS: [string, string][] = [
  ['en', 'English'],
  ['it', 'Italiano'],
  ['es', 'Español'],
  ['fr', 'Français'],
  ['de', 'Deutsch'],
]

type Outcome = { ok: true; title: string; body: string; target: string } | { ok: false; text: string }
/** The last outcome and language per note: the detail is drawn again at every change. */
const last = new Map<string, Outcome>()
let target = 'en'

export function translateTool(msk: Msk, row: Row, box: HTMLElement, lang: Lang) {
  const tx = TEXTS[lang]
  const set = document.createElement('fieldset')
  set.className = 'msk-extset'
  set.dataset.testid = 'notes-translate'
  const legend = document.createElement('legend')
  legend.textContent = tx.legend
  const select = document.createElement('select')
  select.id = 'notes-translate-to'
  select.setAttribute('aria-label', tx.to)
  for (const [code, name] of LANGS) select.append(new Option(name, code, false, code === target))
  select.addEventListener('change', () => (target = select.value))
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'msk-btn ghost'
  button.textContent = tx.button
  const actions = document.createElement('div')
  actions.className = 'msk-actions'
  actions.append(select, button)
  const out = document.createElement('div')
  out.setAttribute('role', 'status')
  const show = (o: Outcome | undefined) => {
    out.replaceChildren()
    if (!o) return
    const r = document.createElement('div')
    if (o.ok) {
      r.className = 'msk-result'
      if (o.title) {
        const b = document.createElement('b')
        b.textContent = o.title
        r.append(b)
      }
      r.append(document.createTextNode(o.body))
    } else {
      r.className = 'msk-msg err'
      r.textContent = o.text
    }
    out.append(r)
  }
  show(last.get(row.id))
  button.addEventListener('click', async () => {
    button.disabled = true
    out.textContent = tx.working
    let o: Outcome
    try {
      const r = await msk.call<{ ok: boolean; reason?: string; detail?: string; title?: string; body?: string; target?: string }>('notes.translate', { id: row.id, target })
      o = r.ok
        ? { ok: true, title: r.title ?? '', body: r.body ?? '', target: r.target ?? target }
        : { ok: false, text: tx.reasons[r.reason ?? ''] ?? r.detail ?? tx.reasons.service_error }
    } catch (e) {
      o = { ok: false, text: errText(e, lang) }
    }
    last.set(row.id, o)
    button.disabled = false
    show(o)
  })
  set.append(legend, actions, out)
  box.append(set)
}
