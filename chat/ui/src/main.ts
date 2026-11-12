// UI of the Chat plugin: channels on the left, a live conversation on the right. A message is saved as an item of the channel
// (so whoever sees the channel sees it, and the history stays) and announced on the real-time channel of the kernel, which only
// carries a hint: every client reads the message again from the data, so nothing a person sends can pose as someone else.
import '@mosaikit/plugin-api/style.css'
import './chat.css'
import {
  avatar,
  avatarStack,
  confirmDialog,
  connect,
  dialog,
  el,
  emptyState,
  errText,
  menu,
  renderMarkdown,
  skeleton,
  toast,
  type Msk,
  type RealtimeChannel,
  type RealtimePerson,
  type Row,
} from '@mosaikit/plugin-api'
import { fromRow, QUICK, runs, snippet, stringifyReactions, toggleReaction, typingNames, upsert, without, type Msg } from './logic.ts'
import { TEXTS, langOf, sub } from './texts.ts'

/** A call from a channel: a room of the meeting service named after the channel (nobody can guess it), opened in a new tab. */
const callUrl = (channelId: string) => 'https://meet.jit.si/mosaikit-' + channelId.replace(/[^a-z0-9]/gi, '').toLowerCase()

const app = document.getElementById('app')!
const PAGE = 50
const TYPING_EVERY = 3000

