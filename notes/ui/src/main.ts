// UI of the Notes plugin: the notes as post-its (coloured, resizable, with the tags of the person) or as a list, a panel to read
// the open note and edit it, and the management of the tags (English by default; Italian and Spanish follow the language of the host).
import '@mosaikit/plugin-api/style.css'
import './notes.css'
import { checkProgress, connect, el, errText, mountCrud, progress, renderMarkdown, toggleCheck, type CrudClient, type CrudView, type EditorCtx, type ItemCtx, type Msk, type Row } from '@mosaikit/plugin-api'
import { COLORS, colorOfName, isColor, paletteCss, type Color } from './palette.ts'
import { cleanName, hasTag, MAX_TAG, parseTags, removeTag, renameTag, sameTag, tagValues, withoutRepeats } from './tags.ts'
import { clampSize, resizedBy, tiltOf } from './size.ts'
import { bindTexts, TEXTS, langOf } from './texts.ts'
import { translateTool } from './translate.ts'
import { mdToolbar, saveText } from './mdbar.ts'
import { editTogether } from './collab.ts'

const PAGE = 100

const app = document.getElementById('app')!

/** Every row of a resource, a page at a time. */
async function listAll(api: CrudClient): Promise<Row[]> {
  const out: Row[] = []
  let cursor: string | undefined
  do {
    const r = await api.list({ limit: PAGE, cursor })
    out.push(...r.rows)
    cursor = r.next ?? undefined
  } while (cursor)
  return out
}

const subst = (s: string, n: string | number) => s.replace('{n}', String(n))

