// UI del plugin Mappe: catalogo di mappe GeoLibre.
//
// CRUD di mappe GeoLibre con lo stesso schema di Sestante (screens/Editor.tsx).
// L'iframe GeoLibre e il ponte di stato (fasi probing/restoring/live, guardia
// dopo il ripristino) stanno in `mapframe.ts`, condiviso con la vista pubblica.
//
// ── Persistenza ─────────────────────────────────────────────────────────────
// Come in Sestante la mappa si crea subito ("Mappa senza titolo") e poi si
// salva da sola: ogni snapshot `live` va nel campo `config` con 1 s di
// accorpamento, nome e descrizione con 700 ms. L'aggiornamento CRUD e'
// parziale (si fonde con i valori esistenti), ma ogni salvataggio porta
// comunque nome, descrizione e config: l'ultimo scritto e' sempre lo stato
// completo dell'editor. Il campo `layers` lo calcola il server dalla config.
//
// ── File GeoJSON ────────────────────────────────────────────────────────────
// Per i livelli aperti dal selettore di file *di GeoLibre*, il ponte scarta la
// geometria (`metadata.localFileReloadable`): alla riapertura la mappa sarebbe
// vuota. I file si aggiungono quindi da qui, come livello `type: "geojson"`
// con la geometria incorporata nel progetto (tetto 4 MB). Il modo "per URL" di
// Sestante qui non si usa: gli URL temporanei di Mosaikit scadono e GeoLibre
// hosted in https non puo' leggere da un Mosaikit in http (mixed content).
//
// ── Permessi ────────────────────────────────────────────────────────────────
// Ogni riga porta `my_level`: read = solo Apri; write = anche Modifica;
// manage = anche Condividi ed Elimina.

import '@mosaikit/plugin-api/style.css'
import './maps.css'
import { connect, type Msk, type Row } from '@mosaikit/plugin-api'
import { h, errText } from './dom.ts'
import { MapFrame, parseProject, type Project } from './mapframe.ts'

const RESOURCE = 'maps' // nome della risorsa nel manifest
const TITLE = 'Mappe'
const UNTITLED = 'Mappa senza titolo'

const PROJECT_SAVE_DELAY_MS = 1000
const META_SAVE_DELAY_MS = 700
const INLINE_MAX_BYTES = 4 * 1024 * 1024

const app = document.getElementById('app')!

