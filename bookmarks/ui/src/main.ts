// UI of the Bookmarks plugin: a grid of cards with a search box, the tag filter with counts, the favourites toggle and the
// form of a bookmark. A bookmark opens in a new tab, or in a frame of the content area (its own choice, else the default of
// the list kept in this browser). Like the Sites plugin did for a site by address, the host looks at the page
// (`msk.web.probe`, permission `web`): when the bookmark is saved, to fill the title and the picture that are missing, and at
// every open in a frame, because a site that forbids framing opens in a new tab. Every text is a DOM text node.
import '@mosaikit/plugin-api/style.css'
import './bookmarks.css'
import {
  confirmDialog,
  connect,
  dialog,
  downloadCsv,
  downloadFile,
  el,
  emptyState,
  errText,
  filteredEmpty,
  menu,
  shortcuts,
  skeleton,
  tagInput,
  toast,
  virtualList,
  type Msk,
  type Row,
} from '@mosaikit/plugin-api'
import { applyFilter, chunk, cleanTags, columnsFor, effectiveMode, hostOf, hueOf, parseOpenMode, parseTags, safeHref, safeThumbnail, tagCounts, toggleTag, withScheme, type BookmarkLike, type Filter, type OpenMode } from './logic.ts'
import { toThumbnail } from './thumb.ts'
import { CSV_HEADER, clip, findDuplicates, normalizeUrl, parseBrowserHtml, parseCsvBookmarks, parseCsvText, planImport, toBrowserHtml, toCsvRows } from './io.ts'
import { bindTexts, TEXTS, langOf, sub } from './texts.ts'

const app = document.getElementById('app')!
const MAX_IMPORT = 500
const MODE_KEY = 'msk.bookmarks.openMode'
/** The default of the list, kept in this browser; `tab` (the old behaviour) when none was chosen. */
function savedMode(): OpenMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'frame' ? 'frame' : 'tab'
  } catch {
    return 'tab'
  }
}

interface Bookmark extends BookmarkLike {
  id: string
  row: Row
}

