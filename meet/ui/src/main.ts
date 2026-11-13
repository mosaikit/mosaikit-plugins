// UI of the Meet plugin: the rooms as cards, and a room that opens inside the page with the meeting service, showing who has it
// open. The call runs on the service (no video goes through Mosaikit); the plugin only decides who sees which room.
import '@mosaikit/plugin-api/style.css'
import './meet.css'
import {
  avatar,
  avatarStack,
  confirmDialog,
  connect,
  dialog,
  el,
  emptyState,
  errText,
  skeleton,
  toast,
  type Msk,
  type RealtimeChannel,
  type RealtimePerson,
  type Row,
} from '@mosaikit/plugin-api'
import { joinUrl, plainUrl } from './logic.ts'
import { bindTexts, TEXTS, langOf, sub } from './texts.ts'

const app = document.getElementById('app')!

function mount(msk: Msk) {
  document.documentElement.classList.add('msk-fill')
  bindTexts(msk)
  let lang = langOf(msk.context?.lang)
  const tr = () => TEXTS[lang]
  const api = msk.crud('rooms')
  const me = msk.user?.id ?? ''
  const myName = msk.user?.name ?? msk.user?.username ?? ''
  let rooms: Row[] = []
  let open: Row | null = null
  let rt: RealtimeChannel | null = null
  let people: RealtimePerson[] = []

  const fail = (e: unknown) => toast(errText(e, msk.context?.lang), { tone: 'err', ms: 6000 })
  const head = el('header', { class: 'mt-head' })
  const body = el('div', { class: 'mt-body' })
  app.replaceChildren(el('div', { class: 'mt' }, head, body))

  const roomDialog = (existing?: Row) => {
    const name = el('input', { type: 'text', maxlength: '80', 'aria-label': tr().roomName, placeholder: tr().roomName })
    const topic = el('input', { type: 'text', maxlength: '200', 'aria-label': tr().roomTopic, placeholder: tr().roomTopic })
    name.value = String(existing?.values.name ?? '')
    topic.value = String(existing?.values.topic ?? '')
    const ok = el('button', { type: 'button', class: 'msk-btn' }, existing ? tr().save : tr().create)
    const no = el('button', { type: 'button', class: 'msk-btn ghost' }, tr().cancel)
    const d = dialog({
      title: existing ? tr().edit : tr().newRoom.replace('＋ ', ''),
      body: el('div', { class: 'mt-form' }, el('div', { class: 'msk-field' }, el('label', {}, tr().roomName), name), el('div', { class: 'msk-field' }, el('label', {}, tr().roomTopic), topic)),
      actions: [no, ok],
    })
    no.addEventListener('click', d.close)
    const go = async () => {
      if (!name.value.trim()) return name.focus()
      ok.disabled = true
      try {
        if (existing) await api.update(existing.id, { name: name.value.trim(), topic: topic.value.trim() })
        else await api.create({ name: name.value.trim(), topic: topic.value.trim() })
        d.close()
        await load()
      } catch (e) {
        fail(e)
        ok.disabled = false
      }
    }
    ok.addEventListener('click', () => void go())
    name.addEventListener('keydown', (e) => e.key === 'Enter' && void go())
    name.focus()
  }

  const confirmRemove = async (r: Row) => {
    if (!(await confirmDialog({ title: tr().remove, text: sub(tr().removeConfirm, { n: String(r.values.name ?? '') }), ok: tr().remove, cancel: tr().cancel, danger: true }))) return
    try {
      await api.remove(r.id)
      await load()
    } catch (e) {
      fail(e)
    }
  }

  // ------------------------------------------------------------------------------------------------ the rooms
  const drawList = () => {
    head.replaceChildren(el('h1', {}, tr().title))
    const add = el('button', { type: 'button', class: 'msk-btn' }, tr().newRoom)
    add.addEventListener('click', () => roomDialog())
    add.hidden = !msk.can('create')
    head.append(add)
    body.replaceChildren()
    if (!rooms.length) {
      body.append(emptyState({ art: 'calls', title: tr().emptyTitle, text: tr().emptyText, actions: msk.can('create') ? [Object.assign(el('button', { type: 'button', class: 'msk-btn' }, tr().newRoom), { onclick: () => roomDialog() })] : [] }))
      return
    }
    const grid = el('div', { class: 'mt-grid', role: 'list' })
    for (const r of rooms) {
      const name = String(r.values.name ?? '')
      const card = el('article', { class: 'mt-card', role: 'listitem' })
      const join = el('button', { type: 'button', class: 'msk-btn' }, '📹 ' + tr().join)
      join.setAttribute('aria-label', `${tr().join}: ${name}`)
      join.addEventListener('click', () => enter(r))
      card.append(
        el('div', { class: 'mt-card-head' }, avatar(name), el('div', { class: 'mt-card-titles' }, el('strong', {}, name), el('span', {}, String(r.values.topic ?? '')))),
        ...(r.owner_id !== me ? [el('span', { class: 'mt-by' }, sub(tr().sharedBy, { n: r.owner_name }))] : []),
        el('div', { class: 'mt-card-acts' }, join),
      )
      if (r.my_level === 'manage') {
        const share = el('button', { type: 'button', class: 'msk-btn ghost mini' }, tr().share)
        share.addEventListener('click', () => void msk.share(r.id).catch(fail))
        const edit = el('button', { type: 'button', class: 'msk-btn ghost mini' }, tr().edit)
        edit.addEventListener('click', () => roomDialog(r))
        const del = el('button', { type: 'button', class: 'msk-btn ghost mini danger-text' }, tr().remove)
        del.addEventListener('click', () => void confirmRemove(r))
        card.querySelector('.mt-card-acts')!.append(share, edit, del)
      }
      grid.append(card)
    }
    body.append(grid)
  }

  const load = async () => {
    body.replaceChildren(skeleton({ kind: 'cards', count: 3 }))
    try {
      rooms = (await api.list({ sort: 'name', dir: 'asc' })).rows
    } catch (e) {
      body.textContent = tr().loadFailed + errText(e, msk.context?.lang)
      return
    }
    drawList()
  }

  // ------------------------------------------------------------------------------------------------- a room
  const drawRoomHead = () => {
    if (!open) return
    const others = people.filter((p) => p.id !== me)
    const back = el('button', { type: 'button', class: 'msk-btn ghost mini' }, '‹ ' + tr().roomsOf)
    back.addEventListener('click', leave)
    const leaveBtn = el('button', { type: 'button', class: 'msk-btn ghost' }, tr().leave)
    leaveBtn.addEventListener('click', leave)
    const link = el('a', { class: 'msk-btn ghost', href: plainUrl(open.id), target: '_blank', rel: 'noopener noreferrer' }, tr().newTab)
    head.replaceChildren(
      back,
      el('div', { class: 'mt-titles' }, el('h1', {}, String(open.values.name ?? '')), el('p', {}, String(open.values.topic ?? ''))),
      el('span', { class: 'mt-who', title: others.map((p) => p.name).join(', ') }, avatarStack(others.map((p) => p.name), 5), el('span', { class: 'mt-count' }, others.length ? sub(tr().inRoom, { n: others.length + 1 }) : tr().youAre)),
      link,
      leaveBtn,
    )
  }

  const enter = (r: Row) => {
    open = r
    people = []
    rt?.close()
    rt = msk.realtime.open({ resource: r.id, name: 'presence', state: { name: myName } })
    rt.onPresence((list) => {
      people = list
      drawRoomHead()
    })
    drawRoomHead()
    const frame = el('iframe', {
      class: 'mt-frame',
      title: String(r.values.name ?? ''),
      src: joinUrl(r.id, myName, lang),
      allow: 'camera; microphone; display-capture; fullscreen; autoplay; clipboard-write',
      referrerpolicy: 'no-referrer',
    })
    body.replaceChildren(frame, el('p', { class: 'mt-privacy' }, tr().privacy))
    body.classList.add('in-room')
  }

  const leave = () => {
    rt?.close()
    rt = null
    open = null
    people = []
    body.classList.remove('in-room')
    drawList()
  }

  msk.onContext((ctx) => {
    if (langOf(ctx.lang) === lang) return
    lang = langOf(ctx.lang)
    if (open) drawRoomHead()
    else drawList()
  })
  void msk.loading(load())
}

connect()
  .then(mount)
  .catch((e) => {
    app.textContent = TEXTS[langOf(undefined)].failed + errText(e)
  })