async function mount(msk: Msk) {
  bindTexts(msk)
  let lang = langOf(msk.context?.lang)
  const T = () => TEXTS[lang]
  const notesApi = msk.crud('notes')
  const tagsApi = msk.crud('note_tags')
  const style = el('style')
  style.textContent = paletteCss()
  document.head.append(style)

  // the tags of the person (with their colour) and the notes they can see (for the names in use)
  let defs: Row[] = []
  let notes: Row[] = []
  let tagFilter = ''
  const refresh = async () => {
    ;[defs, notes] = await Promise.all([listAll(tagsApi).catch(() => []), listAll(notesApi).catch(() => [])])
  }
  const nameOfDef = (d: Row) => String(d.values.name ?? '')
  const defOf = (name: string) => defs.find((d) => sameTag(nameOfDef(d), name))
  const tagColor = (name: string): Color => {
    const c = defOf(name)?.values.color
    return isColor(c) ? c : colorOfName(name)
  }
  const shownName = (name: string) => (defOf(name) ? name : (T().legacyTags[name.toLowerCase()] ?? name))
  const known = () => withoutRepeats([...defs.map(nameOfDef), ...notes.flatMap((n) => parseTags(n.values.tags))]).sort((a, b) => a.localeCompare(b))
  const tagChip = (name: string) => el('span', { class: `pi-tag pc-${tagColor(name)}` }, shownName(name))

  // the page of the navigation of the shell it was opened at: all, mine, shared or a tag
  const at = msk.at ?? 'all'
  const navTag = at.startsWith('tag-') ? at.slice(4) : null
  const isPinned = (row: Row) => !!row.values.pinned
  const isArchived = (row: Row) => !!row.values.archived
  const where = (row: Row) => {
    const tags = parseTags(row.values.tags)
    if (tagFilter && !hasTag(tags, tagFilter)) return false
    // archived notes are only in the Archive page; everywhere else they are out of the way
    if (at === 'archive') return isArchived(row)
    if (isArchived(row)) return false
    if (at === 'mine') return row.owner_id === msk.user?.id
    if (at === 'shared') return row.owner_id !== msk.user?.id
    return navTag ? hasTag(tags, navTag) : true
  }
  // the header reads «Notes › subsection»
  const section = () => (at === 'archive' ? T().archived : at === 'mine' ? T().mine : at === 'shared' ? T().shared : navTag ? `${T().tag}: ${T().legacyTags[navTag] ?? navTag}` : T().all)
  const who = (c: ItemCtx) => (c.row.owner_id !== msk.user?.id ? subst(T().sharedBy, c.row.owner_name) : '')
  const tagsRow = (tags: string[], c: ItemCtx) => el('div', { class: 'nfoot' }, ...tags.map(tagChip), ...(who(c) ? [el('span', { class: 'nwho' }, who(c))] : []))
  const colorOf = (c: ItemCtx): Color => (isColor(c.value('color')) ? (c.value('color') as Color) : 'yellow')

  /** The text of a note drawn as Markdown (a plain line when there is none), with the progress of its check list under it. */
  const bodyBox = (cls: string, body: string) => {
    const box = el('div', { class: cls + (body ? ' msk-md' : ' none') })
    if (!body) {
      box.textContent = T().empty
      return box
    }
    box.append(renderMarkdown(body))
    const p = checkProgress(body)
    if (p.total) box.append(el('div', { class: 'npg' }, progress({ value: p.done, max: p.total, label: subst2(T().progress, p.done, p.total) }), el('span', { class: 'ncount' }, `${p.done}/${p.total}`)))
    return box
  }
  const subst2 = (s: string, d: number, n: number) => s.replace('{d}', String(d)).replace('{n}', String(n))

  // --- the list view: the note as a card in a column
  const card = (c: ItemCtx) => {
    const body = c.text('body').trim()
    return el('div', { class: 'note' }, el('strong', { class: 'ntitle' }, (isPinned(c.row) ? '📌 ' : '') + (c.text('title') || T().untitled)), bodyBox('nbody', body), tagsRow(parseTags(c.value('tags')), c))
  }
  // --- the post-it: its content, then its box (colour, size, tilt, the grip and the colour menu)
  const postit = (c: ItemCtx) => {
    const body = c.text('body').trim()
    return el('div', { class: 'pi-in' }, el('strong', { class: 'pi-title' }, c.text('title') || T().untitled), bodyBox('pi-body', body), tagsRow(parseTags(c.value('tags')), c))
  }
  const closeMenus = (except?: HTMLElement) => {
    for (const p of document.querySelectorAll<HTMLElement>('.pi-pop:not([hidden])')) {
      if (p === except) continue
      p.hidden = true
      p.parentElement?.querySelector('.pi-pal')?.setAttribute('aria-expanded', 'false')
    }
  }
  document.addEventListener('click', (e) => closeMenus((e.target as HTMLElement).closest('.pi')?.querySelector<HTMLElement>('.pi-pop') ?? undefined))
  const postitBox = (c: ItemCtx, box: HTMLElement) => {
    const size = clampSize(c.value('w'), c.value('h'))
    box.classList.add('pi', `pc-${colorOf(c)}`)
    if (isPinned(c.row)) box.classList.add('pinned')
    box.style.width = `${size.w}px`
    box.style.height = `${size.h}px`
    box.style.setProperty('--pi-tilt', `${tiltOf(c.row.id)}deg`)
    if (!c.canWrite) return
    box.setAttribute('aria-keyshortcuts', 'Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown')
    // saving a size draws the list again: the focus goes back to the note
    const commit = (w: number, h: number) => {
      const had = box.contains(document.activeElement) || document.activeElement === document.body
      void c.update({ w, h }).then(() => had && document.querySelector<HTMLElement>(`[data-id="${CSS.escape(c.row.id)}"]`)?.focus({ preventScroll: true }))
    }
    const apply = (w: number, h: number) => {
      const s = clampSize(w, h)
      box.style.width = `${s.w}px`
      box.style.height = `${s.h}px`
      return s
    }
    // the size of the last key press is saved after a pause; a drag that ends first must not be overwritten by it
    let timer: ReturnType<typeof setTimeout> | undefined
    const grip = el('button', { type: 'button', class: 'pi-grip', 'aria-label': T().resize, title: T().resize })
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      grip.setPointerCapture(e.pointerId)
      const [x0, y0, w0, h0] = [e.clientX, e.clientY, box.offsetWidth, box.offsetHeight]
      let last = { w: w0, h: h0 }
      const move = (m: PointerEvent) => (last = apply(w0 + m.clientX - x0, h0 + m.clientY - y0))
      const up = () => {
        grip.removeEventListener('pointermove', move)
        grip.removeEventListener('pointerup', up)
        grip.removeEventListener('pointercancel', up)
        clearTimeout(timer)
        if (last.w !== w0 || last.h !== h0) commit(last.w, last.h)
      }
      grip.addEventListener('pointermove', move)
      grip.addEventListener('pointerup', up)
      grip.addEventListener('pointercancel', up)
    })
    box.addEventListener('keydown', (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return
      const s = resizedBy(e.key, box.offsetWidth, box.offsetHeight, e.shiftKey)
      if (!s) return
      e.preventDefault()
      e.stopPropagation()
      const now = apply(s.w, s.h)
      clearTimeout(timer)
      timer = setTimeout(() => commit(now.w, now.h), 500)
    })
    // the quick menu of the colour
    const pop = el('div', { class: 'pi-pop', role: 'group', 'aria-label': T().noteColour })
    pop.hidden = true
    const pal = el('button', { type: 'button', class: 'pi-pal', 'aria-label': T().noteColour, 'aria-haspopup': 'true', 'aria-expanded': 'false', title: T().noteColour })
    for (const col of COLORS) {
      const sw = el('button', { type: 'button', class: `pi-sw pc-${col}`, 'aria-label': T().colorNames[col], 'aria-pressed': String(col === colorOf(c)), title: T().colorNames[col] })
      sw.addEventListener('click', (e) => {
        e.stopPropagation()
        pop.hidden = true
        if (col !== colorOf(c)) void c.update({ color: col })
      })
      pop.append(sw)
    }
    pal.addEventListener('click', (e) => {
      e.stopPropagation()
      closeMenus(pop)
      pop.hidden = !pop.hidden
      pal.setAttribute('aria-expanded', String(!pop.hidden))
    })
    pop.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      pop.hidden = true
      pal.setAttribute('aria-expanded', 'false')
      pal.focus()
    })
    const pin = el('button', { type: 'button', class: 'pi-pin', 'aria-pressed': String(isPinned(c.row)), 'aria-label': isPinned(c.row) ? T().unpin : T().pin, title: isPinned(c.row) ? T().unpin : T().pin }, '📌')
    pin.addEventListener('click', (e) => {
      e.stopPropagation()
      void c.update({ pinned: !isPinned(c.row) })
    })
    box.append(pal, pop, grip, pin)
  }

  const reader = (c: ItemCtx) => {
    const body = c.text('body').trim()
    const text = el('div', { class: 'nread' + (body ? ' msk-md' : ' none') })
    if (body) {
      text.append(renderMarkdown(body, c.canWrite ? { onToggle: (line, checked) => void c.update({ body: toggleCheck(String(c.value('body') ?? ''), line, checked) }) } : {}))
      const p = checkProgress(body)
      if (p.total) text.prepend(el('div', { class: 'npg big' }, progress({ value: p.done, max: p.total, label: subst2(T().progress, p.done, p.total) }), el('span', { class: 'ncount' }, subst2(T().progress, p.done, p.total))))
    } else text.textContent = T().empty
    const acts = el('div', { class: 'nacts' })
    const act = (label: string, fn: () => void) => {
      const b = el('button', { type: 'button', class: 'msk-btn ghost mini' }, label)
      b.addEventListener('click', fn)
      acts.append(b)
    }
    if (c.canWrite) {
      act((isPinned(c.row) ? '📌 ' + T().unpin : '📌 ' + T().pin), () => void c.update({ pinned: !isPinned(c.row) }))
      act(isArchived(c.row) ? T().restore : T().archive, () => void c.update({ archived: !isArchived(c.row) }).then(() => msk.toast(isArchived(c.row) ? T().restoredMsg : T().archivedMsg)))
    }
    act(T().exportMd, () => {
      saveText(`# ${c.text('title') || T().untitled}\n\n${String(c.value('body') ?? '')}\n`, `${(c.text('title') || 'note').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60)}.md`)
      msk.toast(T().exportedMsg)
    })
    return el('article', { class: 'note-read' }, el('h2', {}, c.text('title') || T().untitled), tagsRow(parseTags(c.value('tags')), c), text, acts)
  }

  // --- the editor: the colour and the tags of the note, next to its fields
  const editor = (e: EditorCtx, box: HTMLElement) => {
    if (!e.canWrite) return
    // a Markdown toolbar above the text field of the form (the form is in the page once the editor has drawn its box)
    const t = T()
    setTimeout(() => {
      const ta = box.closest('.msk-form')?.querySelector<HTMLTextAreaElement>('[data-key="body"]')
      if (!ta || ta.parentElement?.querySelector('.msk-rt-bar')) return
      ta.before(mdToolbar(ta, { bold: t.bold, italic: t.italic, heading: t.heading, list: t.bullets, checks: t.checks, quote: t.quote, code: t.code, link: t.link, group: t.formatting }))
      ta.setAttribute('placeholder', t.mdHelp)
      // an open note is edited together with the people who have it open for editing too (the text is saved with the form, as before)
      if (e.row?.id && !ta.dataset.together) {
        ta.dataset.together = '1'
        editTogether(msk, ta, e.row.id, { editingWith: t.editingWith, tooLong: t.tooLongTogether }, ta.parentElement?.querySelector<HTMLElement>('.msk-rt-bar') ?? ta)
      }
    }, 0)
    const color: Color = isColor(e.value('color')) ? (e.value('color') as Color) : 'yellow'
    let sel = parseTags(e.value('tags'))
    const swatches = COLORS.map((col) => {
      const b = el('button', { type: 'button', role: 'radio', class: `pi-sw pc-${col}`, 'aria-label': T().colorNames[col], 'aria-checked': String(col === color), title: T().colorNames[col] })
      b.addEventListener('click', () => {
        e.set('color', col)
        for (const s of swatches) s.setAttribute('aria-checked', String(s === b))
      })
      return b
    })
    const colours = el('div', { class: 'pi-swatches', role: 'radiogroup', 'aria-label': T().noteColour }, ...swatches)
    const chooser = el('div', { class: 'pi-choose', role: 'group', 'aria-label': T().tagsOfNote })
    const input = el('input', { type: 'text', class: 'pi-newtag', maxlength: String(MAX_TAG), placeholder: T().newTag, 'aria-label': T().newTag })
    const add = el('button', { type: 'button', class: 'msk-btn ghost' }, T().addTag)
    const save = () => {
      const v = tagValues(sel)
      e.set('tags', v.tags)
      e.set('tag', v.tag)
    }
    const names = () => withoutRepeats([...known(), ...sel])
    const draw = (focus?: string) => {
      chooser.replaceChildren(
        ...names().map((name) => {
          const on = hasTag(sel, name)
          const b = el('button', { type: 'button', class: `pi-tag pi-pick pc-${tagColor(name)}`, 'aria-pressed': String(on) }, shownName(name))
          b.addEventListener('click', () => {
            sel = on ? removeTag(sel, name) : [...sel, name]
            save()
            draw(name)
          })
          return b
        }),
      )
      if (focus) chooser.querySelectorAll<HTMLElement>('.pi-pick')[names().findIndex((n) => sameTag(n, focus))]?.focus()
    }
    const addNew = () => {
      const name = cleanName(input.value)
      if (!name) return
      if (!hasTag(sel, name)) sel = [...sel, known().find((k) => sameTag(k, name)) ?? name]
      input.value = ''
      save()
      draw()
    }
    add.addEventListener('click', addNew)
    input.addEventListener('keydown', (k) => {
      if (k.key === 'Enter') {
        k.preventDefault()
        addNew()
      }
    })
    draw()
    box.append(
      el('div', { class: 'msk-field' }, el('span', { class: 'pi-label' }, T().colour), colours),
      el('div', { class: 'msk-field' }, el('span', { class: 'pi-label' }, T().tags), chooser, el('div', { class: 'pi-addrow' }, input, add)),
    )
  }

  // --- the management of the tags: create, rename, change colour, delete
  const mapNotes = async (fn: (tags: string[]) => string[] | null) => {
    for (const n of notes) {
      if (n.my_level === 'read') continue
      const next = fn(parseTags(n.values.tags))
      if (next) await notesApi.update(n.id, tagValues(next))
    }
  }
  let dirty = false
  const manage = () => {
    const dlg = el('dialog', { class: 'pi-dialog', 'aria-labelledby': 'pi-mt' })
    const list = el('ul', { class: 'pi-tlist' })
    const fail = (e: unknown) => msk.toast(errText(e, msk.context?.lang), true)
    const colourSelect = (value: Color, label: string) => {
      const s = el('select', { class: 'pi-csel', 'aria-label': label })
      for (const col of COLORS) s.append(el('option', { value: col }, T().colorNames[col]))
      s.value = value
      return s
    }
    const after = async (message: string) => {
      await refresh()
      dirty = true
      draw()
      msk.toast(message)
    }
    const exists = (name: string, except?: string) => known().some((k) => sameTag(k, name) && !(except && k === except))
    const draw = () => {
      const all = known()
      list.replaceChildren(
        ...(all.length
          ? all.map((name) => {
              const used = notes.filter((n) => hasTag(parseTags(n.values.tags), name)).length
              const input = el('input', { type: 'text', value: shownName(name), maxlength: String(MAX_TAG), 'aria-label': subst(T().nameOf, shownName(name)) })
              const pick = colourSelect(tagColor(name), subst(T().colourOf, shownName(name)))
              const dot = el('span', { class: `pi-dot pc-${tagColor(name)}`, 'aria-hidden': 'true' })
              pick.addEventListener('change', () => {
                void (async () => {
                  const d = defOf(name)
                  if (d) await tagsApi.update(d.id, { color: pick.value })
                  else await tagsApi.create({ name, color: pick.value })
                  await after(T().tagSaved)
                })().catch(fail)
              })
              input.addEventListener('change', () => {
                const to = cleanName(input.value)
                if (!to || to === shownName(name)) {
                  input.value = shownName(name)
                  return
                }
                if (exists(to, name)) {
                  input.value = shownName(name)
                  msk.toast(T().tagExists, true)
                  return
                }
                void (async () => {
                  const d = defOf(name)
                  if (d) await tagsApi.update(d.id, { name: to })
                  else await tagsApi.create({ name: to, color: tagColor(name) })
                  await mapNotes((tags) => (hasTag(tags, name) ? renameTag(tags, name, to) : null))
                  await after(T().tagSaved)
                })().catch(fail)
              })
              const del = el('button', { type: 'button', class: 'msk-btn danger', 'aria-label': subst(T().deleteTagOf, shownName(name)) }, T().deleteTag)
              del.addEventListener('click', () => {
                void (async () => {
                  if (!(await msk.confirm(subst(T().confirmDelete, shownName(name))))) return
                  await mapNotes((tags) => (hasTag(tags, name) ? removeTag(tags, name) : null))
                  const d = defOf(name)
                  if (d) await tagsApi.remove(d.id)
                  if (sameTag(tagFilter, name)) tagFilter = ''
                  await after(T().tagDeleted)
                })().catch(fail)
              })
              return el('li', { class: 'pi-trow' }, dot, input, pick, el('span', { class: 'pi-used' }, used === 1 ? T().noteN : subst(T().notesN, used)), del)
            })
          : [el('li', { class: 'pi-none' }, T().noTags)]),
      )
    }
    const name = el('input', { type: 'text', maxlength: String(MAX_TAG), 'aria-label': T().tagName, placeholder: T().newTag })
    const color = colourSelect(COLORS[0], T().colour)
    const form = el('form', { class: 'pi-newrow' }, name, color, el('button', { type: 'submit', class: 'msk-btn' }, T().addTag))
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const n = cleanName(name.value)
      if (!n) return
      if (exists(n)) return msk.toast(T().tagExists, true)
      void (async () => {
        await tagsApi.create({ name: n, color: color.value })
        name.value = ''
        await after(T().tagAdded)
      })().catch(fail)
    })
    const close = el('button', { type: 'button', class: 'msk-btn ghost' }, T().close)
    close.addEventListener('click', () => dlg.close())
    dlg.addEventListener('close', () => {
      dlg.remove()
      if (dirty) reopen()
    })
    dlg.append(el('h2', { id: 'pi-mt' }, T().tags), el('p', { class: 'pi-mtext' }, T().manageText), form, list, el('div', { class: 'msk-actions' }, close))
    document.body.append(dlg)
    draw()
    dirty = false
    dlg.showModal()
  }

  // --- the page
  const byPinned = (a: Row, b: Row) => Number(isPinned(b)) - Number(isPinned(a))
  const views = (): CrudView[] => [
    { key: 'postits', label: T().postits, kind: 'flow', item: postit, box: postitBox, sort: byPinned },
    { key: 'list', label: T().list, kind: 'list', item: card, sort: byPinned },
  ]
  const open = () => {
    const filter = el('select', { class: 'pi-tagfilter', 'aria-label': T().filterTag })
    // the names in use may change with every note saved: the choices are made again from the notes loaded
    const fill = () => {
      filter.replaceChildren(el('option', { value: '' }, T().allTags), ...known().map((n) => el('option', { value: n }, shownName(n))))
      filter.value = known().some((n) => n === tagFilter) ? tagFilter : ''
      if (filter.value !== tagFilter) tagFilter = filter.value
    }
    fill()
    filter.addEventListener('change', () => {
      tagFilter = filter.value
      reopen()
    })
    const manageBtn = el('button', { type: 'button', class: 'msk-btn ghost' }, T().tags)
    manageBtn.addEventListener('click', () => void refresh().then(manage))
    return mountCrud(app, msk, 'notes', {
      title: T().title,
      section: section(),
      newLabel: T().newLabel,
      empty: at === 'archive' ? { art: 'notes', title: T().emptyArchive, text: T().emptyArchiveText, actions: [] } : { art: 'notes', title: T().emptyTitle, text: T().emptyText },
      columns: ['title'],
      where,
      views: views(),
      reader,
      editor,
      onLoad: (rows) => {
        notes = rows
        fill()
      },
      bar: [filter, manageBtn],
      detail: (row, box) => translateTool(msk, row, box, lang),
    })
  }
  let off = () => {}
  const reopen = () => {
    off()
    void refresh().then(() => {
      off = open()
    })
  }
  await refresh()
  off = open()
  // the view follows the host for its own texts; the title and the button are ours
  msk.onContext((ctx) => {
    if (langOf(ctx.lang) === lang) return
    lang = langOf(ctx.lang)
    reopen()
  })
}

connect()
  .then(mount)
  .catch((e) => {
    app.textContent = TEXTS[langOf(undefined)].failed + errText(e)
  })
