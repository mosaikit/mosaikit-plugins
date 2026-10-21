import '@mosaikit/plugin-api/style.css'
import { connect, errText, mountCrud } from '@mosaikit/plugin-api'

const app = document.getElementById('app')!

connect()
  .then((msk) => mountCrud(app, msk, 'contacts', { title: 'Contatti', newLabel: '＋ Nuovo contatto', columns: ['name','email','phone','company'] }))
  .catch((e) => {
    app.textContent = 'Impossibile avviare la UI del plugin: ' + errText(e)
  })