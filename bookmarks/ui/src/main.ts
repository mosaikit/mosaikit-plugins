// UI of the Bookmarks plugin: a grid of cards with a search box, the tag filter with counts, the favourites toggle and the
// form of a bookmark. Nothing is fetched from the saved sites (the avatar is a letter), and every text is a DOM text node.
import '@mosaikit/plugin-api/style.css'
import './bookmarks.css'
import {
  avatar,
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
import { applyFilter, chunk, cleanTags, columnsFor, hostOf, parseTags, safeHref, tagCounts, toggleTag, type BookmarkLike, type Filter } from './logic.ts'
import { CSV_HEADER, clip, findDuplicates, normalizeUrl, parseBrowserHtml, parseCsvBookmarks, parseCsvText, planImport, toBrowserHtml, toCsvRows } from './io.ts'
import { bindTexts, TEXTS, langOf, sub } from './texts.ts'

const app = document.getElementById('app')!
const MAX_IMPORT = 500

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

  const fail = (e: unknown) => toast(errText(e, msk.context?.lang), { tone: 'err', ms: 6000 })
  const head = el('header', { class: 'bk-head' })
  const bar = el('div', { class: 'bk-bar' })
  const body = el('div', { class: 'bk-body' })
  app.replaceChildren(el('div', { class: 'bk' }, head, bar, body))

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
  })

  const valuesOf = (b: BookmarkLike, over: Partial<BookmarkLike> = {}) => {
    const v = { ...b, ...over }
    return { title: v.title, url: v.url, note: v.note, tags: JSON.stringify(cleanTags(v.tags)), favorite: v.favorite }
  }
  const canWrite = (b: Bookmark) => b.row.my_level === 'write' || b.row.my_level === 'manage'

  // ----------------------------------------------------------------------------------------------------------- the form
  const form = (existing?: Bookmark) => {
    const title = el('input', { type: 'text', maxlength: '160', 'aria-label': tr().fTitle, placeholder: tr().titleHint })
    const url = el('input', { type: 'text', inputmode: 'url', autocapitalize: 'off', spellcheck: 'false', maxlength: '2000', 'aria-label': tr().fUrl, placeholder: 'https://' })
    const note = el('textarea', { rows: '4', maxlength: '2000', 'aria-label': tr().fNote })
    const favorite = el('input', { type: 'checkbox', id: 'bk-fav' })
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
      const values = valuesOf({ title: title.value, url: url.value, note: note.value, tags: tagBox.get(), favorite: favorite.checked })
      try {
        if (existing) await api.update(existing.id, values)
        else await api.create(values)
        d.close()
        await load(true)
      } catch (e) {
        fail(e)
        ok.disabled = false
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

  const card = (b: Bookmark) => {
    const c = el('article', { class: 'bk-card', 'data-testid': 'bookmark' })
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
        avatar((b.title.trim()[0] ?? hostOf(b.url)[0] ?? '?').toUpperCase(), true),
        el('div', { class: 'bk-id' }, el('h2', {}, b.title), el('p', { class: 'bk-host' }, hostOf(b.url))),
        star,
      ),
    )
    if (b.note.trim()) c.append(el('p', { class: 'bk-note' }, b.note))
    if (b.tags.length) c.append(el('div', { class: 'bk-tags' }, ...b.tags.map((t) => el('span', { class: 'bk-tag' }, t))))
    const acts = el('div', { class: 'bk-acts' })
    const href = safeHref(b.url)
    if (href) acts.append(el('a', { class: 'msk-btn mini', href, target: '_blank', rel: 'noopener noreferrer' }, tr().open))
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
    return [imp, exp, dup, file]
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
      { keys: 'n', label: tr().scNew, run: (e) => (e.preventDefault(), form()), when: () => msk.can('create') },
      { keys: '/', label: tr().scSearch, run: (e) => (e.preventDefault(), search.focus()) },
    ],
    { labels: { title: tr().scTitle, close: tr().close, general: tr().title, then: tr().scThen } },
  )
  addEventListener('pagehide', () => keys.dispose())
  msk.onContext((ctx) => {
    if (langOf(ctx.lang) === lang) return
    lang = langOf(ctx.lang)
    draw()
  })
  void msk.loading(load())
}

connect()
  .then(mount)
  .catch((e) => {
    app.textContent = TEXTS[langOf(undefined)].failed + errText(e)
  })
