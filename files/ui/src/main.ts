import '@mosaikit/plugin-api/style.css'
import './app.css'
import { connect, errText } from '@mosaikit/plugin-api'
import { FileManager } from './app.ts'

const app = document.getElementById('app')!

connect()
  .then((msk) => {
    const fm = new FileManager(app, msk)
    window.addEventListener('pagehide', () => fm.dispose())
  })
  .catch((e) => {
    app.textContent = 'Impossibile avviare la UI del plugin: ' + errText(e)
  })
