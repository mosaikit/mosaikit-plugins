import '@mosaikit/plugin-api/style.css'
import { connect, errText, mountCrud } from '@mosaikit/plugin-api'

const app = document.getElementById('app')!

connect()
  .then((msk) => mountCrud(app, msk, 'tasks', { title: 'Attività', newLabel: '＋ Nuova attività', columns: ['title','due','priority','done'] }))
  .catch((e) => {
    app.textContent = 'Impossibile avviare la UI del plugin: ' + errText(e)
  })