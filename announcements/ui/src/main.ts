// UI of the Announcements plugin: the notice board (urgent and pinned first), the form of a notice, the confirmation of reading
// and the list of who confirmed. The text of a notice is Markdown drawn by the kit (never HTML).
import '@mosaikit/plugin-api/style.css'
import './announcements.css'
import {
  avatar,
  confirmDialog,
  connect,
  dateField,
  dialog,
  el,
  emptyState,
  errText,
  renderMarkdown,
  segmented,
  skeleton,
  toast,
  type Msk,
  type Row,
} from '@mosaikit/plugin-api'
import { boardOrder, levelOf, periodOf, todayLocal, type Level, type NoticeLike, type Period } from './logic.ts'
import { bindTexts, TEXTS, langOf, sub } from './texts.ts'

const app = document.getElementById('app')!

interface Notice extends NoticeLike {
  row: Row
  title: string
  body: string
  needsAck: boolean
}
interface Overview {
  mine: string[]
  counts: Record<string, number>
}
interface Ack {
  id: string
  name: string
  at: string
}

function mount(msk: Msk) {
  document.documentElement.classList.add('msk-fill')
  bindTexts(msk)
  let lang = langOf(msk.context?.lang)
  const tr = () => TEXTS[lang]
  const api = msk.crud('notices')
  let notices: Notice[] = []
  let over: Overview = { mine: [], counts: {} }
  let filter: Period | 'all' = 'current'

  const fail = (e: unknown) => toast(errText(e, msk.context?.lang), { tone: 'err', ms: 6000 })
  const head = el('header', { class: 'an-head' })
  const body = el('div', { class: 'an-body' })
  app.replaceChildren(el('div', { class: 'an' }, head, body))

  const day = (d: string) => (d ? new Date(d + 'T00:00:00').toLocaleDateString(msk.context?.lang || undefined, { dateStyle: 'medium' }) : '')
  const stamp = (iso: string) => new Date(iso).toLocaleString(msk.context?.lang || undefined, { dateStyle: 'medium', timeStyle: 'short' })

  const toNotice = (r: Row): Notice => ({
    id: r.id,
    row: r,
    title: String(r.values.title ?? ''),
    body: String(r.values.body ?? ''),
    level: levelOf(r.values.level),
    pinned: r.values.pinned === true,
    needsAck: r.values.needs_ack === true,
    startsOn: String(r.values.starts_on ?? ''),
    endsOn: String(r.values.ends_on ?? ''),
    createdAt: r.created_at,
  })

  // ----------------------------------------------------------------------------------------------------------- the form
  const form = (existing?: Notice) => {
    const title = el('input', { type: 'text', maxlength: '160', 'aria-label': tr().fTitle, placeholder: tr().fTitle })
    const text = el('textarea', { rows: '7', 'aria-label': tr().fBody, placeholder: tr().fBody })
    const level = el('select', { 'aria-label': tr().fLevel })
    for (const l of ['info', 'important', 'urgent'] as Level[]) level.append(el('option', { value: l }, tr()[l]))
    let from = existing?.startsOn ?? ''
    let until = existing?.endsOn ?? ''
    const fromField = dateField({ label: tr().fFrom, value: from, onChange: (v) => (from = v) })
    const untilField = dateField({ label: tr().fUntil, value: until, onChange: (v) => (until = v) })
    const pinned = el('input', { type: 'checkbox', id: 'an-pinned' })
    const ack = el('input', { type: 'checkbox', id: 'an-ack' })
    title.value = existing?.title ?? ''
    text.value = existing?.body ?? ''
    level.value = existing?.level ?? 'info'
    pinned.checked = existing?.pinned ?? false
    ack.checked = existing?.needsAck ?? false
    const field = (label: string, input: HTMLElement) => el('div', { class: 'msk-field' }, el('label', {}, label), input)
    const check = (input: HTMLInputElement, label: string) => el('label', { class: 'an-check' }, input, el('span', {}, label))
    const ok = el('button', { type: 'button', class: 'msk-btn' }, existing ? tr().save : tr().create)
    const no = el('button', { type: 'button', class: 'msk-btn ghost' }, tr().cancel)
    const d = dialog({
      title: existing ? tr().editTitle : tr().newTitle,
      body: el(
        'div',
        { class: 'an-form' },
        field(tr().fTitle, title),
        field(tr().fBody, text),
        el('div', { class: 'an-row' }, field(tr().fLevel, level), field(tr().fFrom, fromField.el), field(tr().fUntil, untilField.el)),
        check(pinned, tr().fPinned),
        check(ack, tr().fAck),
      ),
      actions: [no, ok],
    })
    no.addEventListener('click', d.close)
    const go = async () => {
      if (!title.value.trim()) {
        toast(tr().needTitle, { tone: 'err' })
        return title.focus()
      }
      ok.disabled = true
      const values = {
        title: title.value.trim(),
        body: text.value,
        level: level.value,
        starts_on: from,
        ends_on: until,
        pinned: pinned.checked,
        needs_ack: ack.checked,
      }
      try {
        if (existing) await api.update(existing.id, values)
        else await api.create(values)
        d.close()
        await load()
      } catch (e) {
        fail(e)
        ok.disabled = false
      }
    }
    ok.addEventListener('click', () => void go())
    title.focus()
  }

  // ------------------------------------------------------------------------------------------------- who confirmed
  const who = async (n: Notice) => {
    const close = el('button', { type: 'button', class: 'msk-btn' }, tr().close)
    const list = el('div', { class: 'an-who' }, skeleton({ kind: 'rows', count: 3 }))
    const d = dialog({ title: `${tr().whoTitle}: ${n.title}`, body: list, actions: [close] })
    close.addEventListener('click', d.close)
    try {
      const rows = await msk.call<Ack[]>('notices.acks', { id: n.id })
      list.replaceChildren()
      if (!rows.length) list.append(el('p', { class: 'an-dim' }, tr().whoNone))
      for (const a of rows) list.append(el('div', { class: 'an-person' }, avatar(a.name), el('strong', {}, a.name), el('span', { class: 'an-dim' }, stamp(a.at))))
    } catch (e) {
      d.close()
      fail(e)
    }
  }

  // --------------------------------------------------------------------------------------------------------- the board
  const confirmRead = async (n: Notice) => {
    try {
      await msk.call('notices.confirm', { id: n.id })
      toast(tr().thanks, { tone: 'ok' })
      await refreshOverview()
      draw()
    } catch (e) {
      fail(e)
    }
  }

  const noticeCard = (n: Notice, today: string) => {
    const period = periodOf(n, today)
    const card = el('article', { class: `an-card ${n.level}${n.pinned ? ' pinned' : ''}${period === 'past' ? ' past' : ''}`, 'data-testid': 'notice' })
    const chips = el('div', { class: 'an-chips' }, el('span', { class: `an-level ${n.level}` }, tr()[n.level as Level]))
    if (n.pinned) chips.append(el('span', { class: 'msk-badge' }, '📌 ' + tr().pinned))
    const when = [n.startsOn && period === 'upcoming' ? sub(tr().from, { d: day(n.startsOn) }) : '', n.endsOn ? sub(period === 'past' ? tr().ended : tr().until, { d: day(n.endsOn) }) : '']
      .filter(Boolean)
      .join(' · ')
    card.append(
      chips,
      el('h2', {}, n.title),
      el('p', { class: 'an-meta' }, [sub(tr().by, { n: n.row.owner_name }), day(n.createdAt.slice(0, 10)), when].filter(Boolean).join(' · ')),
    )
    if (n.body.trim()) card.append(el('div', { class: 'an-text' }, renderMarkdown(n.body)))
    const acts = el('div', { class: 'an-acts' })
    if (n.needsAck) {
      const confirmed = over.mine.includes(n.id)
      const count = over.counts[n.id] ?? 0
      if (confirmed) acts.append(el('span', { class: 'an-done', role: 'status' }, '✓ ' + tr().confirmed))
      else {
        const b = el('button', { type: 'button', class: 'msk-btn' }, tr().confirm)
        b.addEventListener('click', () => void confirmRead(n))
        acts.append(b)
      }
      const w = el('button', { type: 'button', class: 'msk-btn ghost mini' }, count ? sub(tr().confirmedBy, { n: count }) : tr().nobodyYet)
      w.addEventListener('click', () => void who(n))
      acts.append(w)
    }
    if (n.row.my_level === 'write' || n.row.my_level === 'manage') {
      const edit = el('button', { type: 'button', class: 'msk-btn ghost mini' }, tr().edit)
      edit.addEventListener('click', () => form(n))
      acts.append(edit)
    }
    if (n.row.my_level === 'manage') {
      const share = el('button', { type: 'button', class: 'msk-btn ghost mini' }, tr().share)
      share.addEventListener('click', () => void msk.share(n.id).catch(fail))
      const del = el('button', { type: 'button', class: 'msk-btn ghost mini danger-text' }, tr().remove)
      del.addEventListener('click', () => void remove(n))
      acts.append(share, del)
    }
    if (acts.childElementCount) card.append(acts)
    return card
  }

  const remove = async (n: Notice) => {
    if (!(await confirmDialog({ title: tr().remove, text: sub(tr().removeConfirm, { n: n.title }), ok: tr().remove, cancel: tr().cancel, danger: true }))) return
    try {
      await api.remove(n.id)
      await load()
    } catch (e) {
      fail(e)
    }
  }

  const draw = () => {
    head.replaceChildren(el('h1', {}, tr().title))
    const today = todayLocal()
    const seg = segmented({
      label: tr().filter,
      value: filter,
      options: [
        { key: 'current', label: tr().current },
        { key: 'upcoming', label: tr().upcoming },
        { key: 'past', label: tr().past },
        { key: 'all', label: tr().all },
      ],
      onChange: (k) => {
        filter = k as Period | 'all'
        draw()
      },
    })
    const add = el('button', { type: 'button', class: 'msk-btn' }, tr().newNotice)
    add.addEventListener('click', () => form())
    add.hidden = !msk.can('create')
    head.append(seg.el, add)
    body.replaceChildren()
    if (!notices.length) {
      body.append(emptyState({ art: 'announcements', title: tr().emptyTitle, text: tr().emptyText, actions: msk.can('create') ? [Object.assign(el('button', { type: 'button', class: 'msk-btn' }, tr().newNotice), { onclick: () => form() })] : [] }))
      return
    }
    const shown = boardOrder(notices.filter((n) => filter === 'all' || periodOf(n, today) === filter))
    if (!shown.length) {
      body.append(emptyState({ art: 'announcements', title: filter === 'current' ? tr().emptyCurrent : tr().emptyFilter, text: '' }))
      return
    }
    const feed = el('div', { class: 'an-feed' })
    for (const n of shown) feed.append(noticeCard(n, today))
    body.append(feed)
  }

  const refreshOverview = async () => {
    try {
      over = await msk.call<Overview>('notices.overview')
    } catch {
      over = { mine: [], counts: {} }
    }
  }

  const load = async () => {
    body.replaceChildren(skeleton({ kind: 'cards', count: 3 }))
    try {
      notices = (await api.list({ sort: 'created_at', dir: 'desc', limit: 200 })).rows.map(toNotice)
    } catch (e) {
      body.textContent = tr().loadFailed + errText(e, msk.context?.lang)
      return
    }
    await refreshOverview()
    draw()
  }

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
