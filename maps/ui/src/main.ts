// UI of the Maps plugin: catalog of GeoLibre maps.
//
// CRUD of GeoLibre maps with the same scheme as Sestante (screens/Editor.tsx).
// The GeoLibre iframe and the state bridge (probing/restoring/live phases, guard
// after the restore) are in `mapframe.ts`, shared with the public view.
//
// ── Persistence ─────────────────────────────────────────────────────────────
// As in Sestante the map is created at once ("Untitled map") and then saves
// itself: every `live` snapshot goes into the `config` field with 1 s of
// batching, name and description with 700 ms. The CRUD update is partial (it
// merges with the existing values), but every save carries name, description
// and config anyway: the last one written is always the whole state of the
// editor. The server computes the `layers` field from the config.
//
// ── GeoJSON files ───────────────────────────────────────────────────────────
// For the layers opened from the file picker *of GeoLibre*, the bridge drops the
// geometry (`metadata.localFileReloadable`): when opened again the map would be
// empty. So files are added from here, as a `type: "geojson"` layer with the
// geometry embedded in the project (ceiling 4 MB). The "by URL" way of Sestante
// is not used here: the temporary URLs of Mosaikit expire, and GeoLibre hosted
// on https cannot read from a Mosaikit on http (mixed content).
//
// ── Permissions ─────────────────────────────────────────────────────────────
// Every row carries `my_level`: read = Open only; write = also Edit;
// manage = also Share and Delete.

import '@mosaikit/plugin-api/style.css'
import './maps.css'
import { connect, pageBody, pageHead, type Msk, type Row } from '@mosaikit/plugin-api'
import { h, errText } from './dom.ts'
import { followHost, t } from './i18n.ts'
import { MapFrame, parseProject, type Project } from './mapframe.ts'

const RESOURCE = 'maps' // name of the resource in the manifest

const PROJECT_SAVE_DELAY_MS = 1000
const META_SAVE_DELAY_MS = 700
const INLINE_MAX_BYTES = 4 * 1024 * 1024

const app = document.getElementById('app')!

connect()
  .then(mount)
  .catch((e) => {
    app.textContent = t('Could not start the UI of the plugin: {error}', { error: errText(e) })
  })

type View = 'list' | 'edit' | 'show'

function valOf(row: Row | undefined | null, k: string): string {
  const v = row?.values ? row.values[k] : null
  return v == null ? '' : String(v)
}
const canWrite = (r: Row) => r.my_level === 'write' || r.my_level === 'manage'
const canManage = (r: Row) => r.my_level === 'manage'

