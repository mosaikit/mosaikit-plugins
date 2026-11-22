// UI of the Dashboard plugin: boards of widgets. The widgets are offered by the other plugins (contributions); the command
// `dashboard.widgets` answers what each one shows to the person. Everything from a widget is drawn as text nodes, never HTML.
import '@mosaikit/plugin-api/style.css'
import './dashboard.css'
import {
  chart,
  type Chart,
  confirmDialog,
  connect,
  dialog,
  el,
  emptyState,
  errText,
  skeleton,
  toast,
  type Msk,
  type Row,
} from '@mosaikit/plugin-api'
import {
  boardWidgets,
  categoryName,
  chartEmpty,
  chosenKeys,
  columnsOf,
  defaultKeys,
  deltaOf,
  editorOrder,
  gridColumns,
  keepBoard,
  keyOf,
  moveItem,
  parseKeys,
  shouldRefresh,
  sparkPoints,
  textsFor,
  toneOf,
  type ChartResult,
  type Columns,
  type ListResult,
  type NumberResult,
  type Tone,
  type Widget,
} from './logic.ts'
import { bindTexts, TEXTS, langOf, sub } from './texts.ts'

const app = document.getElementById('app')!
const REFRESH_MS = 60_000
const REMEMBER = 'dashboard.board'

interface Board {
  row: Row
  id: string
  name: string
  keys: string[]
  columns: Columns
}

const remembered = (): string | null => {
  try {
    return localStorage.getItem(REMEMBER)
  } catch {
    return null
  }
}
const remember = (id: string) => {
  try {
    localStorage.setItem(REMEMBER, id)
  } catch {
    /* a convenience only */
  }
}

