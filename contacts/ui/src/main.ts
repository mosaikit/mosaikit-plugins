// UI of the Contacts plugin: cards with the initials of each person and a reading panel (English by default;
// Italian and Spanish follow the language of the host).
import '@mosaikit/plugin-api/style.css'
import './contacts.css'
import { avatar, chip, connect, el, errText, mountCrud, type CrudView, type ItemCtx, type Msk } from '@mosaikit/plugin-api'

const TEXTS = {
  en: { title: 'Contacts', newLabel: '＋ New contact', cards: 'Cards', failed: 'Could not start the UI of the plugin: ', noName: 'Unnamed' },
  it: { title: 'Contatti', newLabel: '＋ Nuovo contatto', cards: 'Schede', failed: 'Impossibile avviare la UI del plugin: ', noName: 'Senza nome' },
  es: { title: 'Contactos', newLabel: '＋ Nuevo contacto', cards: 'Fichas', failed: 'No se pudo iniciar la interfaz del plugin: ', noName: 'Sin nombre' },
}

const langOf = (l: string | undefined): keyof typeof TEXTS => {
  const x = (l ?? navigator.language).toLowerCase()
  return x.startsWith('it') ? 'it' : x.startsWith('es') ? 'es' : 'en'
}
const app = document.getElementById('app')!

/** One line of a card: the value, as a link when it is an address or a number. */
function line(kind: 'mail' | 'tel', value: string, link: boolean): HTMLElement | null {
  if (!value) return null
  const text = el('span', { class: 'cline-text' }, value)
  if (!link) return el('div', { class: `cline ${kind}` }, text)
  const a = el('a', { href: (kind === 'mail' ? 'mailto:' : 'tel:') + value.replace(/\s+/g, '') }, value)
  return el('div', { class: `cline ${kind}` }, a)
}

function mount(msk: Msk) {
  let lang = langOf(msk.context?.lang)
  const card = (c: ItemCtx) => {
    const name = c.text('name') || TEXTS[lang].noName
    const kind = c.text('company')
    const head = el('div', { class: 'chead' }, avatar(name), el('div', { class: 'cwho' }, el('strong', {}, name), ...(kind ? [chip(kind)] : [])))
    return el('div', { class: 'contact' }, head, ...([line('mail', c.text('email'), false), line('tel', c.text('phone'), false)].filter(Boolean) as HTMLElement[]))
  }
  const reader = (c: ItemCtx) => {
    const name = c.text('name') || TEXTS[lang].noName
    const kind = c.text('company')
    const rows = [
      [c.fields.find((f) => f.key === 'email')?.label ?? 'Email', line('mail', c.text('email'), true)],
      [c.fields.find((f) => f.key === 'phone')?.label ?? 'Phone', line('tel', c.text('phone'), true)],
    ] as const
    return el(
      'div',
      { class: 'contact-read' },
      avatar(name, true),
      el('h2', {}, name),
      ...(kind ? [chip(kind)] : []),
      el('dl', {}, ...rows.flatMap(([k, v]) => (v ? [el('dt', {}, k), el('dd', {}, v)] : []))),
    )
  }
  const views = (): CrudView[] => [{ key: 'cards', label: TEXTS[lang].cards, kind: 'cards', item: card }]
  const open = () => mountCrud(app, msk, 'contacts', { title: TEXTS[lang].title, newLabel: TEXTS[lang].newLabel, columns: ['name', 'email', 'phone', 'company'], views: views(), reader })
  let off = open()
  // the view follows the host for its own texts; the title and the button are ours
  msk.onContext((ctx) => {
    if (langOf(ctx.lang) === lang) return
    lang = langOf(ctx.lang)
    off()
    off = open()
  })
}

connect()
  .then(mount)
  .catch((e) => {
    app.textContent = TEXTS[langOf(undefined)].failed + errText(e)
  })
