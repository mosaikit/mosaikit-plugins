// UI of the Bookmarks plugin: a grid of cards with a search box, the tag filter with counts, the favourites toggle and the
// form of a bookmark. Nothing is fetched from the saved sites (the avatar is a letter), and every text is a DOM text node.
import '@mosaikit/plugin-api/style.css'
import './bookmarks.css'
import {
  avatar,
  confirmDialog,
  connect,
  dialog,
  el,
  emptyState,
  errText,
  filteredEmpty,
  skeleton,
  tagInput,
  toast,
  type Msk,
  type Row,
} from '@mosaikit/plugin-api'
import { applyFilter, cleanTags, hostOf, parseTags, safeHref, tagCounts, toggleTag, type BookmarkLike, type Filter } from './logic.ts'
import { bindTexts, TEXTS, langOf, sub } from './texts.ts'

const app = document.getElementById('app')!

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

  const drawList = () => {
    body.replaceChildren()
    const shown = applyFilter(items, filter)
    if (!shown.length) {
      body.append(filteredEmpty(tr().emptyFilter, tr().clearFilters, clearFilters))
      return
    }
    body.append(el('div', { class: 'bk-grid' }, ...shown.map(card)))
  }

  const draw = () => {
    head.replaceChildren(el('h1', {}, tr().title))
    const add = el('button', { type: 'button', class: 'msk-btn' }, tr().newBookmark)
    add.addEventListener('click', () => form())
    add.hidden = !msk.can('create')
    head.append(add)
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

  msk.onContext((ctx) => {
    if (langOf(ctx.lang) === lang) return
    lang = langOf(ctx.lang)
    draw()
  })
  void load()
}

connect()
  .then(mount)
  .catch((e) => {
    app.textContent = TEXTS[langOf(undefined)].failed + errText(e)
  })
