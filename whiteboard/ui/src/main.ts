// UI of the Whiteboard plugin: the list of boards as cards, and the editor of one board (see editor.ts).
import '@mosaikit/plugin-api/style.css'
import './whiteboard.css'
import * as Y from 'yjs'
import { avatar, confirmDialog, connect, dialog, el, emptyState, errText, skeleton, toast, type Msk, type Row } from '@mosaikit/plugin-api'
import { thumbnail } from './canvas.ts'
import { initialOf, personColor } from './logic.ts'
import { Board, applySnapshot } from './sync.ts'
import { bindTexts, TEXTS, langOf, sub } from './texts.ts'
import { openEditor } from './editor.ts'

const app = document.getElementById('app')!

function mount(msk: Msk) {
  document.documentElement.classList.add('msk-fill')
  bindTexts(msk)
  let lang = langOf(msk.context?.lang)
  const tr = () => TEXTS[lang]
  const api = msk.crud('whiteboards')
  let boards: Row[] = []
  let editor: { destroy: () => Promise<void> } | null = null

  const fail = (e: unknown) => toast(errText(e, msk.context?.lang), { tone: 'err', ms: 6000 })
  const head = el('header', { class: 'wb-head' })
  const body = el('div', { class: 'wb-body' })
  const listPage = el('div', { class: 'wb-list-page' }, head, body)
  app.replaceChildren(listPage)

  const when = (iso: string) => new Date(iso).toLocaleString(msk.context?.lang || undefined, { dateStyle: 'medium', timeStyle: 'short' })

  // ----------------------------------------------------------------------------------------------------------- the editor
  const open = async (id: string) => {
    try {
      const row = await api.get(id)
      const ed = openEditor({
        msk,
        row,
        tr: tr(),
        onBack: () => {
          editor = null
          app.replaceChildren(listPage)
          void load()
        },
      })
      editor = ed
      app.replaceChildren(ed.el)
    } catch (e) {
      toast(tr().openFailed + errText(e, msk.context?.lang), { tone: 'err', ms: 6000 })
    }
  }

  // ------------------------------------------------------------------------------------------------------------ new board
  const create = () => {
    const title = el('input', { type: 'text', maxlength: '120', 'aria-label': tr().fTitle, placeholder: tr().fTitle }) as HTMLInputElement
    title.value = tr().untitled
    const ok = el('button', { type: 'button', class: 'msk-btn' }, tr().create)
    const no = el('button', { type: 'button', class: 'msk-btn ghost' }, tr().cancel)
    const d = dialog({ title: tr().newTitle, body: el('div', { class: 'msk-field wb-form' }, el('label', {}, tr().fTitle), title), actions: [no, ok] })
    no.addEventListener('click', d.close)
    const go = async () => {
      const t = title.value.trim()
      if (!t) {
        toast(tr().needTitle, { tone: 'err' })
        return title.focus()
      }
      ok.disabled = true
      try {
        const row = await api.create({ title: t, bg: 'plain', snapshot: '' })
        d.close()
        await open(row.id)
      } catch (e) {
        fail(e)
        ok.disabled = false
      }
    }
    ok.addEventListener('click', () => void go())
    title.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void go()
    })
    title.focus()
    title.select()
  }

  const remove = async (r: Row) => {
    const name = String(r.values.title ?? '')
    if (!(await confirmDialog({ title: tr().remove, text: sub(tr().removeConfirm, { n: name }), ok: tr().remove, cancel: tr().cancel, danger: true }))) return
    try {
      await api.remove(r.id)
      await load()
    } catch (e) {
      fail(e)
    }
  }

  // ------------------------------------------------------------------------------------------------------------ the list
  const picture = (r: Row): HTMLElement => {
    const box = el('div', { class: 'wb-thumb' })
    const snap = String(r.values.snapshot ?? '')
    let shown = false
    if (snap) {
      try {
        const b = new Board(new Y.Doc())
        if (applySnapshot(b.doc, snap)) {
          const t = thumbnail(b.all())
          if (t) {
            box.append(t)
            shown = true
          }
        }
        b.destroy()
      } catch {
        /* the tile below */
      }
    }
    if (!shown) {
      const title = String(r.values.title ?? '')
      box.classList.add('tile')
      box.style.setProperty('--tile', personColor(title).stroke)
      box.append(el('span', { 'aria-hidden': 'true' }, initialOf(title)))
    }
    return box
  }

  const card = (r: Row) => {
    const title = String(r.values.title ?? '')
    const c = el('article', { class: 'wb-card', 'data-testid': 'board' })
    const openBtn = el('button', { type: 'button', class: 'wb-open', 'aria-label': `${tr().open}: ${title}` }, picture(r), el('span', { class: 'wb-name' }, title))
    openBtn.addEventListener('click', () => void open(r.id))
    const meta = el('p', { class: 'wb-meta' }, avatar(r.owner_name), el('span', {}, [sub(tr().by, { n: r.owner_name }), sub(tr().edited, { d: when(r.updated_at) })].join(' · ')))
    if (r.my_level === 'read') meta.append(el('span', { class: 'msk-badge' }, tr().viewOnly))
    const acts = el('div', { class: 'wb-acts' })
    if (r.my_level === 'manage') {
      const share = el('button', { type: 'button', class: 'msk-btn ghost mini' }, tr().share)
      share.addEventListener('click', () => void msk.share(r.id).catch(fail))
      const del = el('button', { type: 'button', class: 'msk-btn ghost mini danger-text' }, tr().remove)
      del.addEventListener('click', () => void remove(r))
      acts.append(share, del)
    }
    c.append(openBtn, meta)
    if (acts.childElementCount) c.append(acts)
    return c
  }

  const draw = () => {
    head.replaceChildren(el('h1', {}, tr().title))
    const add = el('button', { type: 'button', class: 'msk-btn' }, tr().newBoard)
    add.addEventListener('click', create)
    add.hidden = !msk.can('create')
    head.append(add)
    body.replaceChildren()
    if (!boards.length) {
      const b = el('button', { type: 'button', class: 'msk-btn' }, tr().newBoard)
      b.addEventListener('click', create)
      body.append(emptyState({ art: 'whiteboard', title: tr().emptyTitle, text: tr().emptyText, actions: msk.can('create') ? [b] : [] }))
      return
    }
    const grid = el('div', { class: 'wb-grid' })
    for (const r of boards) grid.append(card(r))
    body.append(grid)
  }

  const load = async () => {
    body.replaceChildren(skeleton({ kind: 'cards', count: 3 }))
    try {
      boards = (await api.list({ sort: 'updated_at', dir: 'desc', limit: 100 })).rows
    } catch (e) {
      body.textContent = tr().loadFailed + errText(e, msk.context?.lang)
      return
    }
    draw()
  }

  msk.onContext((ctx) => {
    if (langOf(ctx.lang) === lang) return
    lang = langOf(ctx.lang)
    if (!editor) draw()
  })
  void load()
}

connect()
  .then(mount)
  .catch((e) => {
    app.textContent = TEXTS[langOf(undefined)].failed + errText(e)
  })