function mount(msk: Msk) {
  document.documentElement.classList.add('msk-fill')
  bindTexts(msk)
  let lang = langOf(msk.context?.lang)
  const tr = () => TEXTS[lang]
  const api = msk.crud('boards')
  let boards: Board[] = []
  let current: string | null = remembered()
  let widgets: Widget[] = []
  let loadedAt = 0
  let busy = false

  const fail = (e: unknown) => toast(errText(e, msk.context?.lang), { tone: 'err', ms: 6000 })
  const head = el('header', { class: 'dsh-head' })
  // the body scrolls: it is a region the keyboard reaches
  const body = el('div', { class: 'dsh-body', tabindex: '0', role: 'region', 'aria-label': TEXTS[langOf(msk.context?.lang)].title })
  app.replaceChildren(el('div', { class: 'dsh' }, head, body))

  const toBoard = (r: Row): Board => ({
    row: r,
    id: r.id,
    name: String(r.values.name ?? ''),
    keys: parseKeys(r.values.widgets),
    columns: columnsOf(r.values.columns),
  })
  const open = () => boards.find((b) => b.id === current) ?? null
  const canWrite = (b: Board | null) => !!b && (b.row.my_level === 'write' || b.row.my_level === 'manage')
  const btn = (label: string, cls: string, on: () => void) => {
    const b = el('button', { type: 'button', class: cls }, label)
    b.addEventListener('click', on)
    return b
  }

  // ------------------------------------------------------------------------------------------------------ the editor
  const editor = (existing?: Board) => {
    const name = el('input', { type: 'text', maxlength: '80', 'aria-label': tr().fName, placeholder: tr().fName })
    name.value = existing?.name ?? ''
    const cols = el('select', { 'aria-label': tr().fColumns })
    for (const [k, label] of [['auto', tr().colAuto], ['2', tr().col2], ['3', tr().col3]] as const) cols.append(el('option', { value: k }, label))
    cols.value = existing?.columns ?? 'auto'
    const field = (label: string, input: HTMLElement) => el('div', { class: 'msk-field' }, el('label', {}, label), input)

    let order = editorOrder(widgets, existing?.keys ?? [])
    const checked = new Set(existing?.keys ?? [])
    const label = (k: string) => {
      const w = widgets.find((x) => keyOf(x) === k)
      return w ? textsFor(w, lang).label || k : k
    }
    const list = el('ul', { class: 'dsh-elist' })
    const drawList = (focus?: string) => {
      list.replaceChildren()
      order.forEach((k, i) => {
        const box = el('input', { type: 'checkbox' })
        box.checked = checked.has(k)
        box.addEventListener('change', () => (box.checked ? checked.add(k) : checked.delete(k)))
        const up = el('button', { type: 'button', class: 'msk-btn ghost mini', 'aria-label': sub(tr().moveUp, { n: label(k) }) }, '↑')
        const down = el('button', { type: 'button', class: 'msk-btn ghost mini', 'aria-label': sub(tr().moveDown, { n: label(k) }) }, '↓')
        up.disabled = i === 0
        down.disabled = i === order.length - 1
        up.addEventListener('click', () => {
          order = moveItem(order, i, -1)
          drawList(k + '|up')
        })
        down.addEventListener('click', () => {
          order = moveItem(order, i, 1)
          drawList(k + '|down')
        })
        list.append(el('li', { class: 'dsh-erow', 'data-key': k }, el('label', { class: 'dsh-echeck' }, box, el('span', {}, label(k))), up, down))
      })
      // keep the keyboard where it was: the same button, or the other one when this one reached the end
      if (focus) {
        const [k, dir] = focus.split('|')
        const row = list.querySelector(`[data-key="${CSS.escape(k)}"]`)
        const btns = row ? Array.from(row.querySelectorAll<HTMLButtonElement>('button')) : []
        const want = dir === 'up' ? btns[0] : btns[1]
        ;(want && !want.disabled ? want : btns.find((b) => !b.disabled))?.focus()
      }
    }
    drawList()

    const ok = el('button', { type: 'button', class: 'msk-btn' }, existing ? tr().save : tr().create)
    const no = el('button', { type: 'button', class: 'msk-btn ghost' }, tr().cancel)
    const d = dialog({
      title: existing ? tr().editTitle : tr().newTitle,
      body: el(
        'div',
        { class: 'dsh-form' },
        field(tr().fName, name),
        field(tr().fColumns, cols),
        existing && widgets.length ? el('div', { class: 'msk-field' }, el('label', {}, tr().fWidgets), el('p', { class: 'dsh-dim' }, tr().widgetsHelp), list) : el('span'),
      ),
      actions: [no, ok],
    })
    no.addEventListener('click', d.close)
    const go = async () => {
      if (!name.value.trim()) {
        toast(tr().needName, { tone: 'err' })
        return name.focus()
      }
      ok.disabled = true
      try {
        if (existing) {
          await api.update(existing.id, { name: name.value.trim(), columns: cols.value, widgets: JSON.stringify(chosenKeys(order, checked)) })
        } else {
          const r = await api.create({ name: name.value.trim(), columns: cols.value, widgets: '[]' })
          current = r.id
          remember(r.id)
        }
        d.close()
        await loadBoards()
        draw()
        if (!existing) {
          // an empty board asks for its widgets at once
          const b = open()
          if (b && widgets.length) editor(b)
        }
      } catch (e) {
        fail(e)
        ok.disabled = false
      }
    }
    ok.addEventListener('click', () => void go())
    name.focus()
  }

  const removeBoard = async (b: Board) => {
    if (!(await confirmDialog({ title: tr().remove, text: sub(tr().removeConfirm, { n: b.name }), ok: tr().remove, cancel: tr().cancel, danger: true }))) return
    try {
      await api.remove(b.id)
      await loadBoards()
      draw()
    } catch (e) {
      fail(e)
    }
  }

  // ------------------------------------------------------------------------------------------------------ the widgets
  const toneMark = (tone: Tone) => {
    const sym = { ok: '✓', warn: '▲', err: '●', '': '' }[tone]
    return el('span', { class: `dsh-tone ${tone}` }, el('span', { 'aria-hidden': 'true' }, sym + ' '), tr()[tone as 'ok' | 'warn' | 'err'])
  }

  const SVG = 'http://www.w3.org/2000/svg'
  /** A tiny line of the last values; decorative (the numbers are in the text next to it). */
  const spark = (values: number[]) => {
    const W = 120
    const H = 36
    const pts = sparkPoints(values, W, H, 3)
    if (!pts.length) return null
    const svg = document.createElementNS(SVG, 'svg')
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
    svg.setAttribute('class', 'dsh-spark')
    svg.setAttribute('aria-hidden', 'true')
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')
    const area = document.createElementNS(SVG, 'path')
    area.setAttribute('d', `${d} L${pts[pts.length - 1]!.x} ${H} L${pts[0]!.x} ${H} Z`)
    area.setAttribute('class', 'dsh-spark-area')
    const line = document.createElementNS(SVG, 'path')
    line.setAttribute('d', d)
    line.setAttribute('class', 'dsh-spark-line')
    const last = document.createElementNS(SVG, 'circle')
    last.setAttribute('cx', String(pts[pts.length - 1]!.x))
    last.setAttribute('cy', String(pts[pts.length - 1]!.y))
    last.setAttribute('r', '2.6')
    last.setAttribute('class', 'dsh-spark-dot')
    svg.append(area, line, last)
    return svg
  }

  const numberBody = (w: Widget, r: NumberResult) => {
    const t = textsFor(w, lang)
    const box = el('div', { class: 'dsh-number' })
    const top = el('div', { class: 'dsh-numtop' }, el('p', { class: 'dsh-value', 'data-testid': 'widget-value' }, String(r.value)))
    const sp = r.trend ? spark(r.trend) : null
    if (sp) top.append(sp)
    box.append(top)
    const row = el('div', { class: 'dsh-meta' })
    if (r.tone) row.append(toneMark(toneOf(r.tone)))
    // with a trend, the second number is the period before: show the change, not only the number
    const delta = r.trend ? deltaOf(r.value, r.secondary) : null
    if (delta) {
      const word = delta.dir === 'up' ? tr().up : delta.dir === 'down' ? tr().down : tr().flat
      row.append(
        el(
          'span',
          { class: `dsh-delta ${delta.dir}`, 'data-testid': 'widget-delta' },
          el('span', { 'aria-hidden': 'true' }, delta.dir === 'up' ? '↗' : delta.dir === 'down' ? '↘' : '→'),
          ` ${delta.dir === 'flat' ? word : sub(word, { n: Math.abs(delta.pct) })}`,
        ),
      )
    }
    if (r.secondary !== null && r.secondary !== undefined) row.append(el('span', { class: 'dsh-second' }, `${r.secondary} ${t.secondary}`.trim()))
    if (row.childElementCount) box.append(row)
    return box
  }

  const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t)
  /** Cards of different heights without holes: each card spans as many 6px rows as it needs, and again when its size changes (a chart that loads). */
  const ROW = 6
  const GAP = 16
  const masonries: ResizeObserver[] = []
  const masonry = (grid: HTMLElement) => {
    if (typeof ResizeObserver === 'undefined') return
    const fit = (c: HTMLElement) => {
      c.style.gridRowEnd = 'span 1'
      c.style.gridRowEnd = `span ${Math.ceil((c.getBoundingClientRect().height + GAP) / ROW)}`
    }
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) fit(e.target as HTMLElement)
    })
    for (const c of Array.from(grid.children) as HTMLElement[]) ro.observe(c)
    masonries.push(ro)
  }
  const charts: Chart[] = []
  const chartBody = (w: Widget, r: ChartResult) => {
    const t = textsFor(w, lang)
    if (chartEmpty(r)) return el('p', { class: 'dsh-dim' }, t.empty || tr().nothing)
    const c = chart(
      {
        type: r.type,
        label: t.label || keyOf(w),
        categories: r.categories.map((k) => clip(categoryName(k, t.categories, lang), r.type === 'bar' ? 11 : 40)),
        series: r.series.map((s) => ({ name: categoryName(s.name, t.categories, lang), data: s.data })),
        height: w.data.size === 'l' ? 232 : 208,
      },
      { data: tr().showData, category: t.label, loading: tr().chartLoading, failed: tr().chartFailed },
    )
    charts.push(c)
    return c.el
  }

  const listBody = (w: Widget, r: ListResult) => {
    const t = textsFor(w, lang)
    if (!r.items.length) return el('p', { class: 'dsh-dim' }, t.empty || tr().nothing)
    const ul = el('ul', { class: 'dsh-list' })
    for (const it of r.items) {
      const li = el('li', { class: 'dsh-item' })
      const text = el('div', { class: 'dsh-itext' }, el('span', { class: 'dsh-ititle' }, it.title))
      if (it.meta) text.append(el('span', { class: 'dsh-dim' }, it.meta))
      if (it.tone) li.append(toneMark(toneOf(it.tone)))
      li.append(text)
      ul.append(li)
    }
    const box = el('div', {}, ul)
    if (r.more > 0) box.append(el('p', { class: 'dsh-more' }, sub(tr().more, { n: r.more })))
    return box
  }

  const card = (w: Widget, i = 0) => {
    const t = textsFor(w, lang)
    const size = w.data.size === 's' || w.data.size === 'l' ? w.data.size : 'm'
    const kind = ['list', 'chart'].includes(String(w.data.kind)) ? String(w.data.kind) : 'number'
    const c = el('article', { class: `dsh-card size-${size} kind-${kind}`, 'data-testid': 'widget', 'data-key': keyOf(w) }, el('h2', {}, t.label || keyOf(w)))
    c.style.setProperty('--i', String(Math.min(i, 12)))
    if (w.error || !w.result) c.append(el('p', { class: 'dsh-dim', 'data-testid': 'widget-error' }, tr().unavailable))
    else if (w.data.kind === 'list') c.append(listBody(w, w.result as ListResult))
    else if (w.data.kind === 'chart') c.append(chartBody(w, w.result as ChartResult))
    else c.append(numberBody(w, w.result as NumberResult))
    return c
  }

  // --------------------------------------------------------------------------------------------------------- the page
  const draw = () => {
    for (const c of charts.splice(0)) c.destroy()
    for (const r of masonries.splice(0)) r.disconnect()
    head.replaceChildren(el('h1', {}, tr().title))
    body.replaceChildren()
    const add = btn(tr().newBoard, 'msk-btn', () => editor())
    add.hidden = !msk.can('create')
    if (!widgets.length) {
      head.append(add)
      body.append(emptyState({ art: 'dashboard', title: tr().emptyNoneTitle, text: tr().emptyNoneText }))
      return
    }
    const b = open()
    const pick = el('select', { 'aria-label': tr().board, class: 'dsh-pick' })
    for (const x of boards) pick.append(el('option', { value: x.id }, x.name))
    if (b) pick.value = b.id
    pick.addEventListener('change', () => {
      current = pick.value
      remember(current)
      draw()
    })
    const bar = el('div', { class: 'dsh-bar' })
    if (boards.length) bar.append(pick)
    if (canWrite(b)) bar.append(btn(tr().edit, 'msk-btn ghost', () => editor(b!)))
    if (b?.row.my_level === 'manage') {
      bar.append(btn(tr().share, 'msk-btn ghost', () => void msk.share(b.id).catch(fail)))
      bar.append(btn(tr().remove, 'msk-btn ghost danger-text', () => void removeBoard(b)))
    }
    bar.append(btn(tr().refresh, 'msk-btn ghost', () => void refresh(true)))
    head.append(el('div', { class: 'dsh-grow' }), bar, add)
    if (!b) return
    const shown = boardWidgets(widgets, b.keys)
    if (!shown.length) {
      body.append(
        emptyState({
          art: 'dashboard',
          title: tr().emptyBoardTitle,
          text: tr().emptyBoardText,
          actions: canWrite(b) ? [Object.assign(el('button', { type: 'button', class: 'msk-btn' }, tr().emptyBoardAction), { onclick: () => editor(b) })] : [],
        }),
      )
      return
    }
    const grid = el('div', { class: 'dsh-grid', 'data-testid': 'board' })
    grid.style.gridTemplateColumns = gridColumns(b.columns)
    shown.forEach((w, i) => grid.append(card(w, i)))
    body.append(grid)
    masonry(grid)
  }

  const loadBoards = async () => {
    const rows = (await api.list({ sort: 'created_at', dir: 'asc', limit: 200 })).rows
    boards = rows.map(toBoard)
    current = keepBoard(boards.map((b) => b.id), current)
    if (current) remember(current)
  }

  /** Asks the widgets again. Silent after the first time: the page keeps what it shows until the new data is there. */
  const refresh = async (manual = false) => {
    if (busy) return
    busy = true
    try {
      widgets = await msk.call<Widget[]>('dashboard.widgets', {})
      loadedAt = Date.now()
      draw()
    } catch (e) {
      if (manual) toast(tr().widgetsFailed + errText(e, msk.context?.lang), { tone: 'err', ms: 6000 })
    } finally {
      busy = false
    }
  }

  const start = async () => {
    body.replaceChildren(skeleton({ kind: 'cards', count: 4 }))
    try {
      widgets = await msk.call<Widget[]>('dashboard.widgets', {})
      loadedAt = Date.now()
      await loadBoards()
      // the first time: a board with every widget that is offered
      if (!boards.length && widgets.length && msk.can('create')) {
        const r = await api.create({ name: tr().defaultName, columns: 'auto', widgets: JSON.stringify(defaultKeys(widgets)) })
        current = r.id
        await loadBoards()
      }
    } catch (e) {
      body.textContent = tr().loadFailed + errText(e, msk.context?.lang)
      return
    }
    draw()
  }

  // every minute, and when the page comes back after a while: only while it is visible
  setInterval(() => {
    if (shouldRefresh(document.visibilityState)) void refresh()
  }, REFRESH_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - loadedAt >= REFRESH_MS) void refresh()
  })

  msk.onContext((ctx) => {
    if (langOf(ctx.lang) === lang) return
    lang = langOf(ctx.lang)
    draw()
  })
  void start()
}

connect()
  .then(mount)
  .catch((e) => {
    app.textContent = TEXTS[langOf(undefined)].failed + errText(e)
  })
