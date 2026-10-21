import '@mosaikit/plugin-api/style.css'
import { connect, errText, mountCrud } from '@mosaikit/plugin-api'

const app = document.getElementById('app')!

connect()
  .then((msk) => mountCrud(app, msk, 'notes', { title: 'Note', newLabel: '＋ Nuova nota', columns: ['title','tag'] }))
  .catch((e) => {
    app.textContent = 'Impossibile avviare la UI del plugin: ' + errText(e)
  })