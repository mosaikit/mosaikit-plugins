// Vista dei link pubblici di una mappa: titolo e GeoLibre in sola lettura
// (`layout=viewer`) che ripristina il progetto salvato. Nessun salvataggio:
// il ponte di stato si usa solo per il ripristino (onChange = null).

import '@mosaikit/plugin-api/style.css'
import './maps.css'
import { connect, type Msk, type PublicResource } from '@mosaikit/plugin-api'
import { h, errText } from './dom.ts'
import { MapFrame, parseProject } from './mapframe.ts'

const app = document.getElementById('app')!
app.classList.add('mskm', 'public')

connect()
  .then(mount)
  .catch((e) => {
    app.textContent = 'Impossibile aprire la mappa: ' + errText(e)
  })

async function mount(msk: Msk) {
  let res: PublicResource | undefined = msk.publicResource
  if (!res?.values) res = await msk.publicGet()
  const values = res?.values ?? {}
  const name = (values.name == null ? '' : String(values.name)) || res?.title || 'Mappa'
  const description = values.description == null ? '' : String(values.description)
  document.title = name

  const bstatus = h('span', { class: 'bstatus' })
  const mapMsg = h('div', { class: 'msg map-msg', role: 'status' })
  const frame = new MapFrame({
    onStatus: (t) => (bstatus.textContent = t),
    onError: (t) => {
      mapMsg.textContent = t
      mapMsg.classList.add('err')
    },
  })

  app.replaceChildren(
    h('div', { class: 'editbar' }, h('span', { class: 'mv-title' }, name), description ? h('span', { class: 'mv-sub' }, description) : null, h('span', { class: 'grow' }), bstatus),
    mapMsg,
  )

  const project = parseProject(values.config)
  if (!project) {
    mapMsg.textContent = 'questa mappa non ha una configurazione salvata'
    return
  }
  app.append(frame.iframe)
  frame.open(project, true, null)
  window.addEventListener('pagehide', () => frame.dispose())
}
