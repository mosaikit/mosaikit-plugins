// UI of the Static sites plugin.
//
// A site is a zip with an index.html. The CRUD record (`sites`) keeps its name,
// description and the data of the upload (zip, start page, files, bytes); the
// files are in the content area of the resource (permission `content`): the host
// extracts the zip with `msk.content.upload(id, zip)`, which replaces the whole
// content, and "Open" asks with `msk.content.url(id)` for a temporary URL of the
// start page on the origin of the contents, shown in a sandboxed iframe.
// Deleting the row, the server deletes the files too.
// Flows: list / new (name + zip) / edit (name and/or zip) / open / share /
// delete, respecting the `my_level` of every row
// (read = Open; write = also Edit; manage = also Share and Delete).

import '@mosaikit/plugin-api/style.css'
import './sites.css'
import { connect, type Msk, type Row, type SiteInfo } from '@mosaikit/plugin-api'
import { h, errText } from './dom.ts'
import { followHost, t } from './i18n.ts'
import { hasIndexHtml, zipEntryNames } from './zipnames.ts'

const RESOURCE = 'sites' // name of the resource in the manifest

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
  followHost(msk)
  const crud = msk.crud(RESOURCE)
  const NO_INDEX = t('the zip does not contain an index.html file')

  const state = {
    rows: [] as Row[],
    view: 'list' as View,
    editId: null as string | null, // id of the row in edit/show; null = new site
    file: null as File | null, // zip chosen in the form
    filter: '',
    busy: false,
    siteUrl: '',
  }

  // ---------- DOM ----------

  const filter = h('input', { type: 'search', class: 'msk-filter', placeholder: t('Filter…'), 'aria-label': t('Filter the sites') })
  const btnNew = h('button', { type: 'button', class: 'msk-btn' }, t('＋ New site'))
  const rowcount = h('span', { class: 'msk-count' })
  const tbody = h('tbody')
  const listMsg = h('div', { class: 'msg', role: 'status' })
  const COLS = ['Name', 'Start page', 'Files', 'Size', 'Updated', 'Owner', 'Actions']
  const listView = h(
    'div',
    { class: 'listview' },
    h('h2', { class: 'msk-h2' }, t('Static sites')),
    h('div', { class: 'msk-toolbar' }, filter, btnNew, h('span', { class: 'grow' }), rowcount),
    h('div', { class: 'msk-tablewrap' }, h('table', { class: 'msk-table' }, h('thead', {}, h('tr', {}, ...COLS.map((c) => h('th', {}, t(c))))), tbody)),
    listMsg,
  )

  const btnBack = h('button', { type: 'button', class: 'msk-btn ghost' }, t('⬅ List of sites'))
  const svTitle = h('span', { class: 'sv-title' })
  const btnReload = h('button', { type: 'button', class: 'msk-btn ghost', title: t('Reload the site') }, t('↻ Reload'))
  const aTab = h('a', { class: 'msk-btn ghost', target: '_blank', rel: 'noopener noreferrer', title: t('Open in a new tab') }, t('↗ New tab'))
  const btnModify = h('button', { type: 'button', class: 'msk-btn ghost' }, t('✏ Edit'))
  const showOnly = h('span', { class: 'show-only' }, btnReload, aTab, btnModify)

  const inName = h('input', { id: 'msks-name', type: 'text', placeholder: t('e.g. Project documentation') })
  const inDesc = h('textarea', { id: 'msks-desc', rows: '3', placeholder: t('What the site is for (optional)') })
  const inZip = h('input', { type: 'file', accept: '.zip,application/zip,application/x-zip-compressed' })
  const fname = h('span', { class: 'fname' })
  const drop = h(
    'label',
    { class: 'drop' },
    inZip,
    h('span', { class: 'big' }, '📦'),
    fname,
    h('span', { class: 'sub' }, t('drag the zip here or click to choose it')),
  )
  const zipReq = h('b', { class: 'req' }, '*')
  const zipHint = h('div', { class: 'hint' })
  const btnSave = h('button', { type: 'button', class: 'msk-btn' }, t('💾 Save'))
  const btnCancel = h('button', { type: 'button', class: 'msk-btn ghost' }, t('Cancel'))
  const formMsg = h('div', { class: 'msg', role: 'status' })
  const siteForm = h(
    'div',
    { class: 'siteform' },
    h('div', { class: 'frow required' }, h('label', { for: 'msks-name' }, t('Name') + ' ', h('b', { class: 'req' }, '*')), inName),
    h('div', { class: 'frow' }, h('label', { for: 'msks-desc' }, t('Description')), inDesc),
    h('div', { class: 'frow' }, h('label', {}, t('Zip archive') + ' ', zipReq), drop, zipHint),
    h('div', { class: 'form-actions' }, btnSave, btnCancel),
    formMsg,
  )
  const sframe = h('iframe', {
    class: 'sframe',
    title: t('Static site'),
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

  // ---------- list ----------

  function renderRows() {
    const f = state.filter.trim().toLowerCase()
    const shown = state.rows.filter((r) => {
      if (!f) return true
      return [valOf(r, 'name'), valOf(r, 'description'), valOf(r, 'entry'), valOf(r, 'zip_name'), r.owner_name ?? ''].some((v) =>
        v.toLowerCase().includes(f),
      )
    })
    rowcount.textContent = shown.length === 1 ? t('1 site') : t('{n} sites', { n: shown.length })
    if (!shown.length) {
      tbody.replaceChildren(
        h(
          'tr',
          {},
          h('td', { class: 'empty', colspan: String(COLS.length) }, state.rows.length ? t('no site matches the filter') : t('no site: upload one with ＋ New site')),
        ),
      )
      return
    }
    tbody.replaceChildren(
      ...shown.map((r) => {
        const ok = hasSite(r)
        const nameCell = h('td', {})
        if (ok) {
          const a = h('a', { class: 'open', href: '#', title: t('Open the site') }, valOf(r, 'name'))
          a.addEventListener('click', (ev) => {
            ev.preventDefault()
            void openShow(r.id)
          })
          nameCell.append(a)
        } else nameCell.append(valOf(r, 'name'))
        if (r.shared) nameCell.append(h('span', { class: 'msk-badge acc' }, t('shared')))
        if (r.my_level === 'read') nameCell.append(h('span', { class: 'msk-badge' }, t('read only')))
        if (valOf(r, 'description')) nameCell.title = valOf(r, 'description')

        const acts = h('td', { class: 'rowacts' })
        const btn = (label: string, cls: string, fn: () => void, disabled = false) => {
          const b = h('button', { type: 'button', class: 'msk-btn mini ' + cls, disabled }, label)
          b.addEventListener('click', fn)
          acts.append(b)
        }
        btn(t('👁 Open'), 'ghost', () => void openShow(r.id), !ok)
        if (canWrite(r)) btn(t('✏ Edit'), 'ghost', () => openEdit(r.id))
        if (canManage(r)) btn(t('👥 Share'), 'ghost', () => void share(r.id))
        if (canManage(r)) btn(t('🗑 Delete'), 'danger', () => void del(r.id))

        return h(
          'tr',
          { class: 'data-row' },
          nameCell,
          h('td', { class: 'mono', title: valOf(r, 'zip_name') }, ok ? valOf(r, 'entry') : t('zip to upload')),
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

  // ---------- change of view ----------

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
    svTitle.textContent = row ? t('Edit: {name}', { name: valOf(row, 'name') }) : t('New site')
    inName.value = row ? valOf(row, 'name') : ''
    inDesc.value = row ? valOf(row, 'description') : ''
    inZip.value = ''
    setFile(null)
    const current = !!row && hasSite(row)
    zipReq.hidden = current
    if (current) {
      zipHint.replaceChildren(
        t('Leave empty to keep the current site ('),
        code(valOf(row, 'zip_name') || valOf(row, 'entry')),
        t(', {n} files). A new zip replaces all the files of the site.', { n: valOf(row, 'files') || '?' }),
      )
    } else {
      zipHint.replaceChildren(
        t('The zip must contain an '),
        code('index.html'),
        t(', also inside a folder: the least nested one is used. Use relative links ('),
        code('css/style.css'),
        t(', not '),
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
      msg(canWrite(row) ? t('this site has no files: use Edit to upload the zip') : t('this site has no files'), 'list', true)
      return
    }
    msg('')
    try {
      // temporary URL on the origin of the contents: the iframe has no credentials
      const url = await msk.content.url(id)
      state.editId = id
      svTitle.textContent = valOf(row, 'name')
      showView('show')
      state.siteUrl = url
      sframe.src = url
      aTab.href = url
    } catch (e) {
      msg(t('could not open the site: {error}', { error: errText(e) }), 'list', true)
    }
  }

  /** Reloads with a new URL: the old one may have expired. */
  async function reload() {
    if (state.view !== 'show' || state.editId == null) return
    try {
      const url = await msk.content.url(state.editId)
      state.siteUrl = url
      aTab.href = url
    } catch {
      /* try again with the URL at hand */
    }
    if (state.siteUrl) sframe.src = state.siteUrl
  }

  function backToList() {
    if (state.busy) return
    showView('list')
  }

  // ---------- actions ----------

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
    if (!name) return msg(t('the name is required'), 'form', true)
    if (!file && !(row && hasSite(row))) return msg(t('choose the zip with the site'), 'form', true)
    if (file && !/\.zip$/i.test(file.name)) return msg(t('the file must be a .zip'), 'form', true)

    setBusy(true)
    try {
      // Check of the names in the zip beforehand: an upload without an
      // index.html would replace the files of an existing site.
      if (file) {
        const names = await zipEntryNames(file)
        if (names && !hasIndexHtml(names)) throw new Error(NO_INDEX)
        msg(t('uploading and extracting {name}…', { name: file.name }), 'form')
      } else msg(t('saving…'), 'form')

      if (!row) {
        // new: first the row, then the content; if the content fails,
        // the row just created is deleted (no empty sites)
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
        // same id: the new zip replaces the whole content
        const info = await msk.content.upload(row.id, file)
        await crud.update(row.id, { name, description, ...infoValues(file, info) })
        if (!info.entry) {
          await load()
          throw new Error(NO_INDEX + ': ' + t('upload the site again with a valid zip'))
        }
      } else {
        await crud.update(row.id, { name, description })
      }
      setBusy(false)
      showView('list')
      msg(row ? t('site updated') : t('site created'))
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
    if (!(await msk.confirm(t('Delete the site "{name}" and all its files?', { name: valOf(row, 'name') })))) return
    msg('')
    try {
      // the server deletes the content too
      await crud.remove(id)
      msg(t('site deleted'))
      await load()
    } catch (e) {
      msg(errText(e), 'list', true)
    }
  }

  // ---------- events ----------

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

  // ---------- start ----------

  showView('list')
  void load()
}
