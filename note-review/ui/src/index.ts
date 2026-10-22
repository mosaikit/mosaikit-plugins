// The extension opened on its own: what it adds to the notes (it works inside Notes).
import '@mosaikit/plugin-api/style.css'
import { connect, errText } from '@mosaikit/plugin-api'

const TEXTS = {
  en: 'Note review works inside Notes: the "Reviewed" fields, the "Mark as reviewed" action and the "Review" tab in the detail of a note.',
  it: 'Revisione delle note funziona dentro Note: i campi «Revisionata», l’azione «Segna come revisionata» e la scheda «Revisione» nel dettaglio di una nota.',
}

const app = document.getElementById('app')!
connect()
  .then((msk) => {
    const show = () => {
      app.textContent = TEXTS[msk.context?.lang === 'it' ? 'it' : 'en']
    }
    show()
    msk.onContext(show)
  })
  .catch((e) => {
    app.textContent = errText(e)
  })
