// UI of the Tools plugin (static sites).
//
// A site is a zip with an index.html. The CRUD record (`sites`) keeps its name,
// description and the data of the upload (zip, start page, files, bytes); the
// files are in the content area of the resource (permission `content`): the host
// extracts the zip with `msk.content.upload(id, zip)`, which replaces the whole
// content, and "Open" asks with `msk.content.url(id)` for a temporary URL of the
// start page on the origin of the contents, shown in a sandboxed iframe.
// Deleting the row, the server deletes the files too.
// A site is either a zip (above) or a web address: the address is shown in an iframe (it is never
// downloaded). Before saving, and when opening, the host looks at the page (`msk.web.probe`,
// permission `web`): a site that forbids being framed (X-Frame-Options, CSP frame-ancestors) opens in a
// new tab instead. Every site has a thumbnail: uploaded by the person, else the picture of the page
// (og:image or its first image, found by the host), else a placeholder. It is kept in the record as a
// small `data:` image (`thumbnail`).
// Flows: list (cards or table) / new (name + zip or address) / edit / open / share /
// delete, respecting the `my_level` of every row
// (read = Open; write = also Edit; manage = also Share and Delete).

import '@mosaikit/plugin-api/style.css'
import './sites.css'
import { connect, pageBody, pageHead, type Msk, type Row, type SiteInfo } from '@mosaikit/plugin-api'
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
const isWeb = (r: Row) => !!valOf(r, 'url')
const hasSite = (r: Row) => !!valOf(r, 'entry') || isWeb(r)
const thumbOf = (r: Row) => {
  const v = valOf(r, 'thumbnail')
  // only an image the plugin wrote itself (a data: address) is ever shown
  return /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : ''
}
const hostOf = (u: string) => {
  try {
    return new URL(u).host
  } catch {
    return u
  }
}

/** A picture reduced to a thumbnail (at most 480 px wide, JPEG): small enough to live in the record. */
async function toThumbnail(src: Blob | string): Promise<string> {
  // a data: address is decoded here (the CSP of the plugin does not allow fetch on it)
  let blob: Blob
  if (typeof src === 'string') {
    const m = /^data:([^;,]+);base64,(.*)$/s.exec(src)
    if (!m) throw new Error('image')
    const bin = atob(m[2])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    blob = new Blob([bytes], { type: m[1] })
  } else blob = src
  const bmp = await createImageBitmap(blob)
  const w = Math.min(480, bmp.width)
  const hgt = Math.max(1, Math.round((bmp.height * w) / bmp.width))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = hgt
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, hgt)
  ctx.drawImage(bmp, 0, 0, w, hgt)
  bmp.close()
  return canvas.toDataURL('image/jpeg', 0.8)
}