function mount(msk: Msk) {
  document.documentElement.classList.add('msk-fill')
  bindTexts(msk)
  let lang = langOf(msk.context?.lang)
  const tr = () => TEXTS[lang]
  const api = msk.crud('bookmarks')
  let items: Bookmark[] = []
  const filter: Filter = { query: '', tags: [], favoritesOnly: false }
  let defaultMode = savedMode()
  const modeName = (m: OpenMode) => (m === 'frame' ? tr().modeFrame : tr().modeTab)

  const fail = (e: unknown) => toast(errText(e, msk.context?.lang), { tone: 'err', ms: 6000 })
  const head = el('header', { class: 'bk-head' })
  const bar = el('div', { class: 'bk-bar' })
  const body = el('div', { class: 'bk-body' })
  const listView = el('div', { class: 'bk' }, head, bar, body)
  // the view of a bookmark opened in the content area: a slim bar and the frame under it
  const viewTitle = el('span', { class: 'bk-vtitle' })
  const viewHost = el('span', { class: 'bk-vhost' })
  const viewTab = el('a', { class: 'msk-btn ghost mini', target: '_blank', rel: 'noopener noreferrer' }, tr().newTabLink)
  const frame = el('iframe', {
    class: 'bk-frame',
    title: tr().frameTitle,
    // another origin: it may keep its own scripts, forms and storage
    sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads',
    referrerpolicy: 'no-referrer',
  })
  const noFrameLink = el('a', { class: 'msk-btn', target: '_blank', rel: 'noopener noreferrer' }, tr().newTabLink)
  const noFrame = el('div', { class: 'bk-noframe', role: 'status' }, el('p', {}, tr().noFrame), noFrameLink)
  noFrame.hidden = true
  const view = el('div', { class: 'bk-view' }, el('div', { class: 'bk-vbar' }, el('div', { class: 'bk-vid' }, viewTitle, viewHost), viewTab), frame, noFrame)
  view.hidden = true
  app.replaceChildren(listView, view)

  // the search box lives across redraws, so typing never loses the focus
  const search = el('input', { type: 'search', class: 'bk-search', 'aria-label': tr().search, placeholder: tr().searchPlaceholder })
  search.addEventListener('input', () => {
    filter.query = search.value
    drawTags()
    drawList()
  })

  const toBookmark = (r: Row): Bookmark => ({
    id: r.id,
    row: r,
    title: String(r.values.title ?? ''),
    url: String(r.values.url ?? ''),
    note: String(r.values.note ?? ''),
    tags: parseTags(r.values.tags),
    favorite: r.values.favorite === true,
    openMode: parseOpenMode(r.values.open_mode),
    thumbnail: safeThumbnail(r.values.thumbnail),
  })

  const valuesOf = (b: BookmarkLike, over: Partial<BookmarkLike> = {}) => {
    const v = { ...b, ...over }
    return { title: v.title, url: v.url, note: v.note, tags: JSON.stringify(cleanTags(v.tags)), favorite: v.favorite, open_mode: v.openMode ?? '', thumbnail: v.thumbnail ?? '' }
  }
  const canWrite = (b: Bookmark) => b.row.my_level === 'write' || b.row.my_level === 'manage'

  // ----------------------------------------------------------------------------------------------------------- the form
  const form = (existing?: Bookmark) => {
    const title = el('input', { type: 'text', maxlength: '160', 'aria-label': tr().fTitle, placeholder: tr().titleHint })
    const url = el('input', { type: 'text', inputmode: 'url', autocapitalize: 'off', spellcheck: 'false', maxlength: '2000', 'aria-label': tr().fUrl, placeholder: 'https://' })
    const note = el('textarea', { rows: '4', maxlength: '2000', 'aria-label': tr().fNote })
    const favorite = el('input', { type: 'checkbox', id: 'bk-fav' })
    const open = el('select', { 'aria-label': tr().fOpen, 'data-testid': 'bk-open-mode' })
    open.append(
      el('option', { value: '' }, sub(tr().modeDefault, { m: modeName(defaultMode) })),
      el('option', { value: 'frame' }, tr().modeFrame),
      el('option', { value: 'tab' }, tr().modeTab),
    )
    open.value = existing?.openMode ?? ''
    let tags = existing?.tags ?? []
    const tagBox = tagInput({
      label: tr().fTags,
      values: tags,
      suggestions: tagCounts(items).map((t) => t.tag),
      placeholder: tr().fTagsHint,
      removeLabel: tr().removeTag,
      onChange: (v) => (tags = v),
    })
    const dupHint = el('p', { class: 'bk-dup-hint', role: 'status' })
    dupHint.hidden = true
    url.addEventListener('input', () => {
      const key = normalizeUrl(url.value)
      const same = key ? items.find((b) => b.id !== existing?.id && normalizeUrl(b.url) === key) : undefined
      dupHint.hidden = !same
      if (same) dupHint.textContent = sub(tr().alreadySaved, { n: same.title })
    })
    title.value = existing?.title ?? ''
    url.value = existing?.url ?? ''
    note.value = existing?.note ?? ''
    favorite.checked = existing?.favorite ?? false
    const field = (label: string, input: HTMLElement) => el('div', { class: 'msk-field' }, el('label', {}, label), input)
    const ok = el('button', { type: 'button', class: 'msk-btn' }, existing ? tr().save : tr().create)
    const no = el('button', { type: 'button', class: 'msk-btn ghost' }, tr().cancel)
    const d = dialog({
      title: existing ? tr().editTitle : tr().newTitle,
      body: el(
        'div',
        { class: 'bk-form' },
        field(tr().fUrl, url),
        dupHint,
        field(tr().fTitle, title),
        field(tr().fNote, note),
        field(tr().fTags, tagBox.el),
        el('div', { class: 'msk-field' }, el('label', {}, tr().fOpen), open, el('p', { class: 'bk-hint' }, tr().fOpenHint)),
        el('label', { class: 'bk-check' }, favorite, el('span', {}, tr().fFavorite)),
      ),
      actions: [no, ok],
    })
    no.addEventListener('click', d.close)
    const go = async () => {
      if (!url.value.trim()) {
        toast(tr().needUrl, { tone: 'err' })
        return url.focus()
      }
      ok.disabled = true
      const base = { title: title.value, url: url.value, note: note.value, tags: tagBox.get(), favorite: favorite.checked, openMode: parseOpenMode(open.value) }
      // the picture is kept while the address is the same; a new address looks for its own
      const same = !!existing && normalizeUrl(existing.url) === normalizeUrl(url.value)
      let thumbnail = same ? (existing?.thumbnail ?? '') : ''
      try {
        // what the host sees at the address fills what is missing: the title and the picture. Saving never fails for it.
        const address = withScheme(url.value)
        let title2 = base.title
        if (address && (!base.title.trim() || !thumbnail)) {
          ok.textContent = tr().looking
          try {
            const p = await msk.web.probe(address, !thumbnail)
            if (!base.title.trim() && p.title.trim()) title2 = p.title.trim().slice(0, 160)
            if (!thumbnail && p.image) thumbnail = await toThumbnail(p.image).catch(() => '')
          } catch {
            /* cannot look at it from here: the bookmark is saved as it is */
          }
        }
        const values = valuesOf({ ...base, title: title2, thumbnail })
        if (existing) await api.update(existing.id, values)
        else await api.create(values)
        d.close()
        await load(true)
      } catch (e) {
        fail(e)
        ok.disabled = false
        ok.textContent = existing ? tr().save : tr().create
      }
    }
    ok.addEventListener('click', () => void go())
    url.focus()
  }

  // --------------------------------------------------------------------------------------------------------- the cards
  const toggleFavorite = async (b: Bookmark) => {
    try {
      await api.update(b.id, valuesOf(b, { favorite: !b.favorite }))
      await load(true)
    } catch (e) {
      fail(e)
    }
  }

  const copyLink = async (b: Bookmark) => {
    let done = false
    try {
      await navigator.clipboard.writeText(b.url)
      done = true
    } catch {
      // a frame without the clipboard permission: select the text of a hidden box and copy it the old way
      const box = el('textarea', { class: 'bk-copybox', 'aria-hidden': 'true', tabindex: '-1', readonly: 'readonly' })
      box.value = b.url
      document.body.append(box)
      box.select()
      try {
        done = document.execCommand('copy')
      } catch {
        done = false
      }
      box.remove()
    }
    toast(done ? tr().copied : tr().copyFailed, { tone: done ? 'ok' : 'err' })
  }

  const remove = async (b: Bookmark) => {
    if (!(await confirmDialog({ title: tr().remove, text: sub(tr().removeConfirm, { n: b.title }), ok: tr().remove, cancel: tr().cancel, danger: true }))) return
    try {
      await api.remove(b.id)
      await load(true)
    } catch (e) {
      fail(e)
    }
  }

  // ------------------------------------------------------------------------------------- open in the content area
  /** Back from a bookmark that was open in the frame. */
  const closeView = () => {
    frame.src = 'about:blank'
    view.hidden = true
    listView.hidden = false
    msk.band.reset()
  }

  /** The site forbids framing: said here, with the way to open it, and opened in a new tab. */
  const showNoFrame = (url: string) => {
    frame.src = 'about:blank'
    frame.hidden = true
    noFrame.hidden = false
    noFrameLink.href = url
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  /** A bookmark in a frame of the content area, or in a new tab when its site forbids being framed. The check is made at
   *  every open: the site may have changed its mind since the bookmark was saved. */
  const openFrame = async (b: Bookmark) => {
    const url = safeHref(b.url)
    if (!url) return
    viewTitle.textContent = b.title
    viewHost.textContent = hostOf(b.url)
    viewTab.href = url
    noFrame.hidden = true
    frame.hidden = false
    listView.hidden = true
    view.hidden = false
    msk.band.set({ back: { label: tr().backToList, onClick: closeView } })
    frame.src = url
    try {
      const p = await msk.web.probe(url)
      if (!p.embeddable && !view.hidden && frame.src !== 'about:blank') showNoFrame(url)
    } catch {
      /* cannot look at it from here: the frame shows what it can */
    }
  }

  const card = (b: Bookmark) => {
    const c = el('article', { class: 'bk-card', 'data-testid': 'bookmark' })
    const mode = effectiveMode(b.openMode, defaultMode)
    const href = safeHref(b.url)
    // the picture of the site, or a placeholder in a colour of its host (the same every time)
    const pic = b.thumbnail ? el('img', { class: 'bk-pic', src: b.thumbnail, alt: '', loading: 'lazy' }) : el('span', { class: 'bk-pic ph', 'aria-hidden': 'true', style: `--hue:${hueOf(hostOf(b.url))}` }, (b.title.trim()[0] ?? hostOf(b.url)[0] ?? '?').toUpperCase())
    const thumb = el('div', { class: 'bk-thumb' }, pic, el('span', { class: 'bk-mode ' + mode, 'data-testid': 'bookmark-mode' }, mode === 'frame' ? tr().badgeFrame : tr().badgeTab))
    c.append(href ? Object.assign(el('a', { class: 'bk-thumb-link', href, target: '_blank', rel: 'noopener noreferrer', 'aria-hidden': 'true', tabindex: '-1' }, thumb), { onclick: (e: MouseEvent) => (mode === 'frame' ? (e.preventDefault(), void openFrame(b)) : undefined) }) : thumb)
    const star = el(
      'button',
      { type: 'button', class: 'bk-star' + (b.favorite ? ' on' : ''), 'aria-pressed': String(b.favorite), 'aria-label': sub(b.favorite ? tr().removeFavorite : tr().addFavorite, { n: b.title }) },
      b.favorite ? '★' : '☆',
    )
    star.disabled = !canWrite(b)
    star.addEventListener('click', () => void toggleFavorite(b))
    c.append(
      el(
        'div',
        { class: 'bk-top' },
        el('div', { class: 'bk-id' }, el('h2', {}, b.title), el('p', { class: 'bk-host' }, hostOf(b.url))),
        star,
      ),
    )
    if (b.note.trim()) c.append(el('p', { class: 'bk-note' }, b.note))
    if (b.tags.length) c.append(el('div', { class: 'bk-tags' }, ...b.tags.map((t) => el('span', { class: 'bk-tag' }, t))))
    const acts = el('div', { class: 'bk-acts' })
    if (href && mode === 'frame') {
      const go = el('button', { type: 'button', class: 'msk-btn mini', 'data-testid': 'bookmark-open' }, tr().open)
      go.addEventListener('click', () => void openFrame(b))
      acts.append(go)
    } else if (href) acts.append(el('a', { class: 'msk-btn mini', href, target: '_blank', rel: 'noopener noreferrer', 'data-testid': 'bookmark-open' }, tr().open))
    const copy = el('button', { type: 'button', class: 'msk-btn ghost mini' }, tr().copy)
    copy.addEventListener('click', () => void copyLink(b))
    acts.append(copy)
    if (canWrite(b)) {
      const edit = el('button', { type: 'button', class: 'msk-btn ghost mini' }, tr().edit)
      edit.addEventListener('click', () => form(b))
      acts.append(edit)
    }
    if (b.row.my_level === 'manage') {
      const share = el('button', { type: 'button', class: 'msk-btn ghost mini' }, tr().share)
      share.addEventListener('click', () => void msk.share(b.id).catch(fail))
      const del = el('button', { type: 'button', class: 'msk-btn ghost mini danger-text' }, tr().remove)
      del.addEventListener('click', () => void remove(b))
      acts.append(share, del)
    }
    c.append(acts)
    return c
  }

  // ------------------------------------------------------------------------------------------------------ the toolbar
  const clearFilters = () => {
    filter.query = ''
    filter.tags = []
    filter.favoritesOnly = false
    search.value = ''
    drawTags()
    drawList()
  }

  const drawTags = () => {
    const favs = el('button', { type: 'button', class: 'bk-chip', 'aria-pressed': String(filter.favoritesOnly) }, '★ ' + tr().favourites)
    favs.addEventListener('click', () => {
      filter.favoritesOnly = !filter.favoritesOnly
      drawTags()
      drawList()
    })
    const row = el('div', { class: 'bk-chips', role: 'group', 'aria-label': tr().tagsFilter }, favs)
    for (const { tag, count } of tagCounts(items)) {
      const b = el('button', { type: 'button', class: 'bk-chip', 'aria-pressed': String(filter.tags.includes(tag)) }, tag, ' ', el('span', { class: 'bk-count' }, String(count)))
      b.addEventListener('click', () => {
        filter.tags = toggleTag(filter.tags, tag)
        drawTags()
        drawList()
      })
      row.append(b)
    }
    bar.replaceChildren(search, row)
  }

  /** From this many bookmarks the list draws only what is in sight. */
  const VIRTUAL_FROM = 60
  const drawList = () => {
    body.replaceChildren()
    const shown = applyFilter(items, filter)
    if (!shown.length) {
      body.append(filteredEmpty(tr().emptyFilter, tr().clearFilters, clearFilters))
      return
    }
    body.classList.toggle('virt', shown.length >= VIRTUAL_FROM)
    if (shown.length < VIRTUAL_FROM) return void body.append(el('div', { class: 'bk-grid' }, ...shown.map(card)))
    // a long list: only the rows in sight are drawn, as many cards in a row as fit
    let cols = 1
    let rows = chunk(shown, 1)
    const vl = virtualList({
      count: rows.length,
      estimateSize: 170,
      getKey: (i) => rows[i]![0]!.id,
      gap: 16,
      label: tr().title,
      render: (i) => el('div', { class: 'bk-vrow', style: `--cols:${cols}` }, ...rows[i]!.map(card)),
    })
    vl.el.classList.add('bk-vlist')
    new ResizeObserver(() => {
      const n = columnsFor(vl.el.clientWidth, 280, 16)
      if (n === cols) return
      cols = n
      rows = chunk(shown, cols)
      vl.setCount(rows.length)
    }).observe(vl.el)
    body.append(vl.el)
  }

  // ------------------------------------------------------------------------------- import, export, duplicates
  const doImport = async (file: File) => {
    const name = file.name.toLowerCase()
    let found: BookmarkLike[] = []
    try {
      const text = await file.text()
      found = name.endsWith('.csv') ? parseCsvBookmarks(parseCsvText(text)) : /\.html?$/.test(name) ? parseBrowserHtml(text) : []
    } catch (e) {
      return toast(tr().importFailed + errText(e, msk.context?.lang), { tone: 'err' })
    }
    if (!/\.(csv|html?)$/.test(name)) return toast(tr().importWrong, { tone: 'err' })
    if (!found.length) return toast(sub(tr().importNone, { f: file.name }), { tone: 'err' })
    const plan = planImport(items, found.map(clip))
    if (!plan.fresh.length) return toast(sub(tr().importAllDup, { n: plan.duplicates.length }))
    const todo = plan.fresh.slice(0, MAX_IMPORT)
    const text = sub(tr().importAsk, { n: todo.length, f: file.name }) + (plan.duplicates.length ? ' ' + sub(tr().importSkip, { m: plan.duplicates.length }) : '') + (plan.fresh.length > todo.length ? ' ' + sub(tr().importCap, { max: MAX_IMPORT }) : '')
    if (!(await confirmDialog({ title: tr().importTitle, text, ok: tr().import, cancel: tr().cancel }))) return
    let ok = 0
    let failed = 0
    for (const b of todo) {
      try {
        await api.create(valuesOf(b))
        ok++
      } catch {
        failed++
      }
    }
    toast(sub(failed ? tr().importPartial : tr().importOk, { n: ok, m: failed + plan.duplicates.length }), { tone: failed ? '' : 'ok' })
    await load(true)
  }

  const doExport = (kind: 'html' | 'csv') => {
    if (!items.length) return toast(tr().exportNone)
    const list = applyFilter(items, filter)
    if (kind === 'html') downloadFile('bookmarks.html', toBrowserHtml(list, tr().title), 'text/html;charset=utf-8')
    else downloadCsv('bookmarks.csv', toCsvRows(list), { header: CSV_HEADER })
    toast(sub(tr().exported, { n: list.length }), { tone: 'ok' })
  }

  const showDuplicates = () => {
    const groups = findDuplicates(items)
    const body = el('div', { class: 'bk-dups' })
    const close = el('button', { type: 'button', class: 'msk-btn' }, tr().close)
    const d = dialog({ title: tr().dupTitle, body, actions: [close] })
    close.addEventListener('click', d.close)
    if (!groups.length) return void body.append(el('p', {}, tr().dupNone))
    body.append(el('p', { class: 'bk-dup-lead' }, tr().dupHint))
    for (const g of groups) {
      const [keep, ...extra] = g as [Bookmark, ...Bookmark[]]
      const removable = extra.filter((b) => b.row.my_level === 'manage')
      const ul = el('ul', { class: 'bk-dup' })
      for (const b of g) ul.append(el('li', {}, el('strong', {}, b.title), el('span', { class: 'bk-host' }, b.url)))
      const clean = el('button', { type: 'button', class: 'msk-btn ghost mini' }, sub(tr().dupKeep, { n: keep.title }))
      clean.disabled = !removable.length
      clean.addEventListener('click', async () => {
        clean.disabled = true
        try {
          for (const b of removable) await api.remove(b.id)
          toast(sub(tr().dupRemoved, { n: removable.length }), { tone: 'ok' })
          d.close()
          await load(true)
        } catch (e) {
          fail(e)
          clean.disabled = false
        }
      })
      body.append(el('div', { class: 'bk-dup-group' }, ul, clean))
    }
  }

  const tools = (): HTMLElement[] => {
    const file = el('input', { type: 'file', accept: '.html,.htm,.csv,text/html,text/csv', class: 'msk-sr', 'aria-label': tr().import, tabindex: '-1' })
    file.addEventListener('change', () => {
      const f = file.files?.[0]
      file.value = ''
      if (f) void doImport(f)
    })
    const imp = el('button', { type: 'button', class: 'msk-btn ghost' }, '⤒ ' + tr().import)
    imp.title = tr().importHint
    imp.addEventListener('click', () => file.click())
    imp.hidden = !msk.can('create')
    const exp = el('button', { type: 'button', class: 'msk-btn ghost', 'aria-haspopup': 'menu' }, '⤓ ' + tr().export)
    exp.addEventListener('click', () => menu(exp, [{ label: tr().exportHtml, onClick: () => doExport('html') }, { label: tr().exportCsv, onClick: () => doExport('csv') }]))
    const dups = findDuplicates(items).length
    const dup = el('button', { type: 'button', class: 'msk-btn ghost' + (dups ? ' has-dups' : '') }, '⧉ ' + tr().duplicates, ...(dups ? [el('span', { class: 'bk-count' }, String(dups))] : []))
    dup.addEventListener('click', showDuplicates)
    // the default of the list: where a bookmark opens unless it says otherwise (kept in this browser)
    const seg = el('span', { class: 'bk-seg', role: 'group', 'aria-label': tr().openLinks, title: tr().openLinksHint })
    for (const m of ['tab', 'frame'] as const) {
      const b = el('button', { type: 'button', class: 'bk-seg-btn', 'aria-pressed': String(defaultMode === m), 'data-testid': 'bk-default-' + m }, modeName(m))
      b.addEventListener('click', () => {
        defaultMode = m
        try {
          localStorage.setItem(MODE_KEY, m)
        } catch {
          /* not kept */
        }
        draw()
      })
      seg.append(b)
    }
    return [seg, imp, exp, dup, file]
  }

  const draw = () => {
    head.replaceChildren(el('h1', {}, tr().title))
    const add = el('button', { type: 'button', class: 'msk-btn' }, tr().newBookmark)
    add.addEventListener('click', () => form())
    add.hidden = !msk.can('create')
    head.append(...(items.length ? tools() : []), add)
    search.setAttribute('aria-label', tr().search)
    search.placeholder = tr().searchPlaceholder
    if (!items.length) {
      bar.replaceChildren()
      body.replaceChildren(
        emptyState({
          art: 'bookmarks',
          title: tr().emptyTitle,
          text: tr().emptyText,
          actions: msk.can('create') ? [Object.assign(el('button', { type: 'button', class: 'msk-btn' }, tr().newBookmark), { onclick: () => form() })] : [],
        }),
      )
      return
    }
    // a chosen tag that no bookmark has any more (after a delete) is dropped
    const known = new Set(items.flatMap((b) => b.tags))
    filter.tags = filter.tags.filter((t) => known.has(t))
    drawTags()
    drawList()
  }

  const load = async (quiet = false) => {
    if (!quiet) body.replaceChildren(skeleton({ kind: 'cards', count: 3 }))
    try {
      items = (await api.list({ sort: 'created_at', dir: 'desc', limit: 500 })).rows.map(toBookmark)
    } catch (e) {
      body.textContent = tr().loadFailed + errText(e, msk.context?.lang)
      return
    }
    draw()
  }

  const keys = shortcuts(
    [
      { keys: 'n', label: tr().scNew, run: (e) => (e.preventDefault(), form()), when: () => msk.can('create') && !!view.hidden },
      { keys: '/', label: tr().scSearch, run: (e) => (e.preventDefault(), search.focus()), when: () => !!view.hidden },
    ],
    { labels: { title: tr().scTitle, close: tr().close, general: tr().title, then: tr().scThen } },
  )
  addEventListener('pagehide', () => keys.dispose())
  msk.onContext((ctx) => {
    if (langOf(ctx.lang) === lang) return
    lang = langOf(ctx.lang)
    viewTab.textContent = noFrameLink.textContent = tr().newTabLink
    frame.title = tr().frameTitle
    draw()
  })
  void msk.loading(load())
}

connect()
  .then(mount)
  .catch((e) => {
    app.textContent = TEXTS[langOf(undefined)].failed + errText(e)
  })
