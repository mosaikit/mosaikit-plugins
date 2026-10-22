// UI of the Notes plugin: the generic CRUD view of @mosaikit/plugin-api, in the language of the host
// (English, or Italian when the host is in Italian).
import '@mosaikit/plugin-api/style.css'
import { connect, errText, mountCrud, type Msk } from '@mosaikit/plugin-api'

const TEXTS = {
  en: { title: 'Notes', newLabel: '＋ New note', failed: 'Could not start the UI of the plugin: ' },
  it: { title: 'Note', newLabel: '＋ Nuova nota', failed: 'Impossibile avviare la UI del plugin: ' },
}

const langOf = (l: string | undefined): keyof typeof TEXTS => ((l ?? navigator.language).toLowerCase().startsWith('it') ? 'it' : 'en')
const app = document.getElementById('app')!

function mount(msk: Msk) {
  let lang = langOf(msk.context?.lang)
  const open = () => mountCrud(app, msk, 'notes', { title: TEXTS[lang].title, newLabel: TEXTS[lang].newLabel, columns: ['title', 'tag'] })
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
