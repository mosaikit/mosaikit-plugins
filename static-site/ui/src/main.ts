// UI del plugin Siti statici.
//
// Un sito e' uno zip con index.html. Il record CRUD (`sites`) ne conserva nome,
// descrizione e i dati del caricamento (zip, pagina iniziale, file, byte); i
// file stanno nell'area contenuti della risorsa (permesso `content`): l'host
// estrae lo zip con `msk.content.upload(id, zip)`, che sostituisce l'intero
// contenuto, e "Apri" chiede con `msk.content.url(id)` un URL temporaneo
// della pagina iniziale sull'origine dei contenuti, mostrato in un iframe
// sandboxato. Eliminando la riga il server elimina anche i file.
// Flussi: lista / nuovo (nome + zip) / modifica (nome e/o zip) / apri /
// condividi / elimina, nel rispetto di `my_level` di ogni riga
// (read = Apri; write = anche Modifica; manage = anche Condividi ed Elimina).

import '@mosaikit/plugin-api/style.css'
import './sites.css'
import { connect, type Msk, type Row, type SiteInfo } from '@mosaikit/plugin-api'
import { h, errText } from './dom.ts'
import { hasIndexHtml, zipEntryNames } from './zipnames.ts'

const RESOURCE = 'sites' // nome della risorsa nel manifest
const TITLE = 'Siti statici'
const NO_INDEX = 'lo zip non contiene un file index.html'

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
const hasSite = (r: Row) => !!valOf(r, 'entry')