const VIEW_KEY = 'msks.view'
function savedView(): 'cards' | 'table' {
  try {
    return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'cards'
  } catch {
    return 'cards'
  }
}

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
    layout: savedView(),
    source: 'zip' as 'zip' | 'url',
    // thumbnail of the form: undefined = as it is, null = removed, a data: address = new
    thumb: undefined as string | null | undefined,
  }

  // ---------- DOM ----------

  const filter = h('input', { type: 'search', class: 'msk-filter', placeholder: t('Filter…'), 'aria-label': t('Filter the sites') })
  const btnNew = h('button', { type: 'button', class: 'msk-btn' }, t('＋ New site'))
  const btnCards = h('button', { type: 'button', class: 'msk-btn ghost', 'aria-label': t('Cards'), title: t('Cards') }, '▦')
  const btnTable = h('button', { type: 'button', class: 'msk-btn ghost', 'aria-label': t('List'), title: t('List') }, '☰')
  const layoutSwitch = h('span', { class: 'layoutswitch', role: 'group', 'aria-label': t('View') }, btnCards, btnTable)
  const cards = h('div', { class: 'cards' })
  const tableWrap = h('div', { class: 'msk-tablewrap' })
  const rowcount = h('span', { class: 'msk-count' })
  const tbody = h('tbody')
  const listMsg = h('div', { class: 'msg', role: 'status' })
  const COLS = ['Thumbnail', 'Name', 'Start page', 'Files', 'Size', 'Updated', 'Owner', 'Actions']
  tableWrap.append(h('table', { class: 'msk-table' }, h('thead', {}, h('tr', {}, ...COLS.map((c) => h('th', {}, c === 'Thumbnail' ? '' : t(c))))), tbody))
  const listView = h(
    'div',
    { class: 'listview' },
    // the header and the filter never scroll (the same header as the pages of Mosaikit); the sites do
    pageHead({ title: t('Tools'), sub: rowcount, filters: [layoutSwitch, filter], actions: [btnNew] }),
    pageBody(cards, tableWrap, listMsg),
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
  const inSrcZip = h('input', { type: 'radio', name: 'msks-src', id: 'msks-src-zip', value: 'zip', checked: true })
  const inSrcUrl = h('input', { type: 'radio', name: 'msks-src', id: 'msks-src-url', value: 'url' })
  const srcRow = h(
    'div',
    { class: 'frow srcrow', role: 'radiogroup', 'aria-label': t('Source of the site') },
    h('label', { class: 'radio', for: 'msks-src-zip' }, inSrcZip, ' ', t('Zip archive')),
    h('label', { class: 'radio', for: 'msks-src-url' }, inSrcUrl, ' ', t('Web address')),
  )
  const inUrl = h('input', { id: 'msks-url', type: 'url', placeholder: 'https://example.org/', autocomplete: 'off' })
  const urlHint = h('div', { class: 'hint' }, t('The site is shown inside Mosaikit and never downloaded. If it does not allow it, it opens in a new tab.'))
  const urlRow = h('div', { class: 'frow required' }, h('label', { for: 'msks-url' }, t('Address') + ' ', h('b', { class: 'req' }, '*')), inUrl, urlHint)
  const inThumb = h('input', { id: 'msks-thumb', type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' })
  const thumbPrev = h('img', { class: 'thumbprev', alt: '' })
  const btnThumbClear = h('button', { type: 'button', class: 'msk-btn ghost mini' }, t('Remove'))
  const thumbRow = h(
    'div',
    { class: 'frow' },
    h('label', { for: 'msks-thumb' }, t('Thumbnail')),
    h('div', { class: 'thumbline' }, thumbPrev, inThumb, btnThumbClear),
    h('div', { class: 'hint' }, t('Optional. Without one, a site given by address shows its own picture (og:image, or its first image); otherwise a placeholder.')),
  )
  const zipHint = h('div', { class: 'hint' })
  const zipRow = h('div', { class: 'frow' }, h('label', {}, t('Zip archive') + ' ', zipReq), drop, zipHint)
  const btnSave = h('button', { type: 'button', class: 'msk-btn' }, t('💾 Save'))
  const btnCancel = h('button', { type: 'button', class: 'msk-btn ghost' }, t('Cancel'))
  const formMsg = h('div', { class: 'msg', role: 'status' })
  const siteForm = h(
    'div',
    { class: 'siteform' },
    h('div', { class: 'frow required' }, h('label', { for: 'msks-name' }, t('Name') + ' ', h('b', { class: 'req' }, '*')), inName),
    h('div', { class: 'frow' }, h('label', { for: 'msks-desc' }, t('Description')), inDesc),
    srcRow,
    zipRow,
    urlRow,
    thumbRow,
    h('div', { class: 'form-actions' }, btnSave, btnCancel),
    formMsg,
  )
  const sframe = h('iframe', {
    class: 'sframe',
    title: t('Static site'),
    sandbox: 'allow-scripts allow-forms allow-popups allow-modals allow-downloads',
  })
  // a site given by address is another origin: it may keep its own scripts, forms and storage
  const webFrame = h('iframe', {
    class: 'sframe',
    title: t('Web site'),
    sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads',
    referrerpolicy: 'no-referrer',
  })
  // a site that forbids being framed: said here, with the way to open it
  const noFrameLink = h('a', { class: 'msk-btn', target: '_blank', rel: 'noopener noreferrer' }, t('↗ New tab'))
  const noFrame = h(
    'div',
    { class: 'noframe', role: 'status' },
    h('p', {}, t('This site does not allow being shown inside Mosaikit (it forbids framing). It was opened in a new tab; if nothing opened, use the button.')),
    noFrameLink,
  )

  const siteView = h('div', { class: 'siteview' }, h('div', { class: 'editbar' }, btnBack, svTitle, h('span', { class: 'grow' }), showOnly), siteForm, sframe, webFrame, noFrame)

  app.classList.add('msks')
  app.replaceChildren(listView, siteView)

  function msg(t: string, which: 'list' | 'form' = 'list', isErr = false) {
    const m = which === 'form' ? formMsg : listMsg
    m.textContent = t
    m.classList.toggle('err', isErr)
  }
  const findRow = (id: string | null) => (id == null ? undefined : state.rows.find((r) => r.id === id))

  // ---------- list ----------

  /** The thumbnail of a site, or its placeholder (the first letter of the name over a colour of the name). */
  function thumbEl(r: Row, cls: string) {
    const src = thumbOf(r)
    if (src) return h('img', { class: cls, src, alt: '', loading: 'lazy' })
    const name = valOf(r, 'name')
    const hue = [...name].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 360, 7)
    const ph = h('span', { class: cls + ' placeholder', 'aria-hidden': 'true', style: `--hue: ${hue}` }, isWeb(r) ? '🌐' : (name.trim()[0] ?? '·').toUpperCase())
    return ph
  }

  function renderRows() {
    const f = state.filter.trim().toLowerCase()
    const shown = state.rows.filter((r) => {
      if (!f) return true
      return [valOf(r, 'name'), valOf(r, 'description'), valOf(r, 'entry'), valOf(r, 'zip_name'), valOf(r, 'url'), r.owner_name ?? ''].some((v) =>
        v.toLowerCase().includes(f),
      )
    })
    rowcount.textContent = shown.length === 1 ? t('1 site') : t('{n} sites', { n: shown.length })
    const asCards = state.layout === 'cards'
    cards.hidden = !asCards
    tableWrap.hidden = asCards
    btnCards.setAttribute('aria-pressed', String(asCards))
    btnTable.setAttribute('aria-pressed', String(!asCards))
    btnCards.classList.toggle('on', asCards)
    btnTable.classList.toggle('on', !asCards)
    const emptyText = state.rows.length ? t('no site matches the filter') : t('no site: upload one with ＋ New site')
    if (!shown.length) {
      cards.replaceChildren(h('p', { class: 'empty' }, emptyText))
      tbody.replaceChildren(h('tr', {}, h('td', { class: 'empty', colspan: String(COLS.length) }, emptyText)))
      return
    }
    const nameLink = (r: Row) => {
      const a = h('a', { class: 'open', href: '#', title: t('Open the site') }, valOf(r, 'name'))
      a.addEventListener('click', (ev) => {
        ev.preventDefault()
        void openShow(r.id)
      })
      return a
    }
    const badges = (r: Row) => [
      isWeb(r) ? h('span', { class: 'msk-badge' }, t('web')) : null,
      r.shared ? h('span', { class: 'msk-badge acc' }, t('shared')) : null,
      r.my_level === 'read' ? h('span', { class: 'msk-badge' }, t('read only')) : null,
    ]
    const actions = (r: Row, wrap: HTMLElement) => {
      const btn = (label: string, cls: string, fn: () => void, disabled = false) => {
        const b = h('button', { type: 'button', class: 'msk-btn mini ' + cls, disabled }, label)
        b.addEventListener('click', fn)
        wrap.append(b)
      }
      btn(t('👁 Open'), 'ghost', () => void openShow(r.id), !hasSite(r))
      if (canWrite(r)) btn(t('✏ Edit'), 'ghost', () => openEdit(r.id))
      if (canManage(r)) btn(t('👥 Share'), 'ghost', () => void share(r.id))
      if (canManage(r)) btn(t('🗑 Delete'), 'danger', () => void del(r.id))
      return wrap
    }

    cards.replaceChildren(
      ...shown.map((r) => {
        const open = h('button', { type: 'button', class: 'cardthumb', 'aria-label': t('Open the site') + ': ' + valOf(r, 'name'), disabled: !hasSite(r) }, thumbEl(r, 'thumb'))
        open.addEventListener('click', () => void openShow(r.id))
        const where = isWeb(r) ? hostOf(valOf(r, 'url')) : valOf(r, 'entry') || t('zip to upload')
        return h(
          'article',
          { class: 'card', 'data-site': valOf(r, 'name') },
          open,
          h(
            'div',
            { class: 'cardbody' },
            h('h3', { class: 'cardname' }, hasSite(r) ? nameLink(r) : valOf(r, 'name'), ...badges(r)),
            h('p', { class: 'carddesc' }, valOf(r, 'description')),
            h('p', { class: 'cardmeta mono' }, where),
          ),
          actions(r, h('div', { class: 'rowacts' })),
        )
      }),
    )

    tbody.replaceChildren(
      ...shown.map((r) => {
        const ok = hasSite(r)
        const nameCell = h('td', {})
        if (ok) nameCell.append(nameLink(r))
        else nameCell.append(valOf(r, 'name'))
        nameCell.append(...badges(r).filter((x): x is HTMLSpanElement => !!x))
        if (valOf(r, 'description')) nameCell.title = valOf(r, 'description')
        const start = isWeb(r) ? valOf(r, 'url') : ok ? valOf(r, 'entry') : t('zip to upload')
        return h(
          'tr',
          { class: 'data-row' },
          h('td', { class: 'thumbcell' }, thumbEl(r, 'thumbsm')),
          nameCell,
          h('td', { class: 'mono', title: isWeb(r) ? valOf(r, 'url') : valOf(r, 'zip_name') }, start),
          h('td', { class: 'num' }, valOf(r, 'files') || '—'),
          h('td', { class: 'num' }, valOf(r, 'size') ? fmtSize(r.values.size) : '—'),
          h('td', { class: 'num' }, fmtDate(r.updated_at)),
          h('td', { class: 'msk-owner' }, r.owner_name ?? ''),
          actions(r, h('td', { class: 'rowacts' })),
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
    app.classList.toggle('show', view === 'show')
    siteForm.hidden = view !== 'edit'
    const web = view === 'show' && !!findRow(state.editId) && isWeb(findRow(state.editId)!)
    sframe.hidden = view !== 'show' || web
    webFrame.hidden = !web
    noFrame.hidden = true
    showOnly.hidden = view !== 'show'
    const row = findRow(state.editId)
    btnModify.hidden = !row || !canWrite(row)
    if (view !== 'show') {
      sframe.src = 'about:blank'
      webFrame.src = 'about:blank'
      state.siteUrl = ''
      aTab.removeAttribute('href')
    }
  }

  function setSource(src: 'zip' | 'url') {
    state.source = src
    inSrcZip.checked = src === 'zip'
    inSrcUrl.checked = src === 'url'
    zipRow.hidden = src !== 'zip'
    urlRow.hidden = src !== 'url'
  }

  function showThumb(src: string) {
    thumbPrev.hidden = !src
    if (src) thumbPrev.src = src
    else thumbPrev.removeAttribute('src')
    btnThumbClear.hidden = !src
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
    inThumb.value = ''
    setFile(null)
    // the source of an existing site does not change
    setSource(row && isWeb(row) ? 'url' : 'zip')
    inSrcZip.disabled = inSrcUrl.disabled = !!row && hasSite(row)
    inUrl.value = row ? valOf(row, 'url') : ''
    state.thumb = undefined
    showThumb(row ? thumbOf(row) : '')
    const current = !!row && hasSite(row) && !isWeb(row)
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

  /** A site given by address: in the frame, or in a new tab when it forbids being framed. */
  async function openWeb(row: Row) {
    const url = valOf(row, 'url')
    noFrameLink.href = url
    // known to forbid framing: straight to a new tab (the click is still the gesture that allows it)
    if (valOf(row, 'framable') === 'no') {
      state.editId = row.id
      svTitle.textContent = valOf(row, 'name')
      showView('show')
      showNoFrame(url)
      return
    }
    state.editId = row.id
    svTitle.textContent = valOf(row, 'name')
    showView('show')
    state.siteUrl = url
    webFrame.src = url
    aTab.href = url
    // looked at again: the site may have changed its mind since it was saved
    try {
      const p = await msk.web.probe(url)
      if (!p.embeddable && state.editId === row.id && state.view === 'show') {
        showNoFrame(url)
        if (valOf(row, 'framable') !== 'no' && canWrite(row)) void crud.update(row.id, { framable: 'no' }).then(load, () => {})
      }
    } catch {
      /* cannot look at it from here: the frame shows what it can */
    }
  }

  function showNoFrame(url: string) {
    webFrame.src = 'about:blank'
    webFrame.hidden = true
    noFrame.hidden = false
    noFrameLink.href = url
    aTab.href = url
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function openShow(id: string) {
    const row = findRow(id)
    if (!row) return
    if (!hasSite(row)) {
      msg(canWrite(row) ? t('this site has no files: use Edit to upload the zip') : t('this site has no files'), 'list', true)
      return
    }
    msg('')
    if (isWeb(row)) return openWeb(row)
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
    const cur = findRow(state.editId)
    if (cur && isWeb(cur)) {
      if (!webFrame.hidden) webFrame.src = valOf(cur, 'url')
      return
    }
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
    const web = state.source === 'url'
    let address = ''
    if (web) {
      try {
        const u = new URL(inUrl.value.trim())
        if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('scheme')
        address = u.href
      } catch {
        return msg(t('enter a valid web address (http or https)'), 'form', true)
      }
      if (!name && !address) return msg(t('the name is required'), 'form', true)
    } else {
      if (!name) return msg(t('the name is required'), 'form', true)
      if (!file && !(row && hasSite(row))) return msg(t('choose the zip with the site'), 'form', true)
      if (file && !/\.zip$/i.test(file.name)) return msg(t('the file must be a .zip'), 'form', true)
    }

    setBusy(true)
    try {
      if (web) {
        msg(t('looking at the site…'), 'form')
        // what the host sees: may it be framed, its title, its picture. A thumbnail given by the person wins.
        const needPicture = state.thumb === undefined && !(row && thumbOf(row))
        const p = await msk.web.probe(address, needPicture)
        const title = name || p.title || hostOf(address)
        let thumbnail: string | undefined
        if (state.thumb) thumbnail = state.thumb
        else if (state.thumb === null) thumbnail = ''
        else if (needPicture && p.image) thumbnail = await toThumbnail(p.image).catch(() => '')
        const values: Record<string, string | number> = { name: title, description, url: address, framable: p.embeddable ? 'yes' : 'no' }
        if (thumbnail !== undefined) values.thumbnail = thumbnail
        if (row) await crud.update(row.id, values)
        else await crud.create(values)
        setBusy(false)
        showView('list')
        msg(row ? t('site updated') : p.embeddable ? t('site created') : t('site created: it does not allow being shown inside Mosaikit, it opens in a new tab'))
        await load()
        return
      }
      // Check of the names in the zip beforehand: an upload without an
      // index.html would replace the files of an existing site.
      if (file) {
        const names = await zipEntryNames(file)
        if (names && !hasIndexHtml(names)) throw new Error(NO_INDEX)
        msg(t('uploading and extracting {name}…', { name: file.name }), 'form')
      } else msg(t('saving…'), 'form')
      const pic: Record<string, string> = state.thumb === undefined ? {} : { thumbnail: state.thumb ?? '' }

      if (!row) {
        // new: first the row, then the content; if the content fails,
        // the row just created is deleted (no empty sites)
        const created = await crud.create({ name, description, ...pic })
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
        await crud.update(row.id, { name, description, ...pic, ...infoValues(file, info) })
        if (!info.entry) {
          await load()
          throw new Error(NO_INDEX + ': ' + t('upload the site again with a valid zip'))
        }
      } else {
        await crud.update(row.id, { name, description, ...pic })
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
  inSrcZip.addEventListener('change', () => setSource('zip'))
  inSrcUrl.addEventListener('change', () => setSource('url'))
  inUrl.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') void save()
  })
  inThumb.addEventListener('change', () => {
    const f = inThumb.files?.[0]
    if (!f) return
    toThumbnail(f).then(
      (d) => {
        state.thumb = d
        showThumb(d)
        msg('', 'form')
      },
      () => {
        inThumb.value = ''
        msg(t('the thumbnail must be an image (png, jpeg, webp or gif)'), 'form', true)
      },
    )
  })
  btnThumbClear.addEventListener('click', () => {
    state.thumb = null
    inThumb.value = ''
    showThumb('')
  })
  const setLayout = (l: 'cards' | 'table') => {
    state.layout = l
    try {
      localStorage.setItem(VIEW_KEY, l)
    } catch {
      /* not kept */
    }
    renderRows()
  }
  btnCards.addEventListener('click', () => setLayout('cards'))
  btnTable.addEventListener('click', () => setLayout('table'))

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