connect()
  .then(mount)
  .catch((e) => {
    app.textContent = 'Impossibile avviare la UI del plugin: ' + errText(e)
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

// ---------- dati GeoJSON ----------

const GEOJSON_TYPES = [
  'FeatureCollection', 'Feature', 'GeometryCollection', 'Point', 'MultiPoint',
  'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon',
]

function isGeoJson(v: unknown): boolean {
  return !!v && typeof v === 'object' && typeof (v as { type?: unknown }).type === 'string' && GEOJSON_TYPES.includes((v as { type: string }).type)
}

/**
 * Livello GeoLibre da un GeoJSON. `type` deve valere esattamente "geojson"
 * (non il tipo geometrico): altrimenti il livello compare in legenda ma non
 * viene mai disegnato. `metadata` resta vuoto di proposito: i contrassegni
 * `localFileReloadable`/`externalNativeLayer` farebbero scartare la geometria.
 * Lo stile e' minimo: GeoLibre completa il resto alla normalizzazione.
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
  const crud = msk.crud(RESOURCE)

  const state = {
    rows: [] as Row[],
    view: 'list' as View,
    filter: '',
  }

  // ---------- DOM ----------

  const filter = h('input', { type: 'search', class: 'msk-filter', placeholder: 'Filtra…', 'aria-label': 'Filtra le mappe' })
  const btnNew = h('button', { type: 'button', class: 'msk-btn' }, '＋ Nuova mappa')
  const rowcount = h('span', { class: 'msk-count' })
  const tbody = h('tbody')
  const listMsg = h('div', { class: 'msg', role: 'status' })
  const listView = h(
    'div',
    { class: 'listview' },
    h('h2', { class: 'msk-h2' }, TITLE),
    h('div', { class: 'msk-toolbar' }, filter, btnNew, h('span', { class: 'grow' }), rowcount),
    h(
      'div',
      { class: 'msk-tablewrap' },
      h(
        'table',
        { class: 'msk-table' },
        h('thead', {}, h('tr', {}, ...['Nome', 'Descrizione', 'Livelli', 'Config', 'Proprietario', 'Azioni'].map((t) => h('th', {}, t)))),
        tbody,
      ),
    ),
    listMsg,
  )

  const btnBack = h('button', { type: 'button', class: 'msk-btn ghost' }, '⬅ Lista mappe')
  const mvTitle = h('span', { class: 'mv-title' })
  const mvName = h('input', { type: 'text', class: 'mv-name', placeholder: 'Nome della mappa', spellcheck: 'false', 'aria-label': 'Nome della mappa' })
  const mvDesc = h('input', { type: 'text', class: 'mv-desc', placeholder: 'Descrizione', 'aria-label': 'Descrizione' })
  const saved = h('span', { class: 'saved', role: 'status' })
  const bstatus = h('span', { class: 'bstatus' })
  const btnAddData = h('button', { type: 'button', class: 'msk-btn ghost', title: 'Aggiunge un file GeoJSON come livello salvato con la mappa' }, '＋ Aggiungi dati')
  const fileInput = h('input', { type: 'file', accept: '.geojson,.json,application/geo+json,application/json', hidden: true })
  const btnModify = h('button', { type: 'button', class: 'msk-btn ghost' }, '✏ Modifica questa mappa')
  const editHint = h(
    'div',
    { class: 'hint' },
    'Le modifiche si salvano da sole. Per aggiungere un file GeoJSON usa ',
    h('b', {}, '＋ Aggiungi dati'),
    ': i livelli aperti dal selettore di file di GeoLibre non vengono salvati con la mappa.',
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

  // ---------- editor: salvataggio automatico ----------

  const ed = {
    id: null as string | null,
    name: '',
    description: '',
    project: null as Project | null, // progetto da scrivere nel campo config
    pending: false, // modifica non ancora scritta sul server
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
    inflight: null as Promise<void> | null, // promessa del salvataggio in corso
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
   * Scrive la modifica in sospeso. I salvataggi sono in fila: un update alla
   * volta, cosi' una risposta lenta non puo' sovrascrivere uno stato piu' nuovo.
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
    setSaved('salvataggio…')
    ed.inflight = crud.update(id, values).then(
      (row) => {
        ed.inflight = null
        // la riga locale segue il server (anche `layers`, ricalcolato)
        const i = state.rows.findIndex((r) => r.id === id)
        if (i !== -1) state.rows[i] = row
        if (ed.id === id) setSaved(ed.pending ? 'salvataggio…' : '✓ salvato')
      },
      (e: unknown) => {
        ed.inflight = null
        ed.pending = true // si ritenta al prossimo cambiamento o all'uscita
        if (ed.id === id) setSaved('salvataggio non riuscito: ' + errText(e), true)
        throw e
      },
    )
    return ed.inflight
  }

  function onProjectChange(project: Project) {
    ed.project = project
    scheduleSave(PROJECT_SAVE_DELAY_MS)
  }

  // ---------- lista ----------

  function cfgSize(row: Row): string {
    const n = valOf(row, 'config').length
    if (!n) return '—'
    return n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB'
  }

  function layerCount(row: Row): string {
    if (!valOf(row, 'config').trim()) return '—'
    const n = row.values.layers
    if (typeof n === 'number' && Number.isFinite(n)) return String(n)
    // fallback: righe senza `layers` calcolato dal server
    const p = parseProject(row.values.config)
    return p && Array.isArray(p.layers) ? String(p.layers.length) : '—'
  }

  function renderRows() {
    const f = state.filter.trim().toLowerCase()
    const shown = state.rows.filter((r) => {
      if (!f) return true
      return [valOf(r, 'name'), valOf(r, 'description'), r.owner_name ?? ''].some((v) => v.toLowerCase().includes(f))
    })
    rowcount.textContent = shown.length === 1 ? '1 mappa' : shown.length + ' mappe'
    if (!shown.length) {
      tbody.replaceChildren(
        h('tr', {}, h('td', { class: 'empty', colspan: '6' }, state.rows.length ? 'nessuna mappa corrisponde al filtro' : 'nessuna mappa: creane una con ＋ Nuova mappa')),
      )
      return
    }
    tbody.replaceChildren(
      ...shown.map((r) => {
        const hasCfg = !!valOf(r, 'config').trim()
        const nameCell = h('td', {}, valOf(r, 'name'))
        if (r.shared) nameCell.append(h('span', { class: 'msk-badge acc' }, 'condivisa'))
        if (r.my_level === 'read') nameCell.append(h('span', { class: 'msk-badge' }, 'sola lettura'))

        const acts = h('td', { class: 'rowacts' })
        const btn = (label: string, cls: string, fn: () => void, disabled = false) => {
          const b = h('button', { type: 'button', class: 'msk-btn mini ' + cls, disabled }, label)
          b.addEventListener('click', fn)
          acts.append(b)
        }
        btn('👁 Apri', 'ghost', () => openShow(r.id), !hasCfg)
        if (canWrite(r)) btn('✏ Modifica', 'ghost', () => openEdit(r.id))
        if (canManage(r)) btn('👥 Condividi', 'ghost', () => void share(r.id))
        if (canManage(r)) btn('🗑 Elimina', 'danger', () => void del(r.id))

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

  // ---------- viste ----------

  function showView(view: View) {
    state.view = view
    const isList = view === 'list'
    const isShow = view === 'show'
    const row = findRow(ed.id)
    listView.hidden = !isList
    mapView.hidden = isList
    app.classList.toggle('show', isShow)
    mvTitle.hidden = !isShow
    mvName.hidden = isShow
    mvDesc.hidden = isShow
    saved.hidden = isShow
    btnAddData.hidden = isShow
    editHint.hidden = isShow
    // "Modifica questa mappa" solo a chi puo' scrivere
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
    setSaved('✓ salvato')
    if (valOf(row, 'config').trim() && !project) {
      msg("la configurazione salvata non e' JSON valido: la mappa si apre vuota, e al primo salvataggio verra' sostituita", 'map', true)
    } else msg('', 'map')
    showView('edit')
    frame.open(project, false, onProjectChange)
  }

  function openShow(id: string) {
    const row = findRow(id)
    if (!row) return
    const project = parseProject(row.values.config)
    if (!project) {
      msg('questa mappa non ha una configurazione salvata' + (canWrite(row) ? ': usa Modifica' : ''), 'list', true)
      return
    }
    ed.id = id
    ed.pending = false
    mvTitle.textContent = valOf(row, 'name')
    msg('', 'map')
    showView('show')
    // Sola lettura: nessun salvataggio.
    frame.open(project, true, null)
  }

  /** Crea subito la mappa, come Sestante, e apre l'editor. */
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

  /** Alla chiusura la modifica in sospeso va scritta, non buttata. */
  async function backToList() {
    const leave = () => {
      frame.close()
      ed.id = null
      showView('list')
      return load()
    }
    if (state.view !== 'edit') return leave()
    frame.close() // nessuno snapshot nuovo mentre si salva
    try {
      await flush()
    } catch (e) {
      const ok = await msk.confirm(`Salvataggio non riuscito (${errText(e)}).\nTornare comunque alla lista perdendo le ultime modifiche?`)
      if (ok) {
        ed.pending = false
        return leave()
      }
      // Si resta nell'editor: si riapre la mappa dall'ultimo stato noto.
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
    if (!(await msk.confirm(`Eliminare la mappa "${valOf(row, 'name')}"?`))) return
    msg('')
    try {
      await crud.remove(id)
      msg('mappa eliminata')
      await load()
    } catch (e) {
      msg(errText(e), 'list', true)
    }
  }

  // ---------- dati GeoJSON ----------

  async function onFileChosen(file: File | undefined) {
    if (!file || state.view !== 'edit') return
    msg('', 'map')
    if (frame.phase !== 'live') {
      msg("la mappa non e' ancora pronta: riprova fra un istante", 'map', true)
      return
    }
    if (file.size > INLINE_MAX_BYTES) {
      msg("file troppo grande: oltre 4 MB la geometria non puo' essere salvata dentro la mappa", 'map', true)
      return
    }
    btnAddData.disabled = true
    try {
      const text = await file.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        msg("il file non e' JSON valido", 'map', true)
        return
      }
      if (!isGeoJson(parsed)) {
        msg("il file non e' un GeoJSON", 'map', true)
        return
      }
      const label = file.name.replace(/\.[^.]+$/, '') || file.name
      if (!frame.addLayer(buildLayer(newLayerId(), label, parsed))) {
        msg("la mappa non e' ancora pronta: riprova fra un istante", 'map', true)
        return
      }
      msg(`livello "${label}" aggiunto`, 'map')
    } catch (e) {
      msg(errText(e), 'map', true)
    } finally {
      btnAddData.disabled = false
      // Senza questo, riscegliere lo stesso file non emette `change`.
      fileInput.value = ''
    }
  }

  // ---------- eventi ----------

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

  // Chiusura della pagina (l'host smonta l'iframe o si naviga altrove): si
  // tenta di scrivere la modifica in sospeso e si stacca il ponte GeoLibre.
  window.addEventListener('pagehide', () => {
    flush().catch(() => {})
    frame.dispose()
  })

  // ---------- avvio ----------

  showView('list')
  void load()
}