function newLayerId(): string {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID()
  return 'lyr-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

// ---------- GeoJSON data ----------

const GEOJSON_TYPES = [
  'FeatureCollection', 'Feature', 'GeometryCollection', 'Point', 'MultiPoint',
  'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon',
]

function isGeoJson(v: unknown): boolean {
  return !!v && typeof v === 'object' && typeof (v as { type?: unknown }).type === 'string' && GEOJSON_TYPES.includes((v as { type: string }).type)
}

/**
 * GeoLibre layer from a GeoJSON. `type` must be exactly "geojson" (not the
 * geometry type): otherwise the layer shows in the legend but is never drawn.
 * `metadata` stays empty on purpose: the `localFileReloadable`/`externalNativeLayer`
 * marks would make the geometry be dropped. The style is minimal: GeoLibre
 * completes the rest when normalizing.
 */
function buildLayer(id: string, name: string, geojson: unknown) {
  return {
    id,
    name,
    type: 'geojson',
    source: { type: 'geojson' },
    geojson,
    visible: true,
    opacity: 1,
    style: {
      minZoom: 0,
      maxZoom: 24,
      fillColor: '#3b82f6',
      strokeColor: '#1e40af',
      strokeWidth: 2,
      fillOpacity: 0.6,
      circleRadius: 6,
    },
    metadata: {},
  }
}

function mount(msk: Msk) {
  followHost(msk)
  const crud = msk.crud(RESOURCE)
  const UNTITLED = t('Untitled map')

  const state = {
    rows: [] as Row[],
    view: 'list' as View,
    filter: '',
  }

  // ---------- DOM ----------

  const filter = h('input', { type: 'search', class: 'msk-filter', placeholder: t('Filter…'), 'aria-label': t('Filter the maps') })
  const btnNew = h('button', { type: 'button', class: 'msk-btn' }, t('＋ New map'))
  const rowcount = h('span', { class: 'msk-count' })
  const tbody = h('tbody')
  const listMsg = h('div', { class: 'msg', role: 'status' })
  const listView = h(
    'div',
    { class: 'listview' },
    // the header and the filter never scroll (the same header as the pages of Mosaikit); the table does
    pageHead({ title: t('Maps'), sub: rowcount, actions: [btnNew], filters: [filter] }),
    pageBody(
      h(
        'div',
        { class: 'msk-tablewrap' },
        h(
          'table',
          { class: 'msk-table' },
          h('thead', {}, h('tr', {}, ...['Name', 'Description', 'Layers', 'Config', 'Owner', 'Actions'].map((c) => h('th', {}, t(c))))),
          tbody,
        ),
      ),
      listMsg,
    ),
  )

  const btnBack = h('button', { type: 'button', class: 'msk-btn ghost' }, t('⬅ List of maps'))
  const mvTitle = h('span', { class: 'mv-title' })
  const mvName = h('input', { type: 'text', class: 'mv-name', placeholder: t('Name of the map'), spellcheck: 'false', 'aria-label': t('Name of the map') })
  const mvDesc = h('input', { type: 'text', class: 'mv-desc', placeholder: t('Description'), 'aria-label': t('Description') })
  const saved = h('span', { class: 'saved', role: 'status' })
  const bstatus = h('span', { class: 'bstatus' })
  const btnAddData = h('button', { type: 'button', class: 'msk-btn ghost', title: t('Adds a GeoJSON file as a layer saved with the map') }, t('＋ Add data'))
  const fileInput = h('input', { type: 'file', accept: '.geojson,.json,application/geo+json,application/json', hidden: true })
  const btnModify = h('button', { type: 'button', class: 'msk-btn ghost' }, t('✏ Edit this map'))
  const editHint = h(
    'div',
    { class: 'hint' },
    t('The changes save themselves. To add a GeoJSON file use '),
    h('b', {}, t('＋ Add data')),
    t(': the layers opened from the file picker of GeoLibre are not saved with the map.'),
  )
  const mapMsg = h('div', { class: 'msg map-msg', role: 'status' })

  const frame = new MapFrame({
    onStatus: (t) => (bstatus.textContent = t),
    onError: (t) => msg(t, 'map', true),
  })

  const mapView = h(
    'div',
    { class: 'mapview' },
    h('div', { class: 'editbar' }, btnBack, mvTitle, mvName, mvDesc, saved, h('span', { class: 'grow' }), bstatus, btnAddData, fileInput, btnModify),
    editHint,
    mapMsg,
    frame.iframe,
  )

  app.classList.add('mskm')
  app.replaceChildren(listView, mapView)

  function msg(t: string, which: 'list' | 'map' = 'list', isErr = false) {
    const m = which === 'map' ? mapMsg : listMsg
    m.textContent = t || ''
    m.classList.toggle('err', isErr)
  }
  const findRow = (id: string | null) => (id == null ? undefined : state.rows.find((r) => r.id === id))

  // ---------- editor: automatic saving ----------

  const ed = {
    id: null as string | null,
    name: '',
    description: '',
    project: null as Project | null, // project to write in the config field
    pending: false, // change not written to the server yet
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
    inflight: null as Promise<void> | null, // promise of the save in progress
  }

  function setSaved(text: string, isErr = false) {
    saved.textContent = text || ''
    saved.classList.toggle('err', isErr)
  }

  function scheduleSave(delay: number) {
    if (ed.id == null) return
    ed.pending = true
    clearTimeout(ed.timer)
    ed.timer = setTimeout(() => {
      flush().catch(() => {})
    }, delay)
  }

  /**
   * Writes the pending change. The saves are queued: one update at a time, so a
   * slow answer cannot overwrite a newer state.
   */
  function flush(): Promise<void> {
    clearTimeout(ed.timer)
    if (ed.inflight) {
      return ed.inflight.then(() => (ed.pending ? flush() : undefined))
    }
    if (!ed.pending || ed.id == null) return Promise.resolve()
    ed.pending = false
    const id = ed.id
    const values = {
      name: ed.name.trim() || UNTITLED,
      description: ed.description,
      config: ed.project ? JSON.stringify(ed.project) : '',
    }
    setSaved(t('saving…'))
    ed.inflight = crud.update(id, values).then(
      (row) => {
        ed.inflight = null
        // the local row follows the server (`layers` too, computed again)
        const i = state.rows.findIndex((r) => r.id === id)
        if (i !== -1) state.rows[i] = row
        if (ed.id === id) setSaved(ed.pending ? t('saving…') : t('✓ saved'))
      },
      (e: unknown) => {
        ed.inflight = null
        ed.pending = true // tried again at the next change or when leaving
        if (ed.id === id) setSaved(t('saving failed: {error}', { error: errText(e) }), true)
        throw e
      },
    )
    return ed.inflight
  }

  function onProjectChange(project: Project) {
    ed.project = project
    scheduleSave(PROJECT_SAVE_DELAY_MS)
  }

  // ---------- list ----------

  function cfgSize(row: Row): string {
    const n = valOf(row, 'config').length
    if (!n) return '—'
    return n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB'
  }

  function layerCount(row: Row): string {
    if (!valOf(row, 'config').trim()) return '—'
    const n = row.values.layers
    if (typeof n === 'number' && Number.isFinite(n)) return String(n)
    // fallback: rows without `layers` computed by the server
    const p = parseProject(row.values.config)
    return p && Array.isArray(p.layers) ? String(p.layers.length) : '—'
  }

  function renderRows() {
    const f = state.filter.trim().toLowerCase()
    const shown = state.rows.filter((r) => {
      if (!f) return true
      return [valOf(r, 'name'), valOf(r, 'description'), r.owner_name ?? ''].some((v) => v.toLowerCase().includes(f))
    })
    rowcount.textContent = shown.length === 1 ? t('1 map') : t('{n} maps', { n: shown.length })
    if (!shown.length) {
      tbody.replaceChildren(
        h('tr', {}, h('td', { class: 'empty', colspan: '6' }, state.rows.length ? t('no map matches the filter') : t('no map: create one with ＋ New map'))),
      )
      return
    }
    tbody.replaceChildren(
      ...shown.map((r) => {
        const hasCfg = !!valOf(r, 'config').trim()
        const nameCell = h('td', {}, valOf(r, 'name'))
        if (r.shared) nameCell.append(h('span', { class: 'msk-badge acc' }, t('shared')))
        if (r.my_level === 'read') nameCell.append(h('span', { class: 'msk-badge' }, t('read only')))

        const acts = h('td', { class: 'rowacts' })
        const btn = (label: string, cls: string, fn: () => void, disabled = false) => {
          const b = h('button', { type: 'button', class: 'msk-btn mini ' + cls, disabled }, label)
          b.addEventListener('click', fn)
          acts.append(b)
        }
        btn(t('👁 Open'), 'ghost', () => openShow(r.id), !hasCfg)
        if (canWrite(r)) btn(t('✏ Edit'), 'ghost', () => openEdit(r.id))
        if (canManage(r)) btn(t('👥 Share'), 'ghost', () => void share(r.id))
        if (canManage(r)) btn(t('🗑 Delete'), 'danger', () => void del(r.id))

        return h(
          'tr',
          { class: 'data-row' },
          nameCell,
          h('td', { class: 'desc' }, valOf(r, 'description')),
          h('td', { class: 'cfg' }, layerCount(r)),
          h('td', { class: 'cfg' }, cfgSize(r)),
          h('td', { class: 'msk-owner' }, r.owner_name ?? ''),
          acts,
        )
      }),
    )
  }

  async function load() {
    try {
      const r = await crud.list()
      state.rows = r.rows || []
      renderRows()
    } catch (e) {
      msg(errText(e), 'list', true)
    }
  }

  // ---------- views ----------

  function showView(view: View) {
    state.view = view
    const isList = view === 'list'
    const isShow = view === 'show'
    const row = findRow(ed.id)
    listView.hidden = !isList
    mapView.hidden = isList
    app.classList.toggle('show', isShow)
    // the map (viewed or edited) fills the whole area under the header
    app.classList.toggle('full', !isList)
    mvTitle.hidden = !isShow
    mvName.hidden = isShow
    mvDesc.hidden = isShow
    saved.hidden = isShow
    btnAddData.hidden = isShow
    editHint.hidden = isShow
    // "Edit this map" only for whoever can write
    btnModify.hidden = !isShow || !row || !canWrite(row)
  }

  function openEdit(id: string) {
    const row = findRow(id)
    if (!row || !canWrite(row)) return
    const project = parseProject(row.values.config)
    ed.id = id
    ed.name = valOf(row, 'name')
    ed.description = valOf(row, 'description')
    ed.project = project
    ed.pending = false
    mvName.value = ed.name
    mvDesc.value = ed.description
    setSaved(t('✓ saved'))
    if (valOf(row, 'config').trim() && !project) {
      msg(t('the saved configuration is not valid JSON: the map opens empty, and the first save will replace it'), 'map', true)
    } else msg('', 'map')
    showView('edit')
    frame.open(project, false, onProjectChange)
  }

  function openShow(id: string) {
    const row = findRow(id)
    if (!row) return
    const project = parseProject(row.values.config)
    if (!project) {
      msg(canWrite(row) ? t('this map has no saved configuration: use Edit') : t('this map has no saved configuration'), 'list', true)
      return
    }
    ed.id = id
    ed.pending = false
    mvTitle.textContent = valOf(row, 'name')
    msg('', 'map')
    showView('show')
    // Read only: no saving.
    frame.open(project, true, null)
  }

  /** Creates the map at once, as Sestante does, and opens the editor. */
  async function createMap() {
    msg('')
    btnNew.disabled = true
    try {
      const row = await crud.create({ name: UNTITLED, description: '', config: '' })
      await load()
      if (!findRow(row.id)) state.rows.unshift(row)
      openEdit(row.id)
      mvName.focus()
      mvName.select()
    } catch (e) {
      msg(errText(e), 'list', true)
    } finally {
      btnNew.disabled = false
    }
  }

  /** When closing, the pending change is written, not thrown away. */
  async function backToList() {
    const leave = () => {
      frame.close()
      ed.id = null
      showView('list')
      return load()
    }
    if (state.view !== 'edit') return leave()
    frame.close() // no new snapshot while saving
    try {
      await flush()
    } catch (e) {
      const ok = await msk.confirm(t('Saving failed ({error}).\nGo back to the list anyway, losing the last changes?', { error: errText(e) }))
      if (ok) {
        ed.pending = false
        return leave()
      }
      // We stay in the editor: the map opens again from the last known state.
      frame.open(ed.project, false, onProjectChange)
      return
    }
    return leave()
  }

  async function share(id: string) {
    msg('')
    try {
      await msk.share(id)
    } catch (e) {
      msg(errText(e), 'list', true)
    }
    await load()
  }

  async function del(id: string) {
    const row = findRow(id)
    if (!row) return
    if (!(await msk.confirm(t('Delete the map "{name}"?', { name: valOf(row, 'name') })))) return
    msg('')
    try {
      await crud.remove(id)
      msg(t('map deleted'))
      await load()
    } catch (e) {
      msg(errText(e), 'list', true)
    }
  }

  // ---------- GeoJSON data ----------

  async function onFileChosen(file: File | undefined) {
    if (!file || state.view !== 'edit') return
    msg('', 'map')
    if (frame.phase !== 'live') {
      msg(t('the map is not ready yet: try again in a moment'), 'map', true)
      return
    }
    if (file.size > INLINE_MAX_BYTES) {
      msg(t('file too large: over 4 MB the geometry cannot be saved inside the map'), 'map', true)
      return
    }
    btnAddData.disabled = true
    try {
      const text = await file.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        msg(t('the file is not valid JSON'), 'map', true)
        return
      }
      if (!isGeoJson(parsed)) {
        msg(t('the file is not a GeoJSON'), 'map', true)
        return
      }
      const label = file.name.replace(/\.[^.]+$/, '') || file.name
      if (!frame.addLayer(buildLayer(newLayerId(), label, parsed))) {
        msg(t('the map is not ready yet: try again in a moment'), 'map', true)
        return
      }
      msg(t('layer "{name}" added', { name: label }), 'map')
    } catch (e) {
      msg(errText(e), 'map', true)
    } finally {
      btnAddData.disabled = false
      // Without this, choosing the same file again does not emit `change`.
      fileInput.value = ''
    }
  }

  // ---------- events ----------

  filter.addEventListener('input', () => {
    state.filter = filter.value
    renderRows()
  })
  btnNew.addEventListener('click', () => void createMap())
  btnBack.addEventListener('click', () => void backToList())
  btnModify.addEventListener('click', () => {
    if (ed.id != null) openEdit(ed.id)
  })
  btnAddData.addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', () => void onFileChosen(fileInput.files?.[0]))
  mvName.addEventListener('input', () => {
    ed.name = mvName.value
    scheduleSave(META_SAVE_DELAY_MS)
  })
  mvDesc.addEventListener('input', () => {
    ed.description = mvDesc.value
    scheduleSave(META_SAVE_DELAY_MS)
  })

  // The page closes (the host removes the iframe, or one goes elsewhere): we
  // try to write the pending change and detach the GeoLibre bridge.
  window.addEventListener('pagehide', () => {
    flush().catch(() => {})
    frame.dispose()
  })

  // ---------- start ----------

  showView('list')
  void load()
}
