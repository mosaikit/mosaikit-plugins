// The editor of a board: toolbar, the SVG canvas with its tools, live editing with the people who have the board open, and saving.
import { avatarStack, dialog, el, errText, toast, type Msk, type Row } from '@mosaikit/plugin-api'
import { bgPattern, drawObject, exportPng, exportSvg, s, svgText } from './canvas.ts'
import {
  DEFAULT_COLOR, FRAME_SIZE, FRAME_TITLE_H, HANDLES, TEMPLATE_IDS, contains, templateBox, templateObjects, withFrameChildren, INK, NOTE_SIZE, PALETTE, PAPER, SHAPE_SIZE, TEXT_FONT, TEXT_WIDTH, backZ, byZ, canEdit, cycle, describeBoard, fitView, fontOf, frontZ, handlePoint,
  intersects, lineHeightOf, newId, normRect, objBox, penFrom, penPath, resizeRect, scalePoints, stepZoom, swatchOf, textHeight, toBoard, toScreen, topAt, unionBounds, zoomAt,
  type Handle, type Obj, type ObjType, type Pt, type Rect, type TemplateId, type TemplateLabel, type View,
} from './logic.ts'
import { Board, Live, applySnapshot, encodeSnapshot, fitsSnapshot, presenceState, type ChannelPerson, type Cursor } from './sync.ts'
import { sub, type Texts } from './texts.ts'

type Tool = 'select' | 'hand' | ObjType

export interface EditorOptions {
  msk: Msk
  row: Row
  tr: Texts
  onBack: () => void
}

const ICONS: Record<string, string[]> = {
  back: ['M15 18l-6-6 6-6'],
  select: ['M5 3l14 8-6.5 1.8L10 19z'],
  hand: ['M8 12V6.5a1.5 1.5 0 0 1 3 0V11', 'M11 10.5V4.5a1.5 1.5 0 0 1 3 0V11', 'M14 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5a5 5 0 0 1-4-2L4 14.5a1.5 1.5 0 0 1 2.3-1.8L8 14'],
  note: ['M4 4h16v10l-6 6H4z', 'M14 20v-6h6'],
  rect: ['M4 6h16v12H4z'],
  ellipse: ['M12 5c4.4 0 8 3.1 8 7s-3.6 7-8 7-8-3.1-8-7 3.6-7 8-7z'],
  text: ['M5 7V5h14v2', 'M12 5v14', 'M9 19h6'],
  arrow: ['M5 19L19 5', 'M10 5h9v9'],
  pen: ['M4 20l1-4L16 5l3 3L8 19z', 'M14 7l3 3'],
  frame: ['M4 4h16v16H4z', 'M4 9h16'],
  template: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  undo: ['M9 14L4 9l5-5', 'M4 9h10a6 6 0 0 1 0 12h-3'],
  redo: ['M15 14l5-5-5-5', 'M20 9H10a6 6 0 0 0 0 12h3'],
  del: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  copy: ['M9 9h11v11H9z', 'M5 15V4h11'],
  front: ['M12 3l9 5-9 5-9-5z', 'M3 13l9 5 9-5'],
  back2: ['M12 21l9-5-9-5-9 5z', 'M3 11l9-5 9 5'],
  zoomIn: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M21 21l-5-5', 'M11 8v6', 'M8 11h6'],
  zoomOut: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M21 21l-5-5', 'M8 11h6'],
  fit: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
  image: ['M4 5h16v14H4z', 'M4 16l5-5 4 4 3-3 4 4', 'M15 9h.01'],
  file: ['M7 3h7l5 5v13H7z', 'M14 3v5h5', 'M10 14l-2 2 2 2', 'M14 14l2 2-2 2'],
  share: ['M12 15V3', 'M8 7l4-4 4 4', 'M5 12v8h14v-8'],
  help: ['M9.5 9a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8', 'M12 17h.01'],
}

function icon(name: string): SVGSVGElement {
  const svg = s('svg', { viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })
  for (const d of ICONS[name] ?? []) svg.append(s('path', { d }))
  return svg
}