function fmtSize(v: unknown): string {
  if (v === '' || v == null) return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (x: number) => (x < 10 ? '0' : '') + x
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function mount(msk: Msk) {
  const crud = msk.crud(RESOURCE)

  const state = {
    rows: [] as Row[],
    view: 'list' as View,
    editId: null as string | null, // id riga in edit/show; null = nuovo sito
    file: null as File | null, // zip scelto nel form
    filter: '',
    busy: false,
    siteUrl: '',
  }

  // ---------- DOM ----------

  const filter = h('input', { type: 'search', class: 'msk-filter', placeholder: 'Filtra…', 'aria-label': 'Filtra i siti' })
  const btnNew = h('button', { type: 'button', class: 'msk-btn' }, '＋ Nuovo sito')
  const rowcount = h('span', { class: 'msk-count' })
  const tbody = h('tbody')
  const listMsg = h('div', { class: 'msg', role: 'status' })
  const COLS = ['Nome', 'Pagina iniziale', 'File', 'Dimensione', 'Aggiornato', 'Proprietario', 'Azioni']
  const listView = h(
    'div',
    { class: 'listview' },
    h('h2', { class: 'msk-h2' }, TITLE),
    h('div', { class: 'msk-toolbar' }, filter, btnNew, h('span', { class: 'grow' }), rowcount),
    h('div', { class: 'msk-tablewrap' }, h('table', { class: 'msk-table' }, h('thead', {}, h('tr', {}, ...COLS.map((t) => h('th', {}, t)))), tbody)),
    listMsg,
  )

  const btnBack = h('button', { type: 'button', class: 'msk-btn ghost' }, '⬅ Lista siti')
  const svTitle = h('span', { class: 'sv-title' })
  const btnReload = h('button', { type: 'button', class: 'msk-btn ghost', title: 'Ricarica il sito' }, '↻ Ricarica')
  const aTab = h('a', { class: 'msk-btn ghost', target: '_blank', rel: 'noopener noreferrer', title: 'Apri in una nuova scheda' }, '↗ Nuova scheda')
  const btnModify = h('button', { type: 'button', class: 'msk-btn ghost' }, '✏ Modifica')
  const showOnly = h('span', { class: 'show-only' }, btnReload, aTab, btnModify)

  const inName = h('input', { id: 'msks-name', type: 'text', placeholder: 'es. Documentazione progetto' })
  const inDesc = h('textarea', { id: 'msks-desc', rows: '3', placeholder: 'A cosa serve il sito (facoltativo)' })
  const inZip = h('input', { type: 'file', accept: '.zip,application/zip,application/x-zip-compressed' })
  const fname = h('span', { class: 'fname' })
  const drop = h(
    'label',
    { class: 'drop' },
    inZip,
    h('span', { class: 'big' }, '📦'),
    fname,
    h('span', { class: 'sub' }, 'trascina qui lo zip oppure clicca per sceglierlo'),
  )
  const zipReq = h('b', { class: 'req' }, '*')
  const zipHint = h('div', { class: 'hint' })
  const btnSave = h('button', { type: 'button', class: 'msk-btn' }, '💾 Salva')
  const btnCancel = h('button', { type: 'button', class: 'msk-btn ghost' }, 'Annulla')
  const formMsg = h('div', { class: 'msg', role: 'status' })
  const siteForm = h(
    'div',
    { class: 'siteform' },
    h('div', { class: 'frow required' }, h('label', { for: 'msks-name' }, 'Nome ', h('b', { class: 'req' }, '*')), inName),
    h('div', { class: 'frow' }, h('label', { for: 'msks-desc' }, 'Descrizione'), inDesc),
    h('div', { class: 'frow' }, h('label', {}, 'Archivio zip ', zipReq), drop, zipHint),
    h('div', { class: 'form-actions' }, btnSave, btnCancel),
    formMsg,
  )
  const sframe = h('iframe', {
    class: 'sframe',
    title: 'Sito statico',
    sandbox: 'allow-scripts allow-forms allow-popups allow-modals allow-downloads',
  })

  const siteView = h('div', { class: 'siteview' }, h('div', { class: 'editbar' }, btnBack, svTitle, h('span', { class: 'grow' }), showOnly), siteForm, sframe)

  app.classList.add('msks')
  app.replaceChildren(listView, siteView)

  function msg(t: string, which: 'list' | 'form' = 'list', isErr = false) {
    const m = which === 'form' ? formMsg : listMsg
    m.textContent = t
    m.classList.toggle('err', isErr)
  }
  const findRow = (id: string | null) => (id == null ? undefined : state.rows.find((r) => r.id === id))

  // ---------- lista ----------

  function renderRows() {
    const f = state.filter.trim().toLowerCase()
    const shown = state.rows.filter((r) => {
      if (!f) return true
      return [valOf(r, 'name'), valOf(r, 'description'), valOf(r, 'entry'), valOf(r, 'zip_name'), r.owner_name ?? ''].some((v) =>
        v.toLowerCase().includes(f),
      )
    })
    rowcount.textContent = shown.length + (shown.length === 1 ? ' sito' : ' siti')
    if (!shown.length) {
      tbody.replaceChildren(
        h(
          'tr',
          {},
          h('td', { class: 'empty', colspan: String(COLS.length) }, state.rows.length ? 'nessun sito corrisponde al filtro' : 'nessun sito: caricane uno con ＋ Nuovo sito'),
        ),
      )
      return
    }
    tbody.replaceChildren(
      ...shown.map((r) => {
        const ok = hasSite(r)
        const nameCell = h('td', {})
        if (ok) {
          const a = h('a', { class: 'open', href: '#', title: 'Apri il sito' }, valOf(r, 'name'))
          a.addEventListener('click', (ev) => {
            ev.preventDefault()
            void openShow(r.id)
          })
          nameCell.append(a)
        } else nameCell.append(valOf(r, 'name'))
        if (r.shared) nameCell.append(h('span', { class: 'msk-badge acc' }, 'condivisa'))
        if (r.my_level === 'read') nameCell.append(h('span', { class: 'msk-badge' }, 'sola lettura'))
        if (valOf(r, 'description')) nameCell.title = valOf(r, 'description')

        const acts = h('td', { class: 'rowacts' })
        const btn = (label: string, cls: string, fn: () => void, disabled = false) => {
          const b = h('button', { type: 'button', class: 'msk-btn mini ' + cls, disabled }, label)
          b.addEventListener('click', fn)
          acts.append(b)
        }
        btn('👁 Apri', 'ghost', () => void openShow(r.id), !ok)
        if (canWrite(r)) btn('✏ Modifica', 'ghost', () => openEdit(r.id))
        if (canManage(r)) btn('👥 Condividi', 'ghost', () => void share(r.id))
        if (canManage(r)) btn('🗑 Elimina', 'danger', () => void del(r.id))

        return h(
          'tr',
          { class: 'data-row' },
          nameCell,
          h('td', { class: 'mono', title: valOf(r, 'zip_name') }, ok ? valOf(r, 'entry') : 'zip da caricare'),
          h('td', { class: 'num' }, valOf(r, 'files') || '—'),
          h('td', { class: 'num' }, valOf(r, 'size') ? fmtSize(r.values.size) : '—'),
          h('td', { class: 'num' }, fmtDate(r.updated_at)),
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

  // ---------- cambio vista ----------

  function showView(view: View) {
    state.view = view
    listView.hidden = view !== 'list'
    siteView.hidden = view === 'list'
    siteForm.hidden = view !== 'edit'
    sframe.hidden = view !== 'show'
    showOnly.hidden = view !== 'show'
    const row = findRow(state.editId)
    btnModify.hidden = !row || !canWrite(row)
    if (view !== 'show') {
      sframe.src = 'about:blank'
      state.siteUrl = ''
      aTab.removeAttribute('href')
    }
  }

  function setFile(file: File | null | undefined) {
    state.file = file ?? null
    fname.textContent = state.file ? `${state.file.name} (${fmtSize(state.file.size)})` : ''
  }

  function setBusy(b: boolean) {
    state.busy = b
    btnSave.disabled = b
    btnCancel.disabled = b
    btnBack.disabled = b
  }

  function code(t: string) {
    return h('code', {}, t)
  }

  function openEdit(id: string | null) {
    const row = id != null ? findRow(id) : undefined
    if (row && !canWrite(row)) return
    state.editId = row ? row.id : null
    svTitle.textContent = row ? 'Modifica: ' + valOf(row, 'name') : 'Nuovo sito'
    inName.value = row ? valOf(row, 'name') : ''
    inDesc.value = row ? valOf(row, 'description') : ''
    inZip.value = ''
    setFile(null)
    const current = !!row && hasSite(row)
    zipReq.hidden = current
    if (current) {
      zipHint.replaceChildren(
        'Lascia vuoto per mantenere il sito attuale (',
        code(valOf(row, 'zip_name') || valOf(row, 'entry')),
        `, ${valOf(row, 'files') || '?'} file). Un nuovo zip sostituisce tutti i file del sito.`,
      )
    } else {
      zipHint.replaceChildren(
        'Lo zip deve contenere un ',
        code('index.html'),
        ', anche dentro una cartella: viene usato quello meno annidato. Usa link relativi (',
        code('css/style.css'),
        ', non ',
        code('/css/style.css'),
        ').',
      )
    }
    msg('', 'form')
    setBusy(false)
    showView('edit')
    inName.focus()
  }

  async function openShow(id: string) {
    const row = findRow(id)
    if (!row) return
    if (!hasSite(row)) {
      msg('questo sito non ha file' + (canWrite(row) ? ': usa Modifica per caricare lo zip' : ''), 'list', true)
      return
    }
    msg('')
    try {
      // URL temporaneo sull'origine dei contenuti: l'iframe non ha credenziali
      const url = await msk.content.url(id)
      state.editId = id
      svTitle.textContent = valOf(row, 'name')
      showView('show')
      state.siteUrl = url
      sframe.src = url
      aTab.href = url
    } catch (e) {
      msg('impossibile aprire il sito: ' + errText(e), 'list', true)
    }
  }

  /** Ricarica con un URL nuovo: quello vecchio potrebbe essere scaduto. */
  async function reload() {
    if (state.view !== 'show' || state.editId == null) return
    try {
      const url = await msk.content.url(state.editId)
      state.siteUrl = url
      aTab.href = url
    } catch {
      /* si riprova con l'URL che c'e' */
    }
    if (state.siteUrl) sframe.src = state.siteUrl
  }

  function backToList() {
    if (state.busy) return
    showView('list')
  }

  // ---------- azioni ----------

  function infoValues(file: File, info: SiteInfo) {
    return { zip_name: file.name, entry: info.entry || '', files: Number(info.files) || 0, size: Number(info.size) || 0 }
  }

  async function save() {
    if (state.busy) return
    msg('', 'form')
    const name = inName.value.trim()
    const description = inDesc.value
    const file = state.file
    const row = state.editId != null ? findRow(state.editId) : undefined
    if (!name) return msg("il nome e' obbligatorio", 'form', true)
    if (!file && !(row && hasSite(row))) return msg('scegli lo zip con il sito', 'form', true)
    if (file && !/\.zip$/i.test(file.name)) return msg('il file deve essere un .zip', 'form', true)

    setBusy(true)
    try {
      // Controllo preventivo sui nomi dello zip: un caricamento senza
      // index.html sostituirebbe i file di un sito esistente.
      if (file) {
        const names = await zipEntryNames(file)
        if (names && !hasIndexHtml(names)) throw new Error(NO_INDEX)
        msg(`caricamento ed estrazione di ${file.name}…`, 'form')
      } else msg('salvataggio…', 'form')

      if (!row) {
        // nuovo: prima la riga, poi il contenuto; se il contenuto non va,
        // la riga appena creata si elimina (niente siti vuoti)
        const created = await crud.create({ name, description })
        try {
          const info = await msk.content.upload(created.id, file!)
          if (!info.entry) throw new Error(NO_INDEX)
          await crud.update(created.id, infoValues(file!, info))
        } catch (e) {
          await crud.remove(created.id).catch(() => {})
          throw e
        }
      } else if (file) {
        // stesso id: il nuovo zip sostituisce l'intero contenuto
        const info = await msk.content.upload(row.id, file)
        await crud.update(row.id, { name, description, ...infoValues(file, info) })
        if (!info.entry) {
          await load()
          throw new Error(NO_INDEX + ': il sito va ricaricato con uno zip valido')
        }
      } else {
        await crud.update(row.id, { name, description })
      }
      setBusy(false)
      showView('list')
      msg(row ? 'sito aggiornato' : 'sito creato')
      await load()
    } catch (e) {
      setBusy(false)
      msg(errText(e), 'form', true)
    }
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
    if (!(await msk.confirm(`Eliminare il sito "${valOf(row, 'name')}" e tutti i suoi file?`))) return
    msg('')
    try {
      // il server elimina anche il contenuto
      await crud.remove(id)
      msg('sito eliminato')
      await load()
    } catch (e) {
      msg(errText(e), 'list', true)
    }
  }

  // ---------- eventi ----------

  filter.addEventListener('input', () => {
    state.filter = filter.value
    renderRows()
  })
  btnNew.addEventListener('click', () => openEdit(null))
  btnBack.addEventListener('click', backToList)
  btnCancel.addEventListener('click', backToList)
  btnSave.addEventListener('click', () => void save())
  btnModify.addEventListener('click', () => openEdit(state.editId))
  btnReload.addEventListener('click', () => void reload())
  inName.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') void save()
  })
  inZip.addEventListener('change', () => setFile(inZip.files?.[0]))

  drop.addEventListener('dragover', (ev) => {
    ev.preventDefault()
    drop.classList.add('over')
  })
  drop.addEventListener('dragleave', () => drop.classList.remove('over'))
  drop.addEventListener('drop', (ev) => {
    ev.preventDefault()
    drop.classList.remove('over')
    const f = ev.dataTransfer?.files?.[0]
    if (f) setFile(f)
  })

  // ---------- avvio ----------

  showView('list')
  void load()
}
