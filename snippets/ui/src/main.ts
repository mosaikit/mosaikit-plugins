// UI of the Snippets plugin: a list with search, kind and tags at the left, the selected snippet at the right with a big
// Copy button. The body of a snippet is always drawn as a text node (never HTML), with its line breaks kept.
import '@mosaikit/plugin-api/style.css'
import './snippets.css'
import {
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
import { KINDS, filterSnippets, firstLine, kindOf, listOrder, neighbour, normTag, parseTags, tagCounts, type Filter, type SnippetLike } from './logic.ts'
import { bindTexts, TEXTS, langOf, sub } from './texts.ts'

const app = document.getElementById('app')!

interface Snippet extends SnippetLike {
  row: Row
}

/** Copies the text: the clipboard of the browser, or (a frame without that permission, an old browser) a hidden textarea and `execCommand`. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // falls through to the textarea
  }
  const ta = el('textarea', { class: 'sn-clip', readonly: '', 'aria-hidden': 'true', tabindex: '-1' })
  ta.value = text
  document.body.append(ta)
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  ta.remove()
  return ok
}

function mount(msk: Msk) {
  document.documentElement.classList.add('msk-fill')
  bindTexts(msk)
  let lang = langOf(msk.context?.lang)
  const tr = () => TEXTS[lang]
  const api = msk.crud('snippets')
  let snippets: Snippet[] = []
  const filter: Filter = { q: '', kind: '', tag: '' }
  let selectedId: string | null = null
  let showDetail = false

  const fail = (e: unknown) => toast(errText(e, msk.context?.lang), { tone: 'err', ms: 6000 })
  const head = el('header', { class: 'sn-head' })
  const body = el('div', { class: 'sn-body' })
  app.replaceChildren(el('div', { class: 'sn' }, head, body))

  const toSnippet = (r: Row): Snippet => ({
    id: r.id,
    row: r,
    title: String(r.values.title ?? ''),
    body: String(r.values.body ?? ''),
    kind: kindOf(r.values.kind),
    tags: parseTags(r.values.tags),
    createdAt: r.created_at,
  })

  // ----------------------------------------------------------------------------------------------------------- the form
  const form = (existing?: Snippet) => {
    const title = el('input', { type: 'text', maxlength: '120', 'aria-label': tr().fTitle, placeholder: tr().fTitle })
    const kind = el('select', { 'aria-label': tr().fKind })
    for (const k of KINDS) kind.append(el('option', { value: k }, tr().kinds[k]))
    const text = el('textarea', { rows: '12', maxlength: '20000', spellcheck: 'false', 'aria-label': tr().fBody, placeholder: tr().fBody })
    const tags = tagInput({
      label: tr().fTags,
      values: existing?.tags ?? [],
      suggestions: tagCounts(snippets).map((t) => t.tag),
      placeholder: tr().tagPlaceholder,
      removeLabel: tr().removeTag,
      onChange: () => {},
    })
    title.value = existing?.title ?? ''
    kind.value = existing?.kind ?? 'text'
    text.value = existing?.body ?? ''
    const field = (label: string, input: HTMLElement) => el('div', { class: 'msk-field' }, el('label', {}, label), input)
    const ok = el('button', { type: 'button', class: 'msk-btn' }, existing ? tr().save : tr().create)
    const no = el('button', { type: 'button', class: 'msk-btn ghost' }, tr().cancel)
    const d = dialog({
      title: existing ? tr().editTitle : tr().newTitle,
      body: el('div', { class: 'sn-form' }, field(tr().fTitle, title), field(tr().fKind, kind), field(tr().fBody, text), field(tr().fTags, tags.el)),
      actions: [no, ok],
    })
    no.addEventListener('click', d.close)
    const go = async () => {
      if (!title.value.trim()) {
        toast(tr().needTitle, { tone: 'err' })
        return title.focus()
      }
      if (!text.value.trim()) {
        toast(tr().needBody, { tone: 'err' })
        return text.focus()
      }
      ok.disabled = true
      const values = { title: title.value.trim(), body: text.value, kind: kind.value, tags: JSON.stringify(tags.get().map(normTag).filter(Boolean)) }
      try {
        const saved = existing ? await api.update(existing.id, values) : await api.create(values)
        d.close()
        selectedId = saved.id
        showDetail = true
        await load()
      } catch (e) {
        fail(e)
        ok.disabled = false
      }
    }
    ok.addEventListener('click', () => void go())
    title.focus()
  }

  const remove = async (s: Snippet) => {
    if (!(await confirmDialog({ title: tr().remove, text: sub(tr().removeConfirm, { n: s.title }), ok: tr().remove, cancel: tr().cancel, danger: true }))) return
    try {
      await api.remove(s.id)
      if (selectedId === s.id) {
        selectedId = null
        showDetail = false
      }
      await load()
    } catch (e) {
      fail(e)
    }
  }

  const copy = async (s: Snippet) => {
    if (await copyText(s.body)) toast(tr().copied, { tone: 'ok' })
    else toast(tr().copyFailed, { tone: 'err', ms: 6000 })
  }

  // ----------------------------------------------------------------------------------------------------- the two panes
  let main: HTMLElement | null = null
  let search: HTMLInputElement
  let kindSel: HTMLSelectElement
  let tagsBox: HTMLElement
  let listBox: HTMLElement
  let detailBox: HTMLElement

  const select = (id: string | null, focus = false) => {
    selectedId = id
    showDetail = id !== null
    draw()
    if (focus && id) listBox.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.focus()
  }

  const clearFilters = () => {
    filter.q = ''
    filter.kind = ''
    filter.tag = ''
    search.value = ''
    kindSel.value = ''
    draw()
  }

  const buildMain = () => {
    search = el('input', { type: 'search', 'aria-label': tr().search, placeholder: tr().searchPlaceholder, autocomplete: 'off' })
    search.value = filter.q
    search.addEventListener('input', () => {
      filter.q = search.value
      draw()
    })
    search.addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowDown') return
      const first = shown()[0]
      if (!first) return
      ev.preventDefault()
      select(first.id, true)
    })
    kindSel = el('select', { 'aria-label': tr().filterKind })
    kindSel.append(el('option', { value: '' }, tr().allKinds))
    for (const k of KINDS) kindSel.append(el('option', { value: k }, tr().kinds[k]))
    kindSel.value = filter.kind
    kindSel.addEventListener('change', () => {
      filter.kind = kindSel.value
      draw()
    })
    tagsBox = el('div', { class: 'sn-tags', role: 'group', 'aria-label': tr().tagsLabel })
    listBox = el('ul', { class: 'sn-list', 'aria-label': tr().list })
    listBox.addEventListener('keydown', (ev) => {
      const step = ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowUp' ? -1 : 0
      if (!step) return
      ev.preventDefault()
      const id = neighbour(shown().map((s) => s.id), selectedId, step)
      if (id) select(id, true)
    })
    detailBox = el('section', { class: 'sn-detail', 'aria-live': 'polite' })
    main = el('div', { class: 'sn-main' }, el('div', { class: 'sn-side' }, el('div', { class: 'sn-filters' }, search, kindSel, tagsBox), listBox), detailBox)
  }

  const shown = () => listOrder(filterSnippets(snippets, filter))

  const drawTags = () => {
    // the counts follow the search and the kind; the chosen tag stays even when nothing carries it any more
    const counts = tagCounts(filterSnippets(snippets, { ...filter, tag: '' }))
    if (filter.tag && !counts.some((c) => c.tag === filter.tag)) counts.push({ tag: filter.tag, count: 0 })
    tagsBox.replaceChildren(
      ...counts.map((c) => {
        const b = el('button', { type: 'button', class: 'sn-tag', 'aria-pressed': String(filter.tag === c.tag), 'data-testid': 'tag-chip' }, c.tag, el('small', {}, String(c.count)))
        b.addEventListener('click', () => {
          filter.tag = filter.tag === c.tag ? '' : c.tag
          draw()
        })
        return b
      }),
    )
    tagsBox.hidden = counts.length === 0
  }

  const drawList = () => {
    const list = shown()
    if (!list.length) {
      listBox.replaceChildren(el('li', { class: 'sn-nomatch' }, filteredEmpty(tr().noMatch, tr().clearFilters, clearFilters)))
      return
    }
    listBox.replaceChildren(
      ...list.map((s) => {
        const b = el(
          'button',
          { type: 'button', class: 'sn-item', 'data-testid': 'snippet', 'data-id': s.id, 'aria-current': String(s.id === selectedId) },
          el('span', { class: 'sn-item-top' }, el('span', { class: 'sn-item-title' }, s.title), el('span', { class: 'sn-kind' }, tr().kinds[kindOf(s.kind)])),
          el('span', { class: 'sn-item-line' }, firstLine(s.body)),
        )
        b.addEventListener('click', () => select(s.id))
        return el('li', {}, b)
      }),
    )
  }

  const drawDetail = () => {
    const s = snippets.find((x) => x.id === selectedId)
    if (!s) {
      detailBox.replaceChildren(el('p', { class: 'sn-pick' }, tr().pick))
      return
    }
    const back = el('button', { type: 'button', class: 'msk-btn ghost mini sn-back' }, '← ' + tr().back)
    back.addEventListener('click', () => {
      showDetail = false
      draw()
    })
    const lines = s.body.split('\n').length
    const meta = el(
      'div',
      { class: 'sn-meta' },
      el('span', { class: 'sn-kind', 'data-testid': 'snippet-kind' }, tr().kinds[kindOf(s.kind)]),
      ...s.tags.map((t) => el('span', { class: 'sn-tag', 'data-testid': 'snippet-tag' }, t)),
      el('span', {}, [sub(tr().by, { n: s.row.owner_name }), lines === 1 ? tr().line : sub(tr().lines, { n: lines })].join(' · ')),
    )
    const copyBtn = el('button', { type: 'button', class: 'msk-btn sn-copy' }, tr().copy)
    copyBtn.addEventListener('click', () => void copy(s))
    const acts = el('div', { class: 'sn-acts' }, copyBtn)
    if (s.row.my_level === 'write' || s.row.my_level === 'manage') {
      const edit = el('button', { type: 'button', class: 'msk-btn ghost' }, tr().edit)
      edit.addEventListener('click', () => form(s))
      acts.append(edit)
    }
    if (s.row.my_level === 'manage') {
      const share = el('button', { type: 'button', class: 'msk-btn ghost' }, tr().share)
      share.addEventListener('click', () => void msk.share(s.id).catch(fail))
      const del = el('button', { type: 'button', class: 'msk-btn ghost danger-text' }, tr().remove)
      del.addEventListener('click', () => void remove(s))
      acts.append(share, del)
    }
    // a text node in a block that keeps the line breaks: whatever the snippet holds is only text
    const code = el('pre', { class: 'sn-code', 'data-testid': 'snippet-body', tabindex: '0', role: 'group', 'aria-label': s.title })
    code.textContent = s.body
    detailBox.replaceChildren(back, el('h2', {}, s.title), meta, acts, code)
  }

  const draw = () => {
    head.replaceChildren(el('h1', {}, tr().title))
    const add = el('button', { type: 'button', class: 'msk-btn' }, tr().newSnippet)
    add.addEventListener('click', () => form())
    add.hidden = !msk.can('create')
    head.append(add)
    if (!snippets.length) {
      main = null
      body.replaceChildren(
        emptyState({
          art: 'snippets',
          title: tr().emptyTitle,
          text: tr().emptyText,
          actions: msk.can('create') ? [Object.assign(el('button', { type: 'button', class: 'msk-btn' }, tr().newSnippet), { onclick: () => form() })] : [],
        }),
      )
      return
    }
    if (!main) {
      buildMain()
      body.replaceChildren(main!)
    }
    main!.classList.toggle('detail', showDetail)
    drawTags()
    drawList()
    drawDetail()
  }

  const load = async () => {
    if (!snippets.length) body.replaceChildren(skeleton({ kind: 'rows', count: 4 }))
    try {
      snippets = (await api.list({ sort: 'created_at', dir: 'desc', limit: 500 })).rows.map(toSnippet)
    } catch (e) {
      body.textContent = tr().loadFailed + errText(e, msk.context?.lang)
      return
    }
    if (selectedId && !snippets.some((s) => s.id === selectedId)) {
      selectedId = null
      showDetail = false
    }
    // the body may have been replaced by the skeleton or the empty state
    if (main && !body.contains(main)) main = null
    draw()
  }

  msk.onContext((ctx) => {
    if (langOf(ctx.lang) === lang) return
    lang = langOf(ctx.lang)
    main = null
    draw()
  })
  void msk.loading(load())
}

connect()
  .then(mount)
  .catch((e) => {
    app.textContent = TEXTS[langOf(undefined)].failed + errText(e)
  })
