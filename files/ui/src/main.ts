import '@mosaikit/plugin-api/style.css'
import './app.css'
import { connect, errText, watchTableScroll } from '@mosaikit/plugin-api'
import { FileManager } from './app.ts'
import { followHost, t } from './i18n.ts'

const app = document.getElementById('app')!

connect()
  .then((msk) => {
    followHost(msk)
    watchTableScroll()
    const fm = new FileManager(app, msk)
    window.addEventListener('pagehide', () => fm.dispose())
  })
  .catch((e) => {
    app.textContent = t('Could not start the UI of the plugin: {error}', { error: errText(e) })
  })