/** Opens the editor of a board. `el` goes in the page; `destroy` saves what is not saved and closes the channel. */
export function openEditor(o: EditorOptions): { el: HTMLElement; destroy: () => Promise<void> } {
  const { msk, row, tr } = o
  const api = msk.crud('whiteboards')
  const id = row.id
  const canWrite = canEdit(row.my_level)
  const me = msk.user?.id ?? ''
  const myName = String((msk.user as { name?: string } | undefined)?.name ?? '')
  const cid = crypto.randomUUID()
  const board = new Board()
  applySnapshot(board.doc, String(row.values.snapshot ?? ''))
  let bg = board.bg ?? (['dots', 'grid'].includes(String(row.values.bg)) ? String(row.values.bg) : 'plain')
  let tool: Tool = 'select'
  let color = DEFAULT_COLOR
  let view: View = { x: 0, y: 0, k: 1 }
  const sel = new Set<string>()
  let editing: string | null = null
  let cursors: Cursor[] = []
  let people: ChannelPerson[] = []
  let destroyed = false

  const names: Record<ObjType, string> = { note: tr.kNote, rect: tr.kRect, ellipse: tr.kEllipse, text: tr.kText, arrow: tr.kArrow, pen: tr.kPen, frame: tr.kFrame }
  const colorNames = tr.colorNames

  // ------------------------------------------------------------------------------------------------------------ the canvas
  const svg = s('svg', { class: 'wb-svg', role: 'application', 'aria-label': tr.canvas, 'aria-describedby': 'wb-desc', tabindex: 0 })
  const defs = s('defs')
  const paper = s('rect', { width: '100%', height: '100%', fill: PAPER })
  const pattern = s('rect', { width: '100%', height: '100%', fill: 'none' })
  const world = s('g', { class: 'wb-world' })
  const objLayer = s('g')
  const draft = s('g', { 'pointer-events': 'none' })
  const selLayer = s('g')
  const curLayer = s('g', { 'pointer-events': 'none' })
  world.append(objLayer, draft, selLayer, curLayer)
  svg.append(defs, paper, pattern, world)
  const desc = el('p', { id: 'wb-desc', class: 'wb-sr' })
  const edit = el('textarea', { class: 'wb-edit', 'aria-label': tr.editText, rows: '1' })
  edit.hidden = true
  const stage = el('div', { class: 'wb-stage' }, svg, edit, desc)

  const gs = new Map<string, SVGGElement>()
  const zOf = new Map<string, number>()
  const dirty = new Set<string>()
  let raf = 0
  let fallback: ReturnType<typeof setTimeout> | undefined

  const size = () => {
    const r = svg.getBoundingClientRect()
    return { w: r.width || 800, h: r.height || 600 }
  }

  const setBackground = () => {
    defs.replaceChildren()
    const p = bgPattern(bg, 'wb-pat')
    if (p) {
      defs.append(p)
      pattern.setAttribute('fill', 'url(#wb-pat)')
    } else pattern.setAttribute('fill', 'none')
    applyView()
  }
  const applyView = () => {
    world.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`)
    const p = defs.firstElementChild
    if (p) p.setAttribute('patternTransform', `translate(${view.x} ${view.y}) scale(${view.k})`)
    // a grid at 10% is a gray haze: it is left out when it would be denser than one line every 6 pixels
    pattern.style.display = view.k < 0.25 ? 'none' : ''
    drawSelection()
    drawCursors()
    zoomBtn.textContent = Math.round(view.k * 100) + '%'
    zoomBtn.setAttribute('aria-label', sub(tr.zoomLevel, { n: Math.round(view.k * 100) }))
    placeEditor()
  }
  const setView = (v: View) => {
    view = v
    applyView()
  }

  const schedule = () => {
    if (raf || destroyed) return
    raf = requestAnimationFrame(run)
    fallback = setTimeout(run, 120)
  }
  const run = () => {
    cancelAnimationFrame(raf)
    clearTimeout(fallback)
    raf = 0
    if (destroyed) return
    let reorder = false
    for (const oid of dirty) {
      const ob = board.get(oid)
      const g = gs.get(oid)
      if (!ob) {
        g?.remove()
        gs.delete(oid)
        zOf.delete(oid)
        sel.delete(oid)
        if (editing === oid) stopEdit(false)
        continue
      }
      let node = g
      if (!node) {
        node = s('g', { class: 'wb-obj', 'data-id': oid, 'data-type': ob.type })
        gs.set(oid, node)
        objLayer.append(node)
        reorder = true
      }
      if (zOf.get(oid) !== ob.z) {
        zOf.set(oid, ob.z)
        reorder = true
      }
      drawObject(ob, node, { hideText: editing === oid })
    }
    dirty.clear()
    if (reorder) for (const ob of byZ(board.all())) {
      const g = gs.get(ob.id)
      if (g) objLayer.append(g)
    }
    drawSelection()
    describe()
    refreshTools()
  }
  board.objects.observeDeep((evs) => {
    for (const oid of board.touched(evs)) dirty.add(oid)
    schedule()
  })
  board.meta.observe(() => {
    const b = board.bg
    if (b && b !== bg) {
      bg = b
      setBackground()
      bgSel.value = bg
    }
  })
  const markAll = () => {
    for (const ob of board.all()) dirty.add(ob.id)
    schedule()
  }

  const describe = () => {
    const all = board.all()
    const t = all.length ? describeBoard(all, names) : tr.empty
    desc.textContent = `${t}. ${sel.size ? sub(tr.selectedN, { n: sel.size }) + '. ' : ''}${tr.canvasHelp}`
  }

  // ------------------------------------------------------------------------------------------------------------ selection
  const selected = (): Obj[] => [...sel].map((i) => board.get(i)).filter((x): x is Obj => !!x)
  const HS = 9
  const handleRects = (): { h: Handle | 'p0' | 'p1'; p: Pt }[] => {
    const one = selected()
    if (!canWrite || one.length !== 1) return []
    const ob = one[0]!
    if (ob.type === 'arrow') {
      return [
        { h: 'p0', p: { x: ob.x + (ob.points[0] ?? 0), y: ob.y + (ob.points[1] ?? 0) } },
        { h: 'p1', p: { x: ob.x + (ob.points[2] ?? 0), y: ob.y + (ob.points[3] ?? 0) } },
      ]
    }
    const b = objBox(ob)
    return HANDLES.map((h) => ({ h, p: handlePoint(b, h) }))
  }
  function drawSelection() {
    selLayer.replaceChildren()
    const list = selected()
    if (!list.length) return
    const box = unionBounds(list.map(objBox))!
    const k = view.k
    const ACC = '#3f51b5'
    if (!(list.length === 1 && list[0]!.type === 'arrow')) {
      selLayer.append(s('rect', { x: box.x - 3 / k, y: box.y - 3 / k, width: box.w + 6 / k, height: box.h + 6 / k, fill: 'none', stroke: ACC, 'stroke-width': 1.5 / k, 'stroke-dasharray': `${5 / k} ${4 / k}` }))
    }
    for (const hd of handleRects()) {
      const r = HS / k
      selLayer.append(
        hd.h === 'p0' || hd.h === 'p1'
          ? s('circle', { cx: hd.p.x, cy: hd.p.y, r: r * 0.7, fill: '#fff', stroke: ACC, 'stroke-width': 2 / k, 'data-handle': hd.h })
          : s('rect', { x: hd.p.x - r / 2, y: hd.p.y - r / 2, width: r, height: r, fill: '#fff', stroke: ACC, 'stroke-width': 1.5 / k, 'data-handle': hd.h }),
      )
    }
  }
  const handleAt = (p: Pt) => {
    const tol = 11 / view.k
    return handleRects().find((hd) => Math.abs(hd.p.x - p.x) <= tol && Math.abs(hd.p.y - p.y) <= tol)
  }
  const select = (ids: string[]) => {
    stopEdit(true)
    sel.clear()
    for (const i of ids) sel.add(i)
    drawSelection()
    describe()
    refreshTools()
  }

  // ------------------------------------------------------------------------------------------------------------ other people
  function drawCursors() {
    curLayer.replaceChildren()
    for (const c of cursors) {
      const k = 1 / view.k
      const w = Math.min(160, 14 + c.name.length * 7)
      curLayer.append(
        s(
          'g',
          { class: 'wb-cursor', 'data-name': c.name, transform: `translate(${c.x} ${c.y}) scale(${k})` },
          s('path', { d: 'M0 0l0 17 4.5-4 3 7 2.5-1-3-7 6 0z', fill: c.color, stroke: '#fff', 'stroke-width': 1.2 }),
          s('rect', { x: 12, y: 18, width: w, height: 20, rx: 10, fill: c.color }),
          s('text', { x: 12 + w / 2, y: 32, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 600, fill: '#fff', 'font-family': 'system-ui, sans-serif' }, c.name),
        ),
      )
    }
  }
  const whoBox = el('div', { class: 'wb-who', 'data-testid': 'who' })
  const drawPeople = () => {
    const other = people.filter((p) => !(p.id === me && (p.state as { c?: string } | undefined)?.c === cid))
    whoBox.replaceChildren()
    whoBox.dataset.count = String(other.length)
    whoBox.setAttribute('role', 'img')
    whoBox.setAttribute('aria-label', other.length ? sub(tr.withN, { n: other.length }) + ': ' + other.map((p) => p.name).join(', ') : tr.alone)
    if (other.length) whoBox.append(avatarStack(other.map((p) => p.name), 4))
    else whoBox.append(el('span', { class: 'wb-dim' }, tr.alone))
  }

  // ------------------------------------------------------------------------------------------------------------ live
  const channel = msk.realtime.open({ resource: id, name: 'doc', state: presenceState(cid, canWrite) })
  let conn = 'connecting'
  const live = new Live(board, channel, {
    cid,
    me,
    canWrite,
    onCursors: (c) => {
      cursors = c
      drawCursors()
    },
    onPeople: (p) => {
      people = p
      drawPeople()
    },
    onWriterLeft: () => {
      // someone who could save left: what they had is in this board too, so it is saved once more from here
      if (canWrite) markDirty()
    },
    onReconnect: () => void reload(),
  })
  channel.onStatus((st) => {
    conn = st
    drawStatus()
  })

  /** A reader that lost the connection reads what was saved again (it cannot ask the others). */
  async function reload() {
    try {
      const cur = await api.get(id)
      applySnapshot(board.doc, String(cur.values.snapshot ?? ''))
    } catch {
      /* the next time */
    }
  }

  // ------------------------------------------------------------------------------------------------------------ saving
  let isDirty = false
  let saving = false
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let state: 'saved' | 'unsaved' | 'saving' | 'error' = 'saved'
  const saveText = el('span', { class: 'wb-save', role: 'status' })
  const connText = el('span', { class: 'wb-conn' })
  function drawStatus() {
    saveText.textContent = canWrite ? (state === 'saved' ? tr.saved : state === 'saving' ? tr.saving : state === 'error' ? tr.saveFailed.replace(/: $/, '') : tr.unsaved) : tr.viewOnly
    saveText.dataset.state = state
    connText.textContent = conn === 'live' ? tr.live : conn === 'connecting' ? '' : tr.offline
    connText.title = conn === 'live' ? tr.pointers : tr.offline
    connText.className = 'wb-conn ' + (conn === 'live' ? 'on' : 'off')
  }
  function markDirty() {
    if (!canWrite || destroyed) return
    isDirty = true
    state = 'unsaved'
    drawStatus()
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void save(), 3000)
  }
  board.doc.on('update', (_u: Uint8Array, origin: unknown) => {
    if (origin === 'local' || origin === 'local-meta' || origin === board.undo) markDirty()
  })

  /** Saves the board when something changed: first merges what is saved (another writer may have saved), then writes the whole state. */
  async function save(): Promise<void> {
    clearTimeout(saveTimer)
    if (!canWrite) return
    if (saving) {
      saveTimer = setTimeout(() => void save(), 600)
      return
    }
    if (!isDirty) return
    saving = true
    isDirty = false
    state = 'saving'
    drawStatus()
    try {
      live.flush()
      const cur = await api.get(id)
      applySnapshot(board.doc, String(cur.values.snapshot ?? ''))
      const snap = encodeSnapshot(board.doc)
      if (!fitsSnapshot(snap)) {
        state = 'error'
        toast(tr.tooBig, { tone: 'err', ms: 8000 })
        return
      }
      await api.update(id, { snapshot: snap, bg })
      state = isDirty ? 'unsaved' : 'saved'
    } catch (e) {
      isDirty = true
      state = 'error'
      toast(tr.saveFailed + errText(e, msk.context?.lang), { tone: 'err', ms: 6000 })
      saveTimer = setTimeout(() => void save(), 10_000)
    } finally {
      saving = false
      drawStatus()
      if (isDirty && state !== 'error') saveTimer = setTimeout(() => void save(), 1000)
    }
  }
  const onHide = () => {
    if (document.visibilityState === 'hidden') void save()
  }
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('pagehide', onHide)

  // ------------------------------------------------------------------------------------------------------------ changing the board
  const nowFront = () => frontZ(board.all())
  const addObj = (type: ObjType, r: Rect, extra: Partial<Obj> = {}): Obj => {
    const ob: Obj = { id: newId(), type, x: r.x, y: r.y, w: r.w, h: r.h, text: '', color, points: [], z: type === 'frame' ? backZ(board.all()) : nowFront(), author: myName || me, ...extra }
    board.undo.stopCapturing()
    board.add(ob)
    return ob
  }
  const removeSelected = () => {
    if (!canWrite || !sel.size) return
    board.undo.stopCapturing()
    board.remove([...sel])
    sel.clear()
    drawSelection()
  }
  const duplicate = () => {
    if (!canWrite || !sel.size) return
    board.undo.stopCapturing()
    let z = nowFront()
    const ids: string[] = []
    for (const ob of byZ(withFrameChildren(selected(), board.all()))) {
      const copy: Obj = { ...ob, id: newId(), x: ob.x + 24, y: ob.y + 24, z: z++, points: [...ob.points], author: myName || me }
      board.add(copy)
      ids.push(copy.id)
    }
    select(ids)
  }
  const reorder = (front: boolean) => {
    if (!canWrite || !sel.size) return
    board.undo.stopCapturing()
    const others = board.all().filter((x) => !sel.has(x.id))
    let z = front ? frontZ(others) : backZ(others) - sel.size + 1
    const changes: Record<string, Partial<Obj>> = {}
    for (const ob of byZ(selected())) changes[ob.id] = { z: z++ }
    board.patch(changes)
  }
  const nudge = (dx: number, dy: number) => {
    const changes: Record<string, Partial<Obj>> = {}
    for (const ob of selected()) changes[ob.id] = { x: ob.x + dx, y: ob.y + dy }
    board.patch(changes)
  }
  const setColor = (key: string) => {
    color = key
    if (canWrite && sel.size) {
      board.undo.stopCapturing()
      const changes: Record<string, Partial<Obj>> = {}
      for (const ob of selected()) changes[ob.id] = { color: key }
      board.patch(changes)
    }
    refreshTools()
  }

  // ------------------------------------------------------------------------------------------------------------ editing text
  const placeEditor = () => {
    if (!editing) return
    const ob = board.get(editing)
    if (!ob) return
    const p = toScreen(view, { x: ob.x, y: ob.y })
    const font = fontOf(ob.type) * view.k
    const center = ob.type === 'rect' || ob.type === 'ellipse'
    const inset = ob.type === 'ellipse' ? 0.15 : 0
    const bandH = ob.type === 'frame' ? Math.min(ob.h, FRAME_TITLE_H) : ob.h
    Object.assign(edit.style, {
      left: p.x + ob.w * view.k * inset + 'px',
      top: p.y + ob.h * view.k * inset + 'px',
      width: ob.w * view.k * (1 - inset * 2) + 'px',
      height: bandH * view.k * (1 - inset * 2) + 'px',
      fontSize: font + 'px',
      lineHeight: lineHeightOf(fontOf(ob.type)) * view.k + 'px',
      textAlign: center ? 'center' : 'left',
      background: ob.type === 'text' ? 'rgba(255,255,255,0.9)' : swatchOf(ob.color).fill,
      color: ob.type === 'text' ? swatchOf(ob.color).stroke : INK,
    })
  }
  let typed: ReturnType<typeof setTimeout> | undefined
  const pushText = () => {
    if (!editing) return
    const ob = board.get(editing)
    if (!ob || ob.text === edit.value) return
    const patch: Partial<Obj> = { text: edit.value }
    if (ob.type === 'text') patch.h = textHeight(edit.value, ob.w, TEXT_FONT)
    board.patch({ [editing]: patch })
  }
  function startEdit(oid: string) {
    if (!canWrite) return
    const ob = board.get(oid)
    if (!ob || ob.type === 'arrow' || ob.type === 'pen') return
    stopEdit(true)
    editing = oid
    sel.clear()
    sel.add(oid)
    board.undo.stopCapturing()
    edit.hidden = false
    edit.value = ob.text
    edit.placeholder = tr.placeholderNote
    placeEditor()
    dirty.add(oid)
    schedule()
    drawSelection()
    edit.focus()
    edit.select()
  }
  function stopEdit(commit: boolean) {
    if (!editing) return
    clearTimeout(typed)
    const oid = editing
    if (commit) pushText()
    editing = null
    edit.hidden = true
    const ob = board.get(oid)
    // a text object with no text is nothing: it goes
    if (commit && ob && ob.type === 'text' && !ob.text.trim()) board.remove([oid])
    dirty.add(oid)
    schedule()
  }
  edit.addEventListener('input', () => {
    clearTimeout(typed)
    typed = setTimeout(pushText, 450)
  })
  edit.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault()
      stopEdit(true)
      svg.focus()
    }
  })
  edit.addEventListener('blur', () => stopEdit(true))

  // ------------------------------------------------------------------------------------------------------------ pointer
  type Drag =
    | { k: 'pan'; sx: number; sy: number; v: View }
    | { k: 'move'; start: Pt; orig: Map<string, Pt>; moved: boolean; shift: boolean; hitId: string }
    | { k: 'resize'; h: Handle; orig: Obj; start: Pt }
    | { k: 'end'; idx: 0 | 1; orig: Obj }
    | { k: 'marquee'; start: Pt; base: string[] }
    | { k: 'create'; tool: ObjType; start: Pt; cur: Pt; sx: number; sy: number }
    | { k: 'pen'; pts: Pt[] }
  let drag: Drag | null = null
  const pointers = new Map<number, Pt>()
  let pinch: { d: number; c: Pt; v: View } | null = null
  let space = false

  const local = (ev: { clientX: number; clientY: number }): Pt => {
    const r = svg.getBoundingClientRect()
    return { x: ev.clientX - r.left, y: ev.clientY - r.top }
  }
  const at = (ev: { clientX: number; clientY: number }): Pt => toBoard(view, local(ev))

  const drawDraft = () => {
    draft.replaceChildren()
    if (!drag) return
    const sw = swatchOf(color)
    const k = view.k
    if (drag.k === 'marquee') {
      const r = normRect(drag.start, lastPt)
      draft.append(s('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: '#3f51b5', 'fill-opacity': 0.08, stroke: '#3f51b5', 'stroke-width': 1 / k, 'stroke-dasharray': `${4 / k} ${3 / k}` }))
    } else if (drag.k === 'create') {
      if (drag.tool === 'arrow') draft.append(s('path', { d: `M${drag.start.x} ${drag.start.y}L${drag.cur.x} ${drag.cur.y}`, stroke: sw.stroke, 'stroke-width': 3, 'stroke-dasharray': `${6} ${5}`, fill: 'none' }))
      else {
        const r = normRect(drag.start, drag.cur)
        draft.append(
          drag.tool === 'ellipse'
            ? s('ellipse', { cx: r.x + r.w / 2, cy: r.y + r.h / 2, rx: r.w / 2, ry: r.h / 2, fill: sw.fill, 'fill-opacity': 0.6, stroke: sw.stroke, 'stroke-width': 2, 'stroke-dasharray': '6 5' })
            : s('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: sw.fill, 'fill-opacity': 0.6, stroke: sw.stroke, 'stroke-width': 2, 'stroke-dasharray': '6 5' }),
        )
      }
    } else if (drag.k === 'pen') {
      const flat: number[] = []
      for (const p of drag.pts) flat.push(p.x, p.y)
      draft.append(s('path', { d: penPath(flat), stroke: sw.stroke, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }))
    }
  }
  let lastPt: Pt = { x: 0, y: 0 }

  const toolFor = (ev: PointerEvent): Tool => (ev.button === 1 || space || !canWrite ? 'hand' : tool)

  svg.addEventListener('pointerdown', (ev) => {
    svg.focus({ preventScroll: true })
    pointers.set(ev.pointerId, local(ev))
    try {
      svg.setPointerCapture(ev.pointerId)
    } catch {
      /* a pointer that is already gone */
    }
    if (pointers.size === 2) {
      // two fingers: zoom and pan, whatever was going on
      drag = null
      draft.replaceChildren()
      const [a, b] = [...pointers.values()] as [Pt, Pt]
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, v: view }
      return
    }
    if (pointers.size > 2 || ev.button > 1) return
    const sp = local(ev)
    const p = at(ev)
    lastPt = p
    const t = toolFor(ev)
    if (t === 'hand') {
      drag = { k: 'pan', sx: sp.x, sy: sp.y, v: view }
      svg.classList.add('panning')
      return
    }
    if (t === 'select') {
      const hd = handleAt(p)
      const one = selected()[0]
      if (hd && one) {
        board.undo.stopCapturing()
        drag = hd.h === 'p0' || hd.h === 'p1' ? { k: 'end', idx: hd.h === 'p0' ? 0 : 1, orig: one } : { k: 'resize', h: hd.h, orig: one, start: p }
        return
      }
      const top = topAt(board.all(), p, 4 / view.k)
      if (top) {
        const toggle = ev.shiftKey || ev.ctrlKey || ev.metaKey
        if (toggle) {
          if (sel.has(top.id)) sel.delete(top.id)
          else sel.add(top.id)
          drawSelection()
        } else if (!sel.has(top.id)) select([top.id])
        board.undo.stopCapturing()
        const orig = new Map<string, Pt>()
        // a frame moves with what is inside it
        for (const ob of withFrameChildren(selected(), board.all())) orig.set(ob.id, { x: ob.x, y: ob.y })
        drag = { k: 'move', start: p, orig, moved: false, shift: toggle, hitId: top.id }
        return
      }
      const base = ev.shiftKey ? [...sel] : []
      if (!ev.shiftKey) select([])
      drag = { k: 'marquee', start: p, base }
      return
    }
    // a drawing tool
    stopEdit(true)
    if (t === 'pen') drag = { k: 'pen', pts: [p] }
    else drag = { k: 'create', tool: t as ObjType, start: p, cur: p, sx: sp.x, sy: sp.y }
    drawDraft()
  })

  svg.addEventListener('pointermove', (ev) => {
    const sp = local(ev)
    if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, sp)
    const p = toBoard(view, sp)
    lastPt = p
    live.pointer(p)
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()] as [Pt, Pt]
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const z = zoomAt(pinch.v, d / pinch.d, pinch.c)
      setView({ k: z.k, x: z.x + (c.x - pinch.c.x), y: z.y + (c.y - pinch.c.y) })
      return
    }
    if (!drag) return
    switch (drag.k) {
      case 'pan':
        setView({ k: drag.v.k, x: drag.v.x + sp.x - drag.sx, y: drag.v.y + sp.y - drag.sy })
        break
      case 'move': {
        const dx = p.x - drag.start.x
        const dy = p.y - drag.start.y
        if (!drag.moved && Math.hypot(dx, dy) * view.k < 3) return
        drag.moved = true
        if (!canWrite) return
        const changes: Record<string, Partial<Obj>> = {}
        for (const [oid, o0] of drag.orig) changes[oid] = { x: Math.round(o0.x + dx), y: Math.round(o0.y + dy) }
        board.patch(changes)
        break
      }
      case 'resize': {
        const o0 = drag.orig
        const b0 = objBox(o0)
        const nb = resizeRect(b0, drag.h, p.x - drag.start.x, p.y - drag.start.y, 24, ev.shiftKey && drag.h.length === 2)
        const patch: Partial<Obj> = { x: Math.round(nb.x), y: Math.round(nb.y), w: Math.round(nb.w), h: Math.round(nb.h) }
        if (o0.type === 'pen') {
          patch.points = scalePoints(o0.points, { x: b0.x - o0.x, y: b0.y - o0.y, w: b0.w, h: b0.h }, { x: 0, y: 0, w: nb.w, h: nb.h })
        }
        board.patch({ [o0.id]: patch })
        break
      }
      case 'end': {
        const o0 = drag.orig
        const a = { x: o0.x + (o0.points[0] ?? 0), y: o0.y + (o0.points[1] ?? 0) }
        const b = { x: o0.x + (o0.points[2] ?? 0), y: o0.y + (o0.points[3] ?? 0) }
        const n0 = drag.idx === 0 ? { x: Math.round(p.x), y: Math.round(p.y) } : a
        const n1 = drag.idx === 1 ? { x: Math.round(p.x), y: Math.round(p.y) } : b
        board.patch({ [o0.id]: { x: n0.x, y: n0.y, points: [0, 0, n1.x - n0.x, n1.y - n0.y], w: Math.abs(n1.x - n0.x), h: Math.abs(n1.y - n0.y) } })
        break
      }
      case 'marquee': {
        const r = normRect(drag.start, p)
        const ids = board.all().filter((ob) => intersects(r, objBox(ob)) && (ob.type !== 'frame' || contains(r, objBox(ob)))).map((ob) => ob.id)
        sel.clear()
        for (const i of [...drag.base, ...ids]) sel.add(i)
        drawDraft()
        drawSelection()
        break
      }
      case 'create':
        drag.cur = p
        drawDraft()
        break
      case 'pen': {
        const last = drag.pts[drag.pts.length - 1]!
        if (Math.hypot(p.x - last.x, p.y - last.y) * view.k >= 2) {
          drag.pts.push(p)
          drawDraft()
        }
        break
      }
    }
  })

  const finish = (ev: PointerEvent, cancel = false) => {
    pointers.delete(ev.pointerId)
    if (pinch) {
      if (pointers.size < 2) pinch = null
      return
    }
    const d = drag
    drag = null
    svg.classList.remove('panning')
    draft.replaceChildren()
    if (!d || cancel) return
    const p = at(ev)
    if (d.k === 'move') {
      board.undo.stopCapturing()
      // a click on an object of a selection of several, without moving: select just that one
      if (!d.moved && !d.shift && sel.size > 1) select([d.hitId])
    } else if (d.k === 'resize' || d.k === 'end') {
      board.undo.stopCapturing()
      const ob = board.get(d.orig.id)
      if (ob && ob.type === 'text') board.patch({ [ob.id]: { h: textHeight(ob.text, ob.w, TEXT_FONT) } })
    } else if (d.k === 'marquee') {
      drawSelection()
    } else if (d.k === 'pen') {
      const pen = penFrom(d.pts, 1.2 / view.k)
      if (pen) {
        const ob = addObj('pen', pen, { points: pen.points })
        select([ob.id])
      }
    } else if (d.k === 'create') {
      const moved = Math.hypot(local(ev).x - d.sx, local(ev).y - d.sy) > 6
      let ob: Obj | null = null
      if (d.tool === 'arrow') {
        if (moved) ob = addObj('arrow', { x: d.start.x, y: d.start.y, w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y) }, { points: [0, 0, round(p.x - d.start.x), round(p.y - d.start.y)] })
      } else {
        const r = normRect(d.start, p)
        const dflt = d.tool === 'frame' ? FRAME_SIZE : d.tool === 'note' ? NOTE_SIZE : d.tool === 'text' ? { w: TEXT_WIDTH, h: textHeight('', TEXT_WIDTH, TEXT_FONT) } : SHAPE_SIZE
        const box: Rect = moved && r.w >= 24 && r.h >= 16 ? r : { x: d.start.x - dflt.w / 2, y: d.start.y - dflt.h / 2, w: dflt.w, h: dflt.h }
        if (d.tool === 'text' && moved) box.h = textHeight('', box.w, TEXT_FONT)
        ob = addObj(d.tool, { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h) })
      }
      if (ob) {
        setTool('select')
        const made = ob
        // the object is drawn on the next frame: select it now and open its text box once it exists
        select([made.id])
        if (made.type === 'note' || made.type === 'text' || made.type === 'frame') queueMicrotask(() => startEdit(made.id))
      }
    }
  }
  svg.addEventListener('pointerup', (ev) => finish(ev))
  svg.addEventListener('pointercancel', (ev) => finish(ev, true))
  svg.addEventListener('pointerleave', () => live.pointer(null))
  svg.addEventListener('dblclick', (ev) => {
    if (!canWrite) return
    const top = topAt(board.all(), at(ev), 4 / view.k)
    if (top) startEdit(top.id)
  })
  svg.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault()
      const f = Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0015))
      setView(zoomAt(view, f, local(ev)))
    },
    { passive: false },
  )
  svg.addEventListener('contextmenu', (ev) => ev.preventDefault())

  // ------------------------------------------------------------------------------------------------------------ keyboard
  const round = (n: number) => Math.round(n * 10) / 10
  const typing = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement
  const root = el('div', { class: 'wb-ed' })
  root.addEventListener('keydown', (ev) => {
    if (typing(ev.target)) return
    const onCanvas = ev.target === svg
    const mod = ev.ctrlKey || ev.metaKey
    const k = ev.key
    if (k === ' ' && onCanvas) {
      space = true
      svg.classList.add('hand')
      ev.preventDefault()
      return
    }
    if (mod) {
      const lower = k.toLowerCase()
      if (lower === 'z' && canWrite) {
        ev.preventDefault()
        if (ev.shiftKey) board.undo.redo()
        else board.undo.undo()
      } else if (lower === 'y' && canWrite) {
        ev.preventDefault()
        board.undo.redo()
      } else if (lower === 'd' && canWrite) {
        ev.preventDefault()
        duplicate()
      } else if (lower === 'a' && onCanvas) {
        ev.preventDefault()
        if (canWrite) select(board.all().map((x) => x.id))
      }
      return
    }
    if (ev.altKey) return
    const outside = onCanvas || ev.target === document.body || ev.target instanceof HTMLButtonElement
    if (k === 'Delete' || k === 'Backspace') {
      if (outside) {
        ev.preventDefault()
        removeSelected()
      }
    } else if (k === 'Escape') {
      if (sel.size) select([])
      setTool('select')
    } else if (k === 'Enter' && onCanvas) {
      const one = selected()
      if (one.length === 1 && canWrite) {
        ev.preventDefault()
        startEdit(one[0]!.id)
      }
    } else if (k === 'Tab' && onCanvas) {
      const next = cycle(board.all(), [...sel][0], ev.shiftKey ? -1 : 1)
      if (next && canWrite) {
        ev.preventDefault()
        select([next])
      }
    } else if (k.startsWith('Arrow') && onCanvas) {
      ev.preventDefault()
      const step = ev.shiftKey ? 10 : 1
      const dx = k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0
      const dy = k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0
      if (canWrite && sel.size) nudge(dx, dy)
      else setView({ ...view, x: view.x - dx * 4, y: view.y - dy * 4 })
    } else if (outside) {
      const key = k.toLowerCase()
      const tools: Record<string, Tool> = { v: 'select', h: 'hand', n: 'note', r: 'rect', o: 'ellipse', t: 'text', a: 'arrow', p: 'pen', f: 'frame' }
      if (tools[key] && (canWrite || tools[key] === 'hand' || tools[key] === 'select')) setTool(tools[key]!)
      else if (k === '+' || k === '=') zoomBy(1)
      else if (k === '-') zoomBy(-1)
      else if (k === '0') fit()
      else if (k === ']') reorder(true)
      else if (k === '[') reorder(false)
      else if (k === '?') legend()
    }
  })
  root.addEventListener('keyup', (ev) => {
    if (ev.key === ' ') {
      space = false
      svg.classList.remove('hand')
    }
  })
  svg.addEventListener('blur', () => {
    space = false
    svg.classList.remove('hand')
  })

  // ------------------------------------------------------------------------------------------------------------ the toolbar
  function setTool(t: Tool) {
    if (!canWrite && t !== 'hand' && t !== 'select') return
    stopEdit(true)
    tool = t
    svg.dataset.tool = t
    refreshTools()
  }
  const zoomBy = (dir: 1 | -1) => {
    const { w, h } = size()
    setView(zoomAt(view, stepZoom(view.k, dir) / view.k, { x: w / 2, y: h / 2 }))
  }
  const fit = () => {
    const { w, h } = size()
    setView(fitView(unionBounds(board.all().map(objBox)), w, h))
  }

  const btn = (name: string, label: string, onClick: () => void, extra: Record<string, string> = {}) => {
    const b = el('button', { type: 'button', class: 'wb-btn', 'aria-label': label, title: label, ...extra }, icon(name))
    b.addEventListener('click', onClick)
    return b
  }
  const group = (label: string, ...kids: Node[]) => el('div', { class: 'wb-group', role: 'group', 'aria-label': label }, ...kids)

  const toolKeys: [Tool, string, string][] = [
    ['select', 'select', 'V'],
    ['hand', 'hand', 'H'],
    ['note', 'note', 'N'],
    ['rect', 'rect', 'R'],
    ['ellipse', 'ellipse', 'O'],
    ['text', 'text', 'T'],
    ['arrow', 'arrow', 'A'],
    ['pen', 'pen', 'P'],
    ['frame', 'frame', 'F'],
  ]
  const toolBtns = new Map<Tool, HTMLButtonElement>()
  for (const [t, ic, key] of toolKeys) {
    const label = (tr as unknown as Record<string, string>)[t === 'select' ? 'select' : t === 'hand' ? 'hand' : t]!
    const b = btn(ic, `${label} (${key})`, () => setTool(t), { 'aria-pressed': 'false', 'data-tool': t })
    toolBtns.set(t, b)
  }
  const swatches = new Map<string, HTMLButtonElement>()
  for (const sw of PALETTE) {
    const b = el('button', { type: 'button', class: 'wb-sw', role: 'radio', 'aria-checked': 'false', 'aria-label': colorNames[sw.key] ?? sw.key, title: colorNames[sw.key] ?? sw.key, 'data-color': sw.key })
    b.style.setProperty('--sw', sw.fill)
    b.style.setProperty('--sws', sw.stroke)
    b.addEventListener('click', () => setColor(sw.key))
    swatches.set(sw.key, b)
  }
  const undoBtn = btn('undo', tr.undo + ' (Ctrl+Z)', () => board.undo.undo())
  const redoBtn = btn('redo', tr.redo + ' (Ctrl+Shift+Z)', () => board.undo.redo())
  const delBtn = btn('del', tr.del + ' (Delete)', removeSelected)
  const dupBtn = btn('copy', tr.duplicate + ' (Ctrl+D)', duplicate)
  const frontBtn = btn('front', tr.front + ' (])', () => reorder(true))
  const backBtn = btn('back2', tr.back2 + ' ([)', () => reorder(false))
  const zoomBtn = el('button', { type: 'button', class: 'wb-btn wb-zoomval', 'aria-label': sub(tr.zoomLevel, { n: 100 }) }, '100%')
  zoomBtn.addEventListener('click', () => {
    const { w, h } = size()
    setView(zoomAt(view, 1 / view.k, { x: w / 2, y: h / 2 }))
  })
  const bgSel = el('select', { class: 'wb-select', 'aria-label': tr.background }) as HTMLSelectElement
  for (const [v, l] of [['plain', tr.plain], ['dots', tr.dots], ['grid', tr.grid]] as const) bgSel.append(el('option', { value: v }, l))
  bgSel.value = bg
  bgSel.disabled = !canWrite
  bgSel.addEventListener('change', () => {
    bg = bgSel.value
    if (canWrite) board.setBg(bg)
    setBackground()
    markDirty()
  })

  function refreshTools() {
    for (const [t, b] of toolBtns) b.setAttribute('aria-pressed', String(t === tool))
    const one = selected()
    const shownColor = one.length === 1 ? one[0]!.color : color
    for (const [k, b] of swatches) b.setAttribute('aria-checked', String(k === shownColor))
    undoBtn.disabled = !canWrite || !board.undo.canUndo()
    redoBtn.disabled = !canWrite || !board.undo.canRedo()
    for (const b of [delBtn, dupBtn, frontBtn, backBtn]) b.disabled = !sel.size
    svg.dataset.tool = tool
  }
  board.undo.on('stack-item-added', refreshTools)
  board.undo.on('stack-item-popped', refreshTools)

  const legend = () => {
    const ok = el('button', { type: 'button', class: 'msk-btn' }, tr.close)
    const list = el('ul', { class: 'wb-legend' })
    for (const t of [tr.legendTools, tr.legendFrames, tr.legendMove, tr.legendEdit, tr.legendUndo, tr.legendOrder, tr.legendView]) list.append(el('li', {}, t))
    const d = dialog({ title: tr.legendTitle, body: list, actions: [ok] })
    ok.addEventListener('click', d.close)
  }

  // a template is a set of frames and notes put in the middle of what the person sees, as one step of the history
  const insertTemplate = (tid: TemplateId) => {
    if (!canWrite) return
    const label = (k: TemplateLabel) => (tr as unknown as Record<string, string>)[k] ?? ''
    const { w, h } = size()
    const centre = toBoard(view, { x: w / 2, y: h / 2 })
    const probe = templateBox(templateObjects(tid, label, { x: 0, y: 0 }))
    const objs = templateObjects(tid, label, { x: centre.x - probe.x - probe.w / 2, y: centre.y - probe.y - probe.h / 2 })
    stopEdit(true)
    board.undo.stopCapturing()
    let front = nowFront()
    let back = backZ(board.all()) - objs.length
    const ids: string[] = []
    for (const t of objs) {
      const ob: Obj = { id: newId(), type: t.type, x: t.x, y: t.y, w: t.w, h: t.h, text: t.text, color: t.color, points: t.points ?? [], z: t.type === 'frame' ? back++ : front++, author: myName || me }
      board.add(ob)
      ids.push(ob.id)
    }
    board.undo.stopCapturing()
    select(ids)
  }
  const templates = () => {
    const ok = el('button', { type: 'button', class: 'msk-btn ghost' }, tr.close)
    const list = el('div', { class: 'wb-templates', role: 'list' })
    const names: Record<TemplateId, [string, string]> = { kanban: [tr.tplKanban, tr.tplKanbanText], swot: [tr.tplSwot, tr.tplSwotText], retro: [tr.tplRetro, tr.tplRetroText], brainstorm: [tr.tplBrainstorm, tr.tplBrainstormText] }
    for (const tid of TEMPLATE_IDS) {
      const b = el('button', { type: 'button', class: 'wb-template', role: 'listitem', 'data-template': tid }, el('strong', {}, names[tid][0]), el('span', {}, names[tid][1]))
      b.addEventListener('click', () => {
        insertTemplate(tid)
        d.close()
      })
      list.append(b)
    }
    const d = dialog({ title: tr.templatesTitle, body: list, actions: [ok] })
    ok.addEventListener('click', d.close)
  }

  const title = el('input', { type: 'text', class: 'wb-title', maxlength: '120', 'aria-label': tr.titleLabel }) as HTMLInputElement
  title.value = String(row.values.title ?? '')
  title.readOnly = !canWrite
  let savedTitle = title.value
  const commitTitle = async () => {
    const t = title.value.trim()
    if (!canWrite || t === savedTitle) return
    if (!t) {
      title.value = savedTitle
      return toast(tr.needTitle, { tone: 'err' })
    }
    try {
      await api.update(id, { title: t })
      savedTitle = t
      title.value = t
    } catch (e) {
      title.value = savedTitle
      toast(errText(e, msk.context?.lang), { tone: 'err', ms: 6000 })
    }
  }
  title.addEventListener('change', () => void commitTitle())
  title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') title.blur()
  })

  const back = btn('back', tr.back, () => {
    void destroy().then(o.onBack)
  })
  const saveFile = (blob: Blob, name: string) => {
    const u = URL.createObjectURL(blob)
    const a = el('a', { href: u, download: name, style: 'display:none' })
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(u), 10_000)
  }
  const fileName = (ext: string) => (title.value.trim() || tr.untitled).replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80) + '.' + ext
  const pngBtn = btn('image', tr.exportPng, () => {
    void exportPng(board.all(), bg)
      .then((b) => {
        saveFile(b, fileName('png'))
        toast(tr.exported, { tone: 'ok' })
      })
      .catch((e) => toast(errText(e, msk.context?.lang), { tone: 'err' }))
  })
  const svgBtn = btn('file', tr.exportSvg, () => {
    saveFile(new Blob([svgText(exportSvg(board.all(), bg).svg)], { type: 'image/svg+xml;charset=utf-8' }), fileName('svg'))
    toast(tr.exported, { tone: 'ok' })
  })
  const shareBtn = btn('share', tr.share.replace('…', ''), () => void msk.share(id).catch((e) => toast(errText(e), { tone: 'err' })))
  shareBtn.hidden = row.my_level !== 'manage'
  const helpBtn = btn('help', tr.shortcuts + ' (?)', legend)

  const bar = el(
    'header',
    { class: 'wb-bar' },
    back,
    title,
    ...(canWrite
      ? [
          group(tr.tools, ...toolKeys.map(([t]) => toolBtns.get(t)!), btn('template', tr.templates, templates, { 'data-testid': 'templates' })),
          el('div', { class: 'wb-group wb-colors', role: 'radiogroup', 'aria-label': tr.colors }, ...PALETTE.map((p) => swatches.get(p.key)!)),
          group(tr.history, undoBtn, redoBtn),
          group(tr.arrange, delBtn, dupBtn, frontBtn, backBtn),
        ]
      : [el('span', { class: 'wb-chip' }, tr.viewOnly)]),
    group(tr.zoomGroup, btn('zoomOut', tr.zoomOut + ' (−)', () => zoomBy(-1)), zoomBtn, btn('zoomIn', tr.zoomIn + ' (+)', () => zoomBy(1)), btn('fit', tr.fit + ' (0)', fit)),
    el('div', { class: 'wb-group' }, bgSel),
    group(tr.exportGroup, pngBtn, svgBtn),
    el('div', { class: 'wb-spacer' }),
    saveText,
    connText,
    whoBox,
    shareBtn,
    helpBtn,
  )
  root.append(bar, stage)

  // ------------------------------------------------------------------------------------------------------------ start
  setBackground()
  drawPeople()
  drawStatus()
  refreshTools()
  markAll()
  // fit the saved content once the stage has a size
  let firstFit = 0
  const ro = new ResizeObserver(() => {
    const { w, h } = size()
    if (w > 10 && h > 10 && !firstFit) {
      firstFit = 1
      setView(fitView(unionBounds(board.all().map(objBox)), w, h))
    } else placeEditor()
  })
  ro.observe(svg)
  describe()

  async function destroy(): Promise<void> {
    if (destroyed) return
    stopEdit(true)
    clearTimeout(saveTimer)
    // a save in progress ends first, then what changed since goes out
    for (let i = 0; i < 50 && saving; i++) await new Promise((r) => setTimeout(r, 100))
    await save()
    destroyed = true
    clearTimeout(typed)
    ro.disconnect()
    document.removeEventListener('visibilitychange', onHide)
    window.removeEventListener('pagehide', onHide)
    cancelAnimationFrame(raf)
    clearTimeout(fallback)
    live.stop()
  }
  return { el: root, destroy }
}
