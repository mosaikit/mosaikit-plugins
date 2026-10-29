// UI of the Notes plugin: the notes as post-its (coloured, resizable, with the tags of the person) or as a list, a panel to read
// the open note and edit it, and the management of the tags (English by default; Italian and Spanish follow the language of the host).
import '@mosaikit/plugin-api/style.css'
import './notes.css'
import { connect, el, errText, mountCrud, type CrudClient, type CrudView, type EditorCtx, type ItemCtx, type Msk, type Row } from '@mosaikit/plugin-api'
import { COLORS, colorOfName, isColor, paletteCss, type Color } from './palette.ts'
import { cleanName, hasTag, MAX_TAG, parseTags, removeTag, renameTag, sameTag, tagValues, withoutRepeats } from './tags.ts'
import { clampSize, resizedBy, tiltOf } from './size.ts'
import { translateTool } from './translate.ts'

const PAGE = 100

const COLOR_NAMES = {
  en: { yellow: 'yellow', orange: 'orange', pink: 'pink', violet: 'violet', blue: 'blue', teal: 'teal', green: 'green', grey: 'grey' },
  it: { yellow: 'giallo', orange: 'arancione', pink: 'rosa', violet: 'viola', blue: 'blu', teal: 'turchese', green: 'verde', grey: 'grigio' },
  es: { yellow: 'amarillo', orange: 'naranja', pink: 'rosa', violet: 'violeta', blue: 'azul', teal: 'turquesa', green: 'verde', grey: 'gris' },
}
const TEXTS = {
  en: {
    title: 'Notes', all: 'All notes', newLabel: '＋ New note', postits: 'Post-its', list: 'List', emptyTitle: 'No notes yet', emptyText: 'Write the first note: it stays yours until you share it.',
    failed: 'Could not start the UI of the plugin: ', mine: 'My notes', shared: 'Shared with me', tag: 'Tag', sharedBy: 'Shared by {n}', empty: 'No text', untitled: 'Untitled',
    tags: 'Tags', allTags: 'All tags', filterTag: 'Filter by tag', colour: 'Colour', noteColour: 'Colour of the note', resize: 'Resize the note: drag, or press Alt and the arrow keys',
    tagsOfNote: 'Tags of the note', newTag: 'New tag', addTag: 'Add', tagName: 'Name of the tag', manageText: 'Every tag has its own colour. Renaming or deleting a tag changes it in all your notes.',
    nameOf: 'Name of the tag {n}', colourOf: 'Colour of the tag {n}', deleteTag: 'Delete', deleteTagOf: 'Delete the tag {n}', close: 'Close', noTags: 'No tags yet: add the first one above.',
    notesN: '{n} notes', noteN: '1 note', tagExists: 'A tag with this name exists already', tagDeleted: 'Tag deleted', tagSaved: 'Tag saved', tagAdded: 'Tag added',
    confirmDelete: 'Delete the tag “{n}”? It is removed from all the notes that have it.',
  },
  it: {
    title: 'Note', all: 'Tutte le note', newLabel: '＋ Nuova nota', postits: 'Post-it', list: 'Elenco', emptyTitle: 'Ancora nessuna nota', emptyText: 'Scrivi la prima nota: resta tua finché non la condividi.',
    failed: 'Impossibile avviare la UI del plugin: ', mine: 'Le mie note', shared: 'Condivise con me', tag: 'Tag', sharedBy: 'Condivisa da {n}', empty: 'Nessun testo', untitled: 'Senza titolo',
    tags: 'Tag', allTags: 'Tutti i tag', filterTag: 'Filtra per tag', colour: 'Colore', noteColour: 'Colore della nota', resize: 'Ridimensiona la nota: trascina, oppure premi Alt e i tasti freccia',
    tagsOfNote: 'Tag della nota', newTag: 'Nuovo tag', addTag: 'Aggiungi', tagName: 'Nome del tag', manageText: 'Ogni tag ha il suo colore. Rinominare o eliminare un tag lo cambia in tutte le tue note.',
    nameOf: 'Nome del tag {n}', colourOf: 'Colore del tag {n}', deleteTag: 'Elimina', deleteTagOf: 'Elimina il tag {n}', close: 'Chiudi', noTags: 'Ancora nessun tag: aggiungi il primo qui sopra.',
    notesN: '{n} note', noteN: '1 nota', tagExists: 'Esiste già un tag con questo nome', tagDeleted: 'Tag eliminato', tagSaved: 'Tag salvato', tagAdded: 'Tag aggiunto',
    confirmDelete: 'Eliminare il tag “{n}”? Viene tolto da tutte le note che lo hanno.',
  },
  es: {
    title: 'Notas', all: 'Todas las notas', newLabel: '＋ Nueva nota', postits: 'Post-its', list: 'Lista', emptyTitle: 'Todavía no hay notas', emptyText: 'Escribe la primera nota: es tuya hasta que la compartas.',
    failed: 'No se pudo iniciar la interfaz del plugin: ', mine: 'Mis notas', shared: 'Compartidas conmigo', tag: 'Etiqueta', sharedBy: 'Compartida por {n}', empty: 'Sin texto', untitled: 'Sin título',
    tags: 'Etiquetas', allTags: 'Todas las etiquetas', filterTag: 'Filtrar por etiqueta', colour: 'Color', noteColour: 'Color de la nota', resize: 'Cambia el tamaño de la nota: arrastra, o pulsa Alt y las flechas',
    tagsOfNote: 'Etiquetas de la nota', newTag: 'Nueva etiqueta', addTag: 'Añadir', tagName: 'Nombre de la etiqueta', manageText: 'Cada etiqueta tiene su propio color. Cambiar el nombre o eliminar una etiqueta lo cambia en todas tus notas.',
    nameOf: 'Nombre de la etiqueta {n}', colourOf: 'Color de la etiqueta {n}', deleteTag: 'Eliminar', deleteTagOf: 'Eliminar la etiqueta {n}', close: 'Cerrar', noTags: 'Todavía no hay etiquetas: añade la primera arriba.',
    notesN: '{n} notas', noteN: '1 nota', tagExists: 'Ya existe una etiqueta con este nombre', tagDeleted: 'Etiqueta eliminada', tagSaved: 'Etiqueta guardada', tagAdded: 'Etiqueta añadida',
    confirmDelete: '¿Eliminar la etiqueta “{n}”? Se quita de todas las notas que la tienen.',
  },
}
// the three tags of the first versions keep their names in the language of the person until the person gives them a name
const TAGS: Record<string, { en: string; it: string; es: string }> = {
  personal: { en: 'personal', it: 'personale', es: 'personal' },
  work: { en: 'work', it: 'lavoro', es: 'trabajo' },
  urgent: { en: 'urgent', it: 'urgente', es: 'urgente' },
}

