// View of the public links of a map: title and GeoLibre read only
// (`layout=viewer`), which restores the saved project. No saving: the state
// bridge is used only for the restore (onChange = null).

import '@mosaikit/plugin-api/style.css'
import './maps.css'
import { connect, type Msk, type PublicResource } from '@mosaikit/plugin-api'
import { h, errText } from './dom.ts'
import { followHost, t } from './i18n.ts'
import { MapFrame, parseProject } from './mapframe.ts'

const app = document.getElementById('app')!
app.classList.add('mskm', 'public')

connect()
  .then(mount)
  .catch((e) => {
    app.textContent = t('Could not open the map: {error}', { error: errText(e) })
  })

async function mount(msk: Msk) {
  followHost(msk)
  let res: PublicResource | undefined = msk.publicResource
  if (!res?.values) res = await msk.publicGet()
  const values = res?.values ?? {}
  const name = (values.name == null ? '' : String(values.name)) || res?.title || t('Map')
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
    mapMsg.textContent = t('this map has no saved configuration')
    return
  }
  app.append(frame.iframe)
  frame.open(project, true, null)
  window.addEventListener('pagehide', () => frame.dispose())
}
