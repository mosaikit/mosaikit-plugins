// UI of the Notes plugin: the generic CRUD view of @mosaikit/plugin-api, in the language of the host
// (English, or Italian when the host is in Italian).
import '@mosaikit/plugin-api/style.css'
import { connect, errText, mountCrud, type Msk, type Row } from '@mosaikit/plugin-api'

const TEXTS = {
  en: { title: 'Notes', newLabel: '＋ New note', failed: 'Could not start the UI of the plugin: ', mine: 'My notes', shared: 'Shared with me', tag: 'Tag' },
  it: { title: 'Note', newLabel: '＋ Nuova nota', failed: 'Impossibile avviare la UI del plugin: ', mine: 'Le mie note', shared: 'Condivise con me', tag: 'Tag' },
}
const TAGS: Record<string, { en: string; it: string }> = {
  personal: { en: 'personal', it: 'personale' },
  work: { en: 'work', it: 'lavoro' },
  urgent: { en: 'urgent', it: 'urgente' },
}

const langOf = (l: string | undefined): keyof typeof TEXTS => ((l ?? navigator.language).toLowerCase().startsWith('it') ? 'it' : 'en')
const app = document.getElementById('app')!

function mount(msk: Msk) {
  let lang = langOf(msk.context?.lang)
  // the page of the navigation of the shell it was opened at: all, mine, shared or a tag
  const at = msk.at ?? 'all'
  const tag = at.startsWith('tag-') ? at.slice(4) : null
  const where = (row: Row) =>
    at === 'mine' ? row.owner_id === msk.user?.id : at === 'shared' ? row.owner_id !== msk.user?.id : tag ? row.values.tag === tag : true
  const title = () =>
    at === 'mine' ? TEXTS[lang].mine : at === 'shared' ? TEXTS[lang].shared : tag ? `${TEXTS[lang].tag}: ${TAGS[tag]?.[lang] ?? tag}` : TEXTS[lang].title
  const open = () => mountCrud(app, msk, 'notes', { title: title(), newLabel: TEXTS[lang].newLabel, columns: ['title', 'tag'], where })
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