type Lang = keyof typeof TEXTS
const langOf = (l: string | undefined): Lang => {
  const x = (l ?? navigator.language).toLowerCase()
  return x.startsWith('it') ? 'it' : x.startsWith('es') ? 'es' : 'en'
}
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
  const shownName = (name: string) => (defOf(name) ? name : (TAGS[name.toLowerCase()]?.[lang] ?? name))
  const known = () => withoutRepeats([...defs.map(nameOfDef), ...notes.flatMap((n) => parseTags(n.values.tags))]).sort((a, b) => a.localeCompare(b))
  const tagChip = (name: string) => el('span', { class: `pi-tag pc-${tagColor(name)}` }, shownName(name))

  // the page of the navigation of the shell it was opened at: all, mine, shared or a tag
  const at = msk.at ?? 'all'
  const navTag = at.startsWith('tag-') ? at.slice(4) : null
  const where = (row: Row) => {
    const tags = parseTags(row.values.tags)
    if (tagFilter && !hasTag(tags, tagFilter)) return false
    if (at === 'mine') return row.owner_id === msk.user?.id
    if (at === 'shared') return row.owner_id !== msk.user?.id
    return navTag ? hasTag(tags, navTag) : true
  }
  // the header reads «Notes › subsection»
  const section = () => (at === 'mine' ? T().mine : at === 'shared' ? T().shared : navTag ? `${T().tag}: ${TAGS[navTag]?.[lang] ?? navTag}` : T().all)
  const who = (c: ItemCtx) => (c.row.owner_id !== msk.user?.id ? subst(T().sharedBy, c.row.owner_name) : '')
  const tagsRow = (tags: string[], c: ItemCtx) => el('div', { class: 'nfoot' }, ...tags.map(tagChip), ...(who(c) ? [el('span', { class: 'nwho' }, who(c))] : []))
  const colorOf = (c: ItemCtx): Color => (isColor(c.value('color')) ? (c.value('color') as Color) : 'yellow')

  // --- the list view: the note as a card in a column
  const card = (c: ItemCtx) => {
    const body = c.text('body').trim()
    return el('div', { class: 'note' }, el('strong', { class: 'ntitle' }, c.text('title') || T().untitled), el('p', { class: 'nbody' + (body ? '' : ' none') }, body || T().empty), tagsRow(parseTags(c.value('tags')), c))
  }
  // --- the post-it: its content, then its box (colour, size, tilt, the grip and the colour menu)
  const postit = (c: ItemCtx) => {
    const body = c.text('body').trim()
    return el('div', { class: 'pi-in' }, el('strong', { class: 'pi-title' }, c.text('title') || T().untitled), el('p', { class: 'pi-body' + (body ? '' : ' none') }, body || T().empty), tagsRow(parseTags(c.value('tags')), c))
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
        if (last.w !== w0 || last.h !== h0) commit(last.w, last.h)
      }
      grip.addEventListener('pointermove', move)
      grip.addEventListener('pointerup', up)
      grip.addEventListener('pointercancel', up)
    })
    let timer: ReturnType<typeof setTimeout> | undefined
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
      const sw = el('button', { type: 'button', class: `pi-sw pc-${col}`, 'aria-label': COLOR_NAMES[lang][col], 'aria-pressed': String(col === colorOf(c)), title: COLOR_NAMES[lang][col] })
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
    box.append(pal, pop, grip)
  }

  const reader = (c: ItemCtx) => {
    const body = c.text('body').trim()
    return el('article', { class: 'note-read' }, el('h2', {}, c.text('title') || T().untitled), tagsRow(parseTags(c.value('tags')), c), el('div', { class: 'nread' + (body ? '' : ' none') }, body || T().empty))
  }

  // --- the editor: the colour and the tags of the note, next to its fields
  const editor = (e: EditorCtx, box: HTMLElement) => {
    if (!e.canWrite) return
    const color: Color = isColor(e.value('color')) ? (e.value('color') as Color) : 'yellow'
    let sel = parseTags(e.value('tags'))
    const swatches = COLORS.map((col) => {
      const b = el('button', { type: 'button', role: 'radio', class: `pi-sw pc-${col}`, 'aria-label': COLOR_NAMES[lang][col], 'aria-checked': String(col === color), title: COLOR_NAMES[lang][col] })
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
      for (const col of COLORS) s.append(el('option', { value: col }, COLOR_NAMES[lang][col]))
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
  const views = (): CrudView[] => [
    { key: 'postits', label: T().postits, kind: 'flow', item: postit, box: postitBox },
    { key: 'list', label: T().list, kind: 'list', item: card },
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
      empty: { art: 'notes', title: T().emptyTitle, text: T().emptyText },
      columns: ['title'],
      where,
      views: views(),
      reader,
      editor,
      onLoad: (rows) => {
        notes = rows
        fill()
      },
      headFilters: [manageBtn, filter],
      detail: (row, box) => translateTool(msk, row, box, lang === 'it' ? 'it' : 'en'),
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