function mount(msk: Msk) {
  document.documentElement.classList.add('msk-fill')
  let lang = langOf(msk.context?.lang)
  const tr = () => TEXTS[lang]
  const me = msk.user?.id ?? ''
  const channelsApi = msk.crud('channels')
  const messagesApi = msk.crud('messages')

  let channels: Row[] = []
  let current: Row | null = null
  let msgs: Msg[] = []
  let older: string | null = null
  let loading = false
  let rt: RealtimeChannel | null = null
  let people: RealtimePerson[] = []
  const typingSeen = new Map<string, number>()
  let replyTo: Msg | null = null
  let editing: string | null = null
  let status = 'connecting'
  let wasLive = false

  // ----------------------------------------------------------------------------------------------- skeleton of the page
  const listBox = el('div', { class: 'cch-channels', role: 'list' })
  const newBtn = el('button', { type: 'button', class: 'msk-btn ghost mini', 'aria-label': tr().newChannel, title: tr().newChannel }, '＋')
  const side = el('aside', { class: 'cch-side', 'aria-label': tr().channels }, el('div', { class: 'cch-sidehead' }, el('h1', {}, tr().channels), newBtn), listBox)
  const roomHead = el('header', { class: 'cch-head' })
  const banner = el('div', { class: 'cch-banner', role: 'status' })
  banner.hidden = true
  const scroller = el('div', { class: 'cch-scroll' })
  const typingLine = el('div', { class: 'cch-typing', 'aria-live': 'polite' })
  const replyBar = el('div', { class: 'cch-replybar' })
  replyBar.hidden = true
  const input = el('textarea', { class: 'cch-input', rows: '1', 'aria-label': tr().placeholder, placeholder: tr().placeholder, maxlength: '4000' })
  const sendBtn = el('button', { type: 'button', class: 'msk-btn' }, tr().send)
  const composer = el('div', { class: 'cch-composer' }, replyBar, el('div', { class: 'cch-row' }, input, sendBtn))
  const room = el('section', { class: 'cch-room' }, roomHead, banner, scroller, typingLine, composer)
  const root = el('div', { class: 'cch', 'data-view': 'list' }, side, room)
  app.replaceChildren(root)

  const can = (r: Row | null) => !!r && (r.my_level === 'write' || r.my_level === 'manage')
  const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })
  const dayLabel = (d: string) => {
    const t = new Date()
    const key = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
    const y = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1)
    return d === key(t) ? tr().today : d === key(y) ? tr().yesterday : new Date(d + 'T00:00:00').toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' })
  }
  const fail = (e: unknown) => toast(errText(e, msk.context?.lang), { tone: 'err', ms: 6000 })

  // -------------------------------------------------------------------------------------------------- channel list
  const drawChannels = () => {
    listBox.replaceChildren()
    if (!channels.length) {
      listBox.append(el('p', { class: 'cch-none' }, tr().noChannelsTitle))
      return
    }
    for (const c of channels) {
      const b = el('button', { type: 'button', class: 'cch-ch' + (current?.id === c.id ? ' on' : ''), role: 'listitem', 'aria-current': String(current?.id === c.id) }, el('span', { class: 'cch-hash', 'aria-hidden': 'true' }, '#'), el('span', { class: 'cch-chname' }, String(c.values.name ?? '')))
      b.addEventListener('click', () => void open(c.id))
      listBox.append(b)
    }
  }
  const loadChannels = async () => {
    try {
      channels = (await channelsApi.list({ sort: 'name', dir: 'asc' })).rows
    } catch (e) {
      fail(e)
    }
    drawChannels()
  }

  const channelDialog = (existing?: Row) => {
    const name = el('input', { type: 'text', maxlength: '60', 'aria-label': tr().channelName, placeholder: tr().channelName })
    const topic = el('input', { type: 'text', maxlength: '200', 'aria-label': tr().channelTopic, placeholder: tr().channelTopic })
    name.value = String(existing?.values.name ?? '')
    topic.value = String(existing?.values.topic ?? '')
    const ok = el('button', { type: 'button', class: 'msk-btn' }, existing ? tr().save : tr().create)
    const cancel = el('button', { type: 'button', class: 'msk-btn ghost' }, tr().cancel)
    const body = el('div', { class: 'cch-form' }, el('div', { class: 'msk-field' }, el('label', {}, tr().channelName), name), el('div', { class: 'msk-field' }, el('label', {}, tr().channelTopic), topic))
    const d = dialog({ title: existing ? tr().rename : tr().newChannel, body, actions: [cancel, ok] })
    cancel.addEventListener('click', d.close)
    const go = async () => {
      if (!name.value.trim()) return name.focus()
      ok.disabled = true
      try {
        const row = existing ? await channelsApi.update(existing.id, { name: name.value, topic: topic.value }) : await channelsApi.create({ name: name.value, topic: topic.value })
        d.close()
        await loadChannels()
        await open(row.id)
      } catch (e) {
        fail(e)
        ok.disabled = false
      }
    }
    ok.addEventListener('click', () => void go())
    name.addEventListener('keydown', (e) => e.key === 'Enter' && void go())
    name.focus()
  }
  newBtn.addEventListener('click', () => channelDialog())
  newBtn.hidden = !msk.can('create')

  // ---------------------------------------------------------------------------------------------------- the room
  const drawHead = () => {
    roomHead.replaceChildren()
    if (!current) return
    const back = el('button', { type: 'button', class: 'msk-btn ghost mini cch-back', 'aria-label': tr().back }, '‹')
    back.addEventListener('click', () => root.setAttribute('data-view', 'list'))
    const others = people.filter((p) => p.id !== me)
    const who = others.length ? el('span', { class: 'cch-who', title: others.map((p) => p.name).join(', ') }, avatarStack(others.map((p) => p.name), 4), el('span', { class: 'cch-online' }, sub(tr().online, { n: others.length + 1 }))) : el('span', { class: 'cch-online' }, tr().alone)
    const acts = el('div', { class: 'cch-acts' })
    if (can(current)) {
      const call = el('button', { type: 'button', class: 'msk-btn ghost mini' }, '📞 ' + tr().call)
      call.addEventListener('click', () => {
        const url = callUrl(current!.id)
        window.open(url, '_blank', 'noopener,noreferrer')
        input.value = sub(tr().callText, { url })
        void send()
      })
      acts.append(call)
    }
    if (current.my_level === 'manage') {
      const share = el('button', { type: 'button', class: 'msk-btn ghost mini' }, tr().share)
      share.addEventListener('click', () => void msk.share(current!.id).catch(fail))
      const edit = el('button', { type: 'button', class: 'msk-btn ghost mini' }, tr().rename)
      edit.addEventListener('click', () => channelDialog(current!))
      const del = el('button', { type: 'button', class: 'msk-btn ghost mini danger-text' }, tr().remove)
      del.addEventListener('click', () => void removeChannel())
      acts.append(share, edit, del)
    }
    roomHead.append(back, el('div', { class: 'cch-titles' }, el('h2', {}, '# ' + String(current.values.name ?? '')), el('p', {}, String(current.values.topic ?? ''))), who, acts)
  }

  const removeChannel = async () => {
    if (!current) return
    const c = current
    if (!(await confirmDialog({ title: tr().remove, text: sub(tr().removeConfirm, { n: String(c.values.name ?? '') }), ok: tr().delete, cancel: tr().cancel, danger: true }))) return
    try {
      await channelsApi.remove(c.id)
      closeRoom()
      await loadChannels()
      drawRoomEmpty()
    } catch (e) {
      fail(e)
    }
  }

  const reactionPills = (m: Msg) => {
    const box = el('div', { class: 'cm-reacts' })
    for (const [emoji, ids] of Object.entries(m.reactions)) {
      const mine = ids.includes(me)
      const b = el('button', { type: 'button', class: 'cm-react' + (mine ? ' mine' : ''), 'aria-pressed': String(mine), 'aria-label': `${emoji} ${ids.length}` }, emoji, el('span', { class: 'cm-count' }, String(ids.length)))
      b.addEventListener('click', () => void react(m, emoji))
      box.append(b)
    }
    return box
  }

  const messageEl = (m: Msg, head: boolean) => {
    const own = m.from.id === me
    const row = el('article', { class: 'cm' + (head ? ' head' : ''), 'data-id': m.id })
    row.append(head ? avatar(m.from.name) : el('span', { class: 'cm-gutter', 'aria-hidden': 'true' }, el('span', { class: 'cm-hover-time' }, timeOf(m.at))))
    const body = el('div', { class: 'cm-body' })
    if (head) body.append(el('div', { class: 'cm-meta' }, el('strong', {}, own ? m.from.name + ' (' + tr().you + ')' : m.from.name), el('time', { datetime: m.at }, timeOf(m.at)), ...(m.edited ? [el('span', { class: 'cm-edited' }, tr().edited)] : [])))
    if (m.replyTo) {
      const parent = msgs.find((x) => x.id === m.replyTo)
      body.append(el('button', { type: 'button', class: 'cm-quote' }, el('b', {}, parent?.from.name ?? '…'), ' ', parent ? snippet(parent.text, 100) : ''))
    }
    if (editing === m.id) {
      const ta = el('textarea', { class: 'cch-input cm-edit', rows: '2', maxlength: '4000', 'aria-label': tr().edit })
      ta.value = m.text
      const ok = el('button', { type: 'button', class: 'msk-btn mini' }, tr().save)
      const no = el('button', { type: 'button', class: 'msk-btn ghost mini' }, tr().cancel)
      const save = () => void saveEdit(m, ta.value)
      ok.addEventListener('click', save)
      no.addEventListener('click', () => {
        editing = null
        drawMessages(false)
      })
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          save()
        } else if (e.key === 'Escape') no.click()
      })
      body.append(ta, el('div', { class: 'cm-editbar' }, ok, no))
      queueMicrotask(() => ta.focus())
    } else {
      const text = renderMarkdown(m.text)
      body.append(text)
      if (!head && m.edited) body.append(el('span', { class: 'cm-edited' }, tr().edited))
    }
    if (Object.keys(m.reactions).length) body.append(reactionPills(m))
    row.append(body)
    // the buttons that show on hover and on focus
    if (editing !== m.id) {
      const acts = el('div', { class: 'cm-actions', role: 'toolbar', 'aria-label': tr().react })
      const btn = (label: string, glyph: string, fn: (b: HTMLElement) => void) => {
        const b = el('button', { type: 'button', class: 'cm-act', 'aria-label': label, title: label }, glyph)
        b.addEventListener('click', () => fn(b))
        acts.append(b)
      }
      if (can(current)) {
        btn(tr().react, '☺', (b) => menu(b, QUICK.map((e) => ({ label: e, onClick: () => void react(m, e) }))))
        btn(tr().reply, '↩', () => setReply(m))
      }
      if (own && can(current)) btn(tr().edit, '✎', () => ((editing = m.id), drawMessages(false)))
      if (own || current?.my_level === 'manage') btn(tr().delete, '🗑', () => void removeMessage(m))
      if (acts.childElementCount) row.append(acts)
    }
    return row
  }

  const nearBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120
  const drawMessages = (stick: boolean) => {
    const keep = nearBottom()
    const before = scroller.scrollHeight
    scroller.replaceChildren()
    if (older) {
      const more = el('button', { type: 'button', class: 'msk-btn ghost mini cch-older' }, tr().loadOlder)
      more.addEventListener('click', () => void loadOlder())
      scroller.append(more)
    }
    if (!msgs.length && !loading) scroller.append(el('p', { class: 'cch-none center' }, tr().noMessages))
    for (const run of runs(msgs)) {
      scroller.append(el('div', { class: 'cch-day' }, el('span', {}, dayLabel(run.day))))
      for (const it of run.items) scroller.append(messageEl(it.msg, it.head))
    }
    if (stick || keep) scroller.scrollTop = scroller.scrollHeight
    else scroller.scrollTop += scroller.scrollHeight - before
  }

  const drawTyping = () => {
    const names = typingNames(people, me, typingSeen, Date.now())
    typingLine.textContent = names.length === 0 ? '' : names.length === 1 ? sub(tr().typing1, { a: names[0]! }) : names.length === 2 ? sub(tr().typing2, { a: names[0]!, b: names[1]! }) : tr().typingMany
  }
  setInterval(drawTyping, 2000)

  const drawBanner = () => {
    const text = status === 'reconnecting' ? tr().reconnecting : status === 'gap' ? tr().gap : status === 'closed' ? tr().closed : ''
    banner.hidden = !text
    banner.replaceChildren()
    if (!text) return
    banner.append(el('span', {}, text))
    if (status !== 'reconnecting') {
      const b = el('button', { type: 'button', class: 'msk-btn ghost mini' }, tr().reload)
      b.addEventListener('click', () => current && void open(current.id))
      banner.append(b)
    }
  }

  const drawComposer = () => {
    const writable = can(current)
    input.disabled = !writable
    sendBtn.disabled = !writable
    input.placeholder = writable ? tr().placeholder : tr().readOnly
    if (replyTo) {
      replyBar.hidden = false
      replyBar.replaceChildren(el('span', {}, sub(tr().replyingTo, { n: replyTo.from.name }), ' — ', snippet(replyTo.text, 80)))
      const x = el('button', { type: 'button', class: 'msk-btn ghost mini', 'aria-label': tr().cancelReply }, '×')
      x.addEventListener('click', () => setReply(null))
      replyBar.append(x)
    } else replyBar.hidden = true
  }
  const setReply = (m: Msg | null) => {
    replyTo = m
    drawComposer()
    if (m) input.focus()
  }

  const drawRoomEmpty = () => {
    roomHead.replaceChildren()
    scroller.replaceChildren(
      channels.length
        ? emptyState({ art: 'chat', title: tr().noChannelOpenTitle, text: tr().noChannelOpenText })
        : emptyState({ art: 'chat', title: tr().noChannelsTitle, text: tr().noChannelsText, actions: msk.can('create') ? [Object.assign(el('button', { type: 'button', class: 'msk-btn' }, tr().newChannel), { onclick: () => channelDialog() })] : [] }),
    )
    composer.hidden = true
    typingLine.textContent = ''
  }

  // ------------------------------------------------------------------------------------------------- data and live
  const closeRoom = () => {
    rt?.close()
    rt = null
    current = null
    msgs = []
    older = null
    people = []
    typingSeen.clear()
    replyTo = null
    editing = null
    status = 'connecting'
    wasLive = false
  }

  const loadHistory = async (id: string) => {
    loading = true
    try {
      const r = await messagesApi.list({ parent: id, sort: 'created_at', dir: 'desc', limit: PAGE })
      if (current?.id !== id) return
      msgs = r.rows.map(fromRow).reduce<Msg[]>((acc, m) => upsert(acc, m), [])
      older = r.next ?? null
    } catch (e) {
      fail(e)
    } finally {
      loading = false
    }
    drawMessages(true)
  }

  const loadOlder = async () => {
    if (!current || !older) return
    try {
      const r = await messagesApi.list({ parent: current.id, sort: 'created_at', dir: 'desc', limit: PAGE, cursor: older })
      msgs = r.rows.map(fromRow).reduce<Msg[]>((acc, m) => upsert(acc, m), msgs)
      older = r.next ?? null
      drawMessages(false)
    } catch (e) {
      fail(e)
    }
  }

  /** What arrives on the channel is only a hint (what changed): the message is read again from the data. */
  const refresh = async (id: string, kind: string) => {
    if (kind === 'del') {
      msgs = without(msgs, id)
      return drawMessages(false)
    }
    try {
      msgs = upsert(msgs, fromRow(await messagesApi.get(id)))
    } catch {
      msgs = without(msgs, id)
    }
    drawMessages(false)
  }

  const open = async (id: string) => {
    closeRoom()
    const row = channels.find((c) => c.id === id) ?? (await channelsApi.get(id).catch(() => null))
    if (!row) return
    current = row
    composer.hidden = false
    root.setAttribute('data-view', 'room')
    drawChannels()
    drawHead()
    drawComposer()
    drawBanner()
    scroller.replaceChildren(skeleton({ kind: 'rows', count: 5 }))
    const chan = msk.realtime.open({ resource: id, name: 'chat', state: { typing: false } })
    rt = chan
    chan.onMessage((m) => {
      const d = m.data as { t?: string; id?: string } | null
      if (d && typeof d.id === 'string' && typeof d.t === 'string' && current?.id === id) void refresh(d.id, d.t)
    })
    chan.onPresence((list) => {
      people = list
      const now = Date.now()
      for (const p of list) if ((p.state as { typing?: boolean } | undefined)?.typing && p.id !== me) typingSeen.set(p.id, now)
      drawHead()
      drawTyping()
    })
    chan.onStatus((s) => {
      status = s
      drawBanner()
      // after a break the history is read again: nothing that happened meanwhile is lost
      if (s === 'live' && wasLive && current?.id === id) void loadHistory(id)
      if (s === 'gap' && current?.id === id) void loadHistory(id)
      if (s === 'live') wasLive = true
    })
    await loadHistory(id)
    if (!input.disabled) input.focus()
  }

  // ------------------------------------------------------------------------------------------------------ actions
  let lastTyping = 0
  let typingOff: ReturnType<typeof setTimeout> | undefined
  const setTyping = (on: boolean) => {
    if (!rt) return
    void rt.setState({ typing: on }).catch(() => undefined)
    lastTyping = on ? Date.now() : 0
  }
  input.addEventListener('input', () => {
    input.style.height = 'auto'
    input.style.height = Math.min(input.scrollHeight, 160) + 'px'
    if (input.value.trim() && Date.now() - lastTyping > TYPING_EVERY) setTyping(true)
    clearTimeout(typingOff)
    typingOff = setTimeout(() => lastTyping && setTyping(false), 4000)
  })

  const send = async () => {
    const text = input.value.trim()
    if (!text || !current || !can(current)) return
    sendBtn.disabled = true
    try {
      const row = await messagesApi.create({ text, ...(replyTo ? { reply_to: replyTo.id } : {}) }, current.id)
      input.value = ''
      input.style.height = 'auto'
      replyTo = null
      drawComposer()
      msgs = upsert(msgs, fromRow(row))
      drawMessages(true)
      clearTimeout(typingOff)
      if (lastTyping) setTyping(false)
      void rt?.send({ t: 'msg', id: row.id }).catch(() => undefined)
    } catch (e) {
      toast(tr().sendFailed + errText(e, msk.context?.lang), { tone: 'err', ms: 6000 })
    } finally {
      sendBtn.disabled = !can(current)
      input.focus()
    }
  }
  sendBtn.addEventListener('click', () => void send())
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      void send()
    }
  })

  const saveEdit = async (m: Msg, text: string) => {
    if (!text.trim()) return
    try {
      const row = await messagesApi.update(m.id, { text })
      editing = null
      msgs = upsert(msgs, fromRow(row))
      drawMessages(false)
      void rt?.send({ t: 'edit', id: m.id }).catch(() => undefined)
    } catch (e) {
      fail(e)
    }
  }

  const react = async (m: Msg, emoji: string) => {
    try {
      // read the latest first: two people reacting at the same time must not wipe each other
      const fresh = fromRow(await messagesApi.get(m.id))
      const next = toggleReaction(fresh.reactions, emoji, me)
      const row = await messagesApi.update(m.id, { text: fresh.text, reactions: stringifyReactions(next) })
      msgs = upsert(msgs, fromRow(row))
      drawMessages(false)
      void rt?.send({ t: 'react', id: m.id }).catch(() => undefined)
    } catch (e) {
      fail(e)
    }
  }

  const removeMessage = async (m: Msg) => {
    if (!(await confirmDialog({ title: tr().delete, text: tr().deleteConfirm, ok: tr().delete, cancel: tr().cancel, danger: true }))) return
    try {
      await messagesApi.remove(m.id)
      msgs = without(msgs, m.id)
      drawMessages(false)
      void rt?.send({ t: 'del', id: m.id }).catch(() => undefined)
    } catch (e) {
      fail(e)
    }
  }

  // -------------------------------------------------------------------------------------------------------- start
  msk.onContext((ctx) => {
    if (langOf(ctx.lang) === lang) return
    lang = langOf(ctx.lang)
    newBtn.setAttribute('aria-label', tr().newChannel)
    side.querySelector('h1')!.textContent = tr().channels
    sendBtn.textContent = tr().send
    input.setAttribute('aria-label', tr().placeholder)
    drawHead()
    drawComposer()
    drawMessages(false)
  })
  drawRoomEmpty()
  void loadChannels().then(() => {
    drawRoomEmpty()
    // the page can be opened at a channel (a notification, a link): `at` is its id
    if (msk.at && channels.some((c) => c.id === msk.at)) void open(msk.at)
    else if (channels.length === 1) void open(channels[0]!.id)
  })
}

connect()
  .then(mount)
  .catch((e) => {
    app.textContent = TEXTS[langOf(undefined)].failed + errText(e)
  })
