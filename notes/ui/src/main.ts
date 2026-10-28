// UI of the Notes plugin: note cards with their tag, and a panel to read the open note and edit it (English by default;
// Italian and Spanish follow the language of the host).
import '@mosaikit/plugin-api/style.css'
import './notes.css'
import { chip, connect, el, errText, mountCrud, type CrudView, type ItemCtx, type Msk, type Row } from '@mosaikit/plugin-api'
import { translateTool } from './translate.ts'

const TEXTS = {
  en: { title: 'Notes', all: 'All notes', newLabel: '＋ New note', cards: 'Cards', failed: 'Could not start the UI of the plugin: ', mine: 'My notes', shared: 'Shared with me', tag: 'Tag', sharedBy: 'Shared by {n}', empty: 'No text', untitled: 'Untitled' },
  it: { title: 'Note', all: 'Tutte le note', newLabel: '＋ Nuova nota', cards: 'Schede', failed: 'Impossibile avviare la UI del plugin: ', mine: 'Le mie note', shared: 'Condivise con me', tag: 'Tag', sharedBy: 'Condivisa da {n}', empty: 'Nessun testo', untitled: 'Senza titolo' },
  es: { title: 'Notas', all: 'Todas las notas', newLabel: '＋ Nueva nota', cards: 'Fichas', failed: 'No se pudo iniciar la interfaz del plugin: ', mine: 'Mis notas', shared: 'Compartidas conmigo', tag: 'Etiqueta', sharedBy: 'Compartida por {n}', empty: 'Sin texto', untitled: 'Sin título' },
}
const TAGS: Record<string, { en: string; it: string; es: string }> = {
  personal: { en: 'personal', it: 'personale', es: 'personal' },
  work: { en: 'work', it: 'lavoro', es: 'trabajo' },
  urgent: { en: 'urgent', it: 'urgente', es: 'urgente' },
}

const langOf = (l: string | undefined): keyof typeof TEXTS => {
  const x = (l ?? navigator.language).toLowerCase()
  return x.startsWith('it') ? 'it' : x.startsWith('es') ? 'es' : 'en'
}
const app = document.getElementById('app')!

function mount(msk: Msk) {
  let lang = langOf(msk.context?.lang)
  // the page of the navigation of the shell it was opened at: all, mine, shared or a tag
  const at = msk.at ?? 'all'
  const tag = at.startsWith('tag-') ? at.slice(4) : null
  const where = (row: Row) =>
    at === 'mine' ? row.owner_id === msk.user?.id : at === 'shared' ? row.owner_id !== msk.user?.id : tag ? row.values.tag === tag : true
  // the header reads «Notes › subsection»
  const section = () =>
    at === 'mine' ? TEXTS[lang].mine : at === 'shared' ? TEXTS[lang].shared : tag ? `${TEXTS[lang].tag}: ${TAGS[tag]?.[lang] ?? tag}` : TEXTS[lang].all
  const tone = (c: ItemCtx) => (c.value('tag') === 'urgent' ? 'err' : c.value('tag') === 'work' ? 'acc' : '')
  const who = (c: ItemCtx) => (c.row.owner_id !== msk.user?.id ? TEXTS[lang].sharedBy.replace('{n}', c.row.owner_name) : '')
  const card = (c: ItemCtx) => {
    const body = c.text('body').trim()
    const foot = el('div', { class: 'nfoot' }, ...(c.text('tag') ? [chip(c.text('tag'), tone(c))] : []), ...(who(c) ? [el('span', { class: 'nwho' }, who(c))] : []))
    return el('div', { class: 'note' }, el('strong', { class: 'ntitle' }, c.text('title') || TEXTS[lang].untitled), el('p', { class: 'nbody' + (body ? '' : ' none') }, body || TEXTS[lang].empty), foot)
  }
  const reader = (c: ItemCtx) => {
    const body = c.text('body').trim()
    return el(
      'article',
      { class: 'note-read' },
      el('h2', {}, c.text('title') || TEXTS[lang].untitled),
      el('div', { class: 'nfoot' }, ...(c.text('tag') ? [chip(c.text('tag'), tone(c))] : []), ...(who(c) ? [el('span', { class: 'nwho' }, who(c))] : [])),
      el('div', { class: 'nread' + (body ? '' : ' none') }, body || TEXTS[lang].empty),
    )
  }
  const views = (): CrudView[] => [{ key: 'cards', label: TEXTS[lang].cards, kind: 'cards', item: card }]
  const open = () => mountCrud(app, msk, 'notes', { title: TEXTS[lang].title, section: section(), newLabel: TEXTS[lang].newLabel, columns: ['title', 'tag'], where, views: views(), reader, detail: (row, box) => translateTool(msk, row, box, lang === 'it' ? 'it' : 'en') })
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
