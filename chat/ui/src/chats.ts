// UI of Chat 2.0, the replica of the Chat section of Microsoft Teams: the list of chats on the left (pinned and recent,
// unread, presence, search and filters), the conversation on the right (bubbles, reactions, replies, mentions, files, pins,
// calls), live over the channels of the platform. The data is read and written with the commands of the logic; what arrives
// on a channel is only a hint (which message changed), every client reads the data again, so nothing a person sends can
// pose as someone else.
import {
  avatar,
  avatarStack,
  confirmDialog,
  el,
  emptyState,
  errText,
  filteredEmpty,
  menu,
  skeleton,
  toast,
  type Msk,
  type RealtimeChannel,
  type RealtimePerson,
} from '@mosaikit/plugin-api'
import {
  callState,
  chatTitle,
  duration,
  fileSize,
  isUnread,
  lastOwn,
  linkHost,
  listTime,
  others,
  parseTime,
  previewLine,
  QUICK,
  runs,
  sections,
  seenBy,
  totalUnread,
  upsert,
  visibleChats,
  type Attachment,
  type Chat,
  type ChatMsg,
  type Filter,
  type Member,
  type Person,
} from './chats-logic.ts'
import { composer, type Composer, type Outgoing } from './composer.ts'
import { addPeopleDialog, DOCS, docsPicker, newChatDialog, peopleDialog, type HistoryChoice } from './dialogs.ts'
import { engineFor } from './engines.ts'
import { typingNames } from './logic.ts'
import { renderMessage } from './render.ts'
import { langOf, sub, TEXTS } from './texts.ts'

/** Most chats kept open on the live channel (the platform allows 20 for a person; one is the current chat). */
const HOT = 12
const AWAY_AFTER = 5 * 60_000
const PAGE = 40
type Tab = 'chat' | 'files' | 'pinned'
type Hint = { t?: string; id?: string }

export function mountChats(msk: Msk, app: HTMLElement) {
  document.documentElement.classList.add('msk-fill')
  let lang = langOf(msk.context?.lang)
  const tr = () => TEXTS[lang]!
  const me = msk.user?.id ?? ''
  const myName = msk.user?.name ?? msk.user?.username ?? ''
  const cmd = <T>(name: string, args: Record<string, unknown> = {}) => msk.call<T>(name, args)
  const fail = (e: unknown) => toast(errText(e, msk.context?.lang), { tone: 'err', ms: 6000 })
  const canAttach = msk.can('create') && true

  let chats: Chat[] = []
  let loaded = false
  let current: string | null = null
  let filter: Filter = 'all'
  let query = ''
  let found: { id: string; chat: string; at: string; text: string; author_name: string }[] | null = null
  let tab: Tab = 'chat'
  let msgs: ChatMsg[] = []
  let members: Member[] = []
  let more = false
  let loading = false
  let tabMsgs: ChatMsg[] = []
  let divider = 0
  let status = 'connecting'
  let wasLive = false
  const channels = new Map<string, RealtimeChannel>()
  const presence = new Map<string, RealtimePerson[]>()
  const typingSeen = new Map<string, number>()
  let away = false
  let typingOn = false
  let call: { msg: ChatMsg; frame: HTMLElement; timer: ReturnType<typeof setInterval>; box: HTMLElement } | null = null
  let docsFolder: string | null = null

  // ------------------------------------------------------------------------------------------------------- skeleton
  const newBtn = el('button', { type: 'button', class: 'cl-new' }, '✎')
  const title = el('h1', {}, tr().title)
  const search = el('input', { type: 'search', class: 'cl-search', autocomplete: 'off' })
  const filterBar = el('div', { class: 'cl-filters', role: 'group' })
  const items = el('div', { class: 'cl-items' })
  const chanLink = el('button', { type: 'button', class: 'cl-chan' }, '# ' + tr().channels)
  const side = el('aside', { class: 'cl' }, el('div', { class: 'cl-head' }, title, newBtn), el('div', { class: 'cl-searchrow' }, search), filterBar, items, chanLink)
  const head = el('header', { class: 'cr-head' })
  const tabsBar = el('div', { class: 'cr-tabs', role: 'tablist' })
  const banner = el('div', { class: 'cr-banner', role: 'status' })
  banner.hidden = true
  const searchBar = el('div', { class: 'cr-search' })
  searchBar.hidden = true
  const body = el('div', { class: 'cr-body' })
  const typingLine = el('div', { class: 'cr-typing', 'aria-live': 'polite' })
  const compose: Composer = composer({
    tr,
    me,
    members: () => members,
    names: (id) => nameOf(id),
    group: () => currentChat()?.kind === 'group',
    canAttach,
    onSend: (m) => send(m),
    onSaveEdit: (id, text) => saveEdit(id, text),
    onTyping: (on) => setTyping(on),
    upload: (f) => uploadFile(f),
    pickFromDocs: () => docsPicker(msk, tr),
  })
  const composeBox = el('div', { class: 'cr-compose' }, compose.el)
  composeBox.hidden = true
  const room = el('section', { class: 'cr' }, head, tabsBar, banner, searchBar, body, typingLine, composeBox)
  const root = el('div', { class: 'cchat', 'data-view': 'list' }, side, room)
  app.replaceChildren(root)

  const currentChat = () => chats.find((c) => c.id === current) ?? null
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? chats.flatMap((c) => c.members).find((m) => m.id === id)?.name ?? ''
  const title_ = (c: Chat) => chatTitle(c, me, tr().you)
  const now = () => Date.now()
  const timeOf = (iso: string) => new Date(parseTime(iso)).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })
  const dayLabel = (d: string) => {
    const t = new Date()
    const key = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
    const y = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1)
    return d === key(t) ? tr().today : d === key(y) ? tr().yesterday : new Date(d + 'T00:00:00').toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' })
  }

  // ------------------------------------------------------------------------------------------------------ presence
  /** `available` when the person is on a channel we hold, `away` when their page says so, else nothing. */
  const onlineState = (id: string): 'available' | 'away' | null => {
    let s: 'available' | 'away' | null = null
    for (const list of presence.values()) {
      for (const p of list) {
        if (p.id !== id) continue
        const st = (p.state as { status?: string } | undefined)?.status
        if (st !== 'away') return 'available'
        s = 'away'
      }
    }
    return id === me ? (away ? 'away' : 'available') : s
  }
  const dot = (id: string) => {
    const s = onlineState(id)
    const d = el('span', { class: 'cl-dot ' + (s ?? 'off'), role: 'img', 'aria-label': s === 'available' ? tr().presenceAvailable : s === 'away' ? tr().presenceAway : '' })
    d.hidden = !s
    return d
  }

  const faces = (c: Chat, big = false) => {
    const o = others(c, me)
    if (c.kind === 'direct' || o.length < 2) {
      const who = o[0]?.name ?? title_(c)
      const w = el('span', { class: 'cl-av' + (big ? ' big' : '') }, avatar(who, big))
      if (c.kind === 'direct' && o[0] && o[0].id !== me) w.append(dot(o[0].id))
      return w
    }
    const mosaic = el('span', { class: 'cl-mosaic' + (big ? ' big' : ''), 'aria-hidden': 'true' })
    for (const m of o.slice(0, 3)) mosaic.append(avatar(m.name))
    if (o.length > 3) mosaic.append(el('span', { class: 'msk-avatar more' }, `+${o.length - 3}`))
    return mosaic
  }

  // -------------------------------------------------------------------------------------------------------- list
  let listQueued = false
  const scheduleList = () => {
    if (listQueued) return
    listQueued = true
    requestAnimationFrame(() => {
      listQueued = false
      drawList()
    })
  }

  const chatMenu = (anchor: HTMLElement, c: Chat) => {
    const group = c.kind === 'group'
    menu(anchor, [
      { label: c.pinned_at ? tr().unpin : tr().pin, onClick: () => void settings(c, { pinned: !c.pinned_at }) },
      { label: c.muted ? tr().unmute : tr().mute, onClick: () => void settings(c, { muted: !c.muted }) },
      { label: isUnread(c) ? tr().markRead : tr().markUnread, onClick: () => void (isUnread(c) ? readNow(c.id) : settings(c, { unread: true })) },
      { label: group ? tr().leaveChat : tr().hideChat, danger: group, onClick: () => void leave(c) },
    ])
  }

  const chatRow = (c: Chat) => {
    const unread = isUnread(c)
    const ptime = listTime(parseTime(c.last_at), now(), lang, tr().yesterday)
    const badge = unread ? el('span', { class: 'cl-badge' + (c.mentions ? ' at' : '') + (c.muted ? ' muted' : ''), 'aria-label': tr().unreadCount.replace('{n}', String(c.unread || 1)) }, c.mentions ? '@' : c.unread ? (c.unread > 99 ? '99+' : String(c.unread)) : '') : null
    const flags = el('span', { class: 'cl-flags' })
    if (c.pinned_at) flags.append(el('span', { title: tr().pinnedChat, 'aria-label': tr().pinnedChat }, '📌'))
    if (c.muted) flags.append(el('span', { title: tr().mutedChat, 'aria-label': tr().mutedChat }, '🔕'))
    const row = el(
      'button',
      { type: 'button', class: 'cl-row' + (c.id === current ? ' on' : '') + (unread ? ' unread' : ''), 'aria-current': String(c.id === current), 'data-id': c.id },
      faces(c),
      el(
        'span',
        { class: 'cl-text' },
        el('span', { class: 'cl-line' }, el('span', { class: 'cl-name' }, title_(c)), flags, el('time', { class: 'cl-time' }, ptime)),
        el('span', { class: 'cl-line' }, el('span', { class: 'cl-prev' }, previewLine(c, me, { you: tr().you, call: tr().callTitle })), ...(badge ? [badge] : [])),
      ),
    )
    row.addEventListener('click', () => void open(c.id))
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      chatMenu(row, c)
    })
    const more = el('button', { type: 'button', class: 'cl-more', 'aria-label': tr().moreActions, title: tr().moreActions }, '⋯')
    more.addEventListener('click', (e) => {
      e.stopPropagation()
      chatMenu(more, c)
    })
    return el('div', { class: 'cl-item', role: 'listitem' }, row, more)
  }

  const drawFilters = () => {
    filterBar.setAttribute('aria-label', tr().filters)
    filterBar.replaceChildren()
    const opts: [Filter, string][] = [
      ['all', tr().filterAll],
      ['unread', tr().filterUnread],
      ['chats', tr().filterChats],
      ['meetings', tr().filterMeetings],
    ]
    for (const [k, label] of opts) {
      const b = el('button', { type: 'button', class: 'cl-filter' + (filter === k ? ' on' : ''), 'aria-pressed': String(filter === k) }, label)
      b.addEventListener('click', () => {
        filter = k
        drawFilters()
        drawList()
      })
      filterBar.append(b)
    }
  }

  const drawList = () => {
    items.replaceChildren()
    if (found) return drawFound()
    if (!loaded) return void items.append(skeleton({ kind: 'rows', count: 6 }))
    const list = visibleChats(chats, { filter, q: query, me })
    if (!chats.some((c) => !c.hidden)) {
      items.append(emptyState({ art: 'chat', title: tr().noChatsTitle, text: tr().noChatsText, actions: [Object.assign(el('button', { type: 'button', class: 'msk-btn' }, tr().newChat), { onclick: () => startNew() })] }))
    } else if (!list.length) {
      items.append(filteredEmpty(tr().noChatMatch, tr().clearFilters, () => {
        filter = 'all'
        query = ''
        search.value = ''
        drawFilters()
        drawList()
      }))
    } else {
      const s = sections(list)
      const group = (label: string, cs: Chat[]) => {
        if (!cs.length) return
        items.append(el('h2', { class: 'cl-section' }, label))
        const box = el('div', { class: 'cl-group', role: 'list', 'aria-label': label })
        for (const c of cs) box.append(chatRow(c))
        items.append(box)
      }
      group(tr().pinnedSection, s.pinned)
      group(tr().recentSection, s.recent)
    }
    document.title = (totalUnread(chats) ? `(${totalUnread(chats)}) ` : '') + tr().title
  }

  const drawFound = () => {
    items.append(el('h2', { class: 'cl-section' }, tr().searchResults))
    if (!found!.length) items.append(el('p', { class: 'cl-none' }, tr().searchNone))
    for (const r of found!) {
      const c = chats.find((x) => x.id === r.chat)
      const b = el('button', { type: 'button', class: 'cl-hit' }, el('span', { class: 'cl-line' }, el('strong', {}, c ? title_(c) : ''), el('time', { class: 'cl-time' }, listTime(parseTime(r.at), now(), lang, tr().yesterday))), el('span', { class: 'cl-prev' }, (r.author_name ? r.author_name.split(/\s+/)[0] + ': ' : '') + r.text))
      b.addEventListener('click', () => void open(r.chat, r.id))
      items.append(b)
    }
  }

  const loadOverview = async () => {
    try {
      const r = await cmd<{ chats: Chat[] }>('chats.overview')
      const before = new Map(chats.map((c) => [c.id, c.unread]))
      chats = r.chats
      loaded = true
      // a message that arrived in the chat that is open and in view is read at once
      const c = currentChat()
      if (c && (c.unread > 0 || c.marked_unread) && c.unread !== (before.get(c.id) ?? 0) && tab === 'chat') markRead()
      syncChannels()
      drawList()
      if (current) drawHead()
    } catch (e) {
      loaded = true
      drawList()
      fail(e)
    }
  }
  let overviewTimer: ReturnType<typeof setTimeout> | undefined
  const overviewSoon = () => {
    clearTimeout(overviewTimer)
    overviewTimer = setTimeout(() => void loadOverview(), 400)
  }

  const settings = async (c: Chat, s: Record<string, unknown>) => {
    try {
      await cmd('chats.settings', { chat: c.id, ...s })
      await loadOverview()
    } catch (e) {
      fail(e)
    }
  }

  const leave = async (c: Chat) => {
    if (c.kind === 'group' && !(await confirmDialog({ title: tr().leaveTitle, text: tr().leaveText, ok: tr().leaveChat, cancel: tr().cancel, danger: true }))) return
    try {
      await cmd('chats.leave', { chat: c.id })
      if (current === c.id) closeRoom()
      if (c.kind === 'group') void announce(c.id, { t: 'members' })
      await loadOverview()
      drawRoomEmpty()
    } catch (e) {
      fail(e)
    }
  }

  // ------------------------------------------------------------------------------------------------------- live
  const stateFor = (id: string) => ({ typing: id === current && typingOn, status: away ? 'away' : 'available' })
  const pushState = () => {
    for (const [id, ch] of channels) void ch.setState(stateFor(id)).catch(() => undefined)
  }

  const handleHint = (id: string, h: Hint, from: RealtimePerson) => {
    if (id !== current) {
      if (h.t === 'msg' || h.t === 'call' || h.t === 'members') overviewSoon()
      return
    }
    if (h.t === 'read') {
      const m = members.find((x) => x.id === from.id)
      if (m && from.id !== me) {
        m.last_read_at = new Date().toISOString()
        if (tab === 'chat') drawMessages(false)
      }
      return
    }
    if (h.t === 'members') {
      void reloadMembers()
      overviewSoon()
      return
    }
    if (typeof h.id === 'string') void refreshMessage(h.id, h.t ?? '')
    if (h.t === 'msg' || h.t === 'call') overviewSoon()
  }

  const openChannel = (id: string) => {
    const ch = msk.realtime.open({ resource: id, name: 'chat', state: stateFor(id) })
    channels.set(id, ch)
    ch.onMessage((m) => {
      const d = m.data as Hint | null
      if (d && typeof d === 'object' && typeof d.t === 'string') handleHint(id, d, m.from)
    })
    ch.onPresence((list) => {
      presence.set(id, list)
      if (id === current) {
        for (const p of list) if ((p.state as { typing?: boolean } | undefined)?.typing && p.id !== me) typingSeen.set(p.id, now())
        drawTyping()
        drawHead()
      }
      scheduleList()
    })
    ch.onStatus((s) => {
      if (id !== current) return
      status = s
      drawBanner()
      if ((s === 'live' && wasLive) || s === 'gap') void open(id)
      if (s === 'live') wasLive = true
    })
  }

  /** The current chat and the most recent ones stay on the live channel; the others are read again from time to time. */
  const syncChannels = () => {
    const wanted = new Set<string>()
    if (current) wanted.add(current)
    for (const c of sections(chats.filter((x) => !x.hidden)).recent.slice(0, HOT)) wanted.add(c.id)
    for (const c of chats.filter((x) => x.pinned_at).slice(0, 4)) wanted.add(c.id)
    for (const id of [...channels.keys()]) {
      if (!wanted.has(id)) {
        channels.get(id)?.close()
        channels.delete(id)
        presence.delete(id)
      }
    }
    let n = channels.size
    for (const id of wanted) {
      if (!channels.has(id) && chats.some((c) => c.id === id) && n < 18) {
        openChannel(id)
        n++
      }
    }
  }

  const announce = async (chat: string, h: Hint) => {
    await channels.get(chat)?.send(h).catch(() => undefined)
  }

  // ------------------------------------------------------------------------------------------------------ header
  const drawHead = () => {
    head.replaceChildren()
    const c = currentChat()
    if (!c) return
    const back = el('button', { type: 'button', class: 'cr-back', 'aria-label': tr().backToList }, '‹')
    back.addEventListener('click', () => {
      root.setAttribute('data-view', 'list')
    })
    const o = others(c, me)
    const st = c.kind === 'direct' && o[0] && o[0].id !== me ? onlineState(o[0].id) : null
    const sub_ = c.kind === 'group' ? sub(tr().peopleCount, { n: c.members.length }) : st === 'available' ? tr().presenceAvailable : st === 'away' ? tr().presenceAway : ''
    const titles = el('div', { class: 'cr-titles' }, el('h2', {}, title_(c)), el('p', {}, sub_))
    const acts = el('div', { class: 'cr-acts' })
    const btn = (label: string, glyph: string, fn: () => void, cls = '') => {
      const b = el('button', { type: 'button', class: 'cr-act ' + cls, 'aria-label': label, title: label }, glyph)
      b.addEventListener('click', fn)
      acts.append(b)
      return b
    }
    if (c.kind === 'group') {
      const stack = avatarStack(o.map((m) => m.name), 3)
      const people = el('button', { type: 'button', class: 'cr-people', 'aria-label': tr().people, title: tr().people }, stack)
      people.addEventListener('click', () => showPeople())
      acts.append(people)
    }
    btn(tr().callVideo, '📹', () => void startCall(false), 'call')
    btn(tr().callAudio, '📞', () => void startCall(true), 'call')
    btn(tr().searchInChat, '🔍', () => toggleSearch())
    btn(tr().addPeople, '👥', () => showAdd())
    head.append(back, faces(c, true), titles, acts)
    if (c.kind === 'group') {
      titles.querySelector('h2')!.setAttribute('title', tr().renameChat)
    }
    drawTabs()
  }

  const drawTabs = () => {
    tabsBar.replaceChildren()
    tabsBar.setAttribute('aria-label', tr().tabs)
    const list: [Tab, string][] = [
      ['chat', tr().tabChat],
      ['files', tr().tabFiles],
      ['pinned', tr().tabPinned],
    ]
    for (const [k, label] of list) {
      const b = el('button', { type: 'button', role: 'tab', class: 'cr-tab' + (tab === k ? ' on' : ''), 'aria-selected': String(tab === k) }, label)
      b.addEventListener('click', () => void setTab(k))
      tabsBar.append(b)
    }
  }

  const setTab = async (t: Tab) => {
    tab = t
    searchBar.hidden = true
    drawTabs()
    composeBox.hidden = t !== 'chat'
    typingLine.hidden = t !== 'chat'
    if (t === 'chat') return drawMessages(true)
    body.replaceChildren(skeleton({ kind: 'rows', count: 4 }))
    try {
      const r = await cmd<{ messages: ChatMsg[] }>('chats.messages', { chat: current, only: t === 'files' ? 'files' : 'pinned' })
      tabMsgs = r.messages
    } catch (e) {
      fail(e)
      tabMsgs = []
    }
    drawTabBody()
  }

  const drawBanner = () => {
    const text = status === 'reconnecting' ? tr().reconnecting : status === 'gap' ? tr().gap : ''
    banner.hidden = !text
    banner.replaceChildren()
    if (text) banner.append(el('span', {}, text))
  }

  const drawTyping = () => {
    const c = currentChat()
    const ch = c ? presence.get(c.id) ?? [] : []
    const names = typingNames(ch, me, typingSeen, now())
    typingLine.textContent = names.length === 0 ? '' : names.length === 1 ? sub(tr().typing1, { a: names[0]! }) : names.length === 2 ? sub(tr().typing2, { a: names[0]!, b: names[1]! }) : tr().typingMany
  }
  setInterval(drawTyping, 2000)

  // --------------------------------------------------------------------------------------------------- messages
  const nearBottom = () => body.scrollHeight - body.scrollTop - body.clientHeight < 120

  const fileCard = (a: Attachment) => {
    const b = el('button', { type: 'button', class: 'cb-file', title: tr().openFile }, el('span', { class: 'cb-fileic', 'aria-hidden': 'true' }, '📄'), el('span', { class: 'cb-filename' }, a.name), el('span', { class: 'cb-filesize' }, a.size ? fileSize(a.size) : ''))
    b.addEventListener('click', () => void openFile(a))
    return b
  }

  const reactionsRow = (m: ChatMsg) => {
    const row = el('div', { class: 'cb-reacts' })
    for (const [emoji, people] of Object.entries(m.reactions)) {
      const mine = people.some((p) => p.id === me)
      const names = people.map((p) => (p.id === me ? tr().you : p.name)).join(', ')
      const b = el('button', { type: 'button', class: 'cb-react' + (mine ? ' mine' : ''), 'aria-pressed': String(mine), title: sub(tr().reactedWith, { n: names, e: emoji }), 'aria-label': `${emoji} ${people.length}: ${names}` }, emoji, el('span', { class: 'cb-count' }, String(people.length)))
      b.addEventListener('click', () => void react(m, emoji))
      row.append(b)
    }
    return row
  }

  const systemLine = (m: ChatMsg) => {
    const meta = m.meta as { event?: string; by?: Person; users?: Person[]; name?: string }
    const who = (p?: Person) => (p ? nameOf(p.id) || p.name : tr().deletedAuthor)
    const a = who(meta.by)
    const b = (meta.users ?? []).map(who).join(', ')
    const text =
      meta.event === 'added' ? sub(tr().sysAdded, { a, b }) : meta.event === 'removed' ? sub(tr().sysRemoved, { a, b }) : meta.event === 'left' ? sub(tr().sysLeft, { a }) : meta.event === 'renamed' ? (meta.name ? sub(tr().sysRenamed, { a, b: meta.name }) : sub(tr().sysUnnamed, { a })) : ''
    return el('div', { class: 'cm-sys', 'data-id': m.id }, el('span', {}, text))
  }

  const callCard = (m: ChatMsg) => {
    const s = callState(m)
    const audio = m.meta.audio_only === true
    const starter = who(m.author)
    const card = el('div', { class: 'cm-call' + (s.live ? ' live' : ''), 'data-id': m.id })
    card.append(el('span', { class: 'cm-callic', 'aria-hidden': 'true' }, audio ? '📞' : '📹'))
    const info = el('div', { class: 'cm-callinfo' }, el('strong', {}, sub(audio ? tr().startedVoice : tr().startedCall, { n: starter })))
    if (s.live) {
      info.append(el('span', {}, sub(tr().inCall, { n: s.live_people.map((p) => p.name).join(', ') })))
      const join = el('button', { type: 'button', class: 'msk-btn mini' }, tr().joinCall)
      join.addEventListener('click', () => void joinCall(m))
      card.append(info, join)
    } else {
      info.append(el('span', {}, sub(tr().callEndedLine, { d: duration(s.ms) })))
      if (s.joined.length) info.append(el('span', { class: 'cm-calljoined' }, sub(tr().callJoined, { n: s.joined.map((p) => p.name).join(', ') })))
      card.append(info)
    }
    return card
  }
  const who = (id: string) => nameOf(id) || tr().deletedAuthor

  const bubble = (m: ChatMsg, head: boolean, own: boolean, lastMine: boolean) => {
    const c = currentChat()!
    const row = el('article', { class: 'cb ' + (own ? 'own' : 'other') + (head ? ' head' : ''), 'data-id': m.id })
    if (!own) row.append(head ? avatar(who(m.author)) : el('span', { class: 'cb-gutter', 'aria-hidden': 'true' }))
    const col = el('div', { class: 'cb-col' })
    if (head) col.append(el('div', { class: 'cb-meta' }, ...(own ? [] : [el('strong', {}, who(m.author))]), el('time', { datetime: m.at }, timeOf(m.at)), ...(m.pinned ? [el('span', { class: 'cb-pin', title: sub(tr().pinnedBy, { n: who(m.pinned_by) }) }, '📌')] : [])))
    const bub = el('div', { class: 'cb-bubble' + (m.importance !== 'normal' ? ' ' + m.importance : '') + (m.deleted ? ' deleted' : '') })
    if (m.importance !== 'normal' && !m.deleted) bub.append(el('div', { class: 'cb-imp' }, m.importance === 'urgent' ? '‼ ' + tr().urgentLabel : '❗ ' + tr().importantLabel))
    if (m.reply_to) {
      const parent = msgs.find((x) => x.id === m.reply_to)
      const q = el('button', { type: 'button', class: 'cb-quote' }, el('b', {}, parent ? who(parent.author) : '…'), ' ', parent ? (parent.deleted ? tr().deletedMsg : parent.text.replace(/\s+/g, ' ').slice(0, 100)) : '')
      q.addEventListener('click', () => void jumpTo(m.reply_to))
      bub.append(q)
    }
    if (m.deleted) bub.append(el('span', { class: 'cb-deleted' }, tr().deletedMsg))
    else {
      const names = m.mentions.map((id) => nameOf(id)).filter(Boolean)
      if (m.text) bub.append(renderMessage(m.text, names, c.kind === 'group'))
      for (const a of m.attachments) bub.append(fileCard(a))
      const host = linkHost(m.text)
      if (host) bub.append(el('span', { class: 'cb-link' }, '🔗 ' + host))
      if (m.edited) bub.append(el('span', { class: 'cb-edited' }, tr().edited))
    }
    col.append(bub)
    if (Object.keys(m.reactions).length) col.append(reactionsRow(m))
    if (lastMine && c.members.length > 1) {
      const saw = seenBy(m, members.length ? members : c.members, me)
      if (saw.length) col.append(el('div', { class: 'cb-seen', title: saw.map((p) => p.name).join(', ') }, c.kind === 'direct' ? '✓ ' + tr().seen : '✓ ' + sub(tr().seenBy, { n: saw.length > 3 ? String(saw.length) : saw.map((p) => p.name.split(/\s+/)[0]).join(', ') })))
    }
    row.append(col)
    if (!m.deleted) row.append(messageActions(m, own))
    return row
  }

  const messageActions = (m: ChatMsg, own: boolean) => {
    const acts = el('div', { class: 'cb-actions', role: 'toolbar', 'aria-label': tr().react })
    const add = (label: string, glyph: string, fn: (b: HTMLElement) => void) => {
      const b = el('button', { type: 'button', class: 'cb-act', 'aria-label': label, title: label }, glyph)
      b.addEventListener('click', () => fn(b))
      acts.append(b)
    }
    for (const e of QUICK) add(`${tr().react} ${e}`, e, () => void react(m, e))
    add(tr().moreEmoji, '☺', (b) => {
      const grid = el('div', { class: 'cc-emoji' })
      const items_ = ['🎉', '🙏', '👀', '🔥', '✅', '👏', '💯', '🤔', '😅', '😍', '🚀', '👎']
      const p = menuLike(b, grid)
      for (const e of items_) {
        const x = el('button', { type: 'button', class: 'cc-emojibtn', 'aria-label': e }, e)
        x.addEventListener('click', () => {
          p()
          void react(m, e)
        })
        grid.append(x)
      }
    })
    add(tr().reply, '↩', () => (compose.reply(m)))
    add(tr().moreActions, '⋯', (b) =>
      menu(b, [
        { label: m.pinned ? tr().unpinMessage : tr().pinMessage, onClick: () => void pin(m, !m.pinned) },
        { label: tr().copyText, onClick: () => void copy(m.text) },
        ...(own ? [{ label: tr().edit, onClick: () => compose.edit(m) }, { label: tr().delete, danger: true, onClick: () => void removeMessage(m) }] : []),
      ]),
    )
    return acts
  }

  /** A small box under an anchor that closes on Escape or a click outside (the kit popover without its focus handling). */
  const menuLike = (anchor: HTMLElement, content: HTMLElement) => {
    const wrap = el('div', { class: 'msk-popover' }, content)
    const r = anchor.getBoundingClientRect()
    wrap.style.left = `${Math.max(8, Math.min(r.left - 100, window.innerWidth - 220))}px`
    wrap.style.top = `${r.bottom + 6}px`
    document.body.append(wrap)
    const off = (ev?: Event) => {
      if (ev && wrap.contains(ev.target as Node)) return
      wrap.remove()
      document.removeEventListener('pointerdown', off, true)
    }
    setTimeout(() => document.addEventListener('pointerdown', off, true), 0)
    return () => off()
  }

  const drawMessages = (stick: boolean) => {
    if (tab !== 'chat') return
    const c = currentChat()
    if (!c) return
    const keep = nearBottom()
    const before = body.scrollHeight
    body.replaceChildren()
    if (more) {
      const b = el('button', { type: 'button', class: 'msk-btn ghost mini cr-older' }, tr().loadOlder)
      b.addEventListener('click', () => void loadOlder())
      body.append(b)
    }
    if (!msgs.length && !loading) body.append(el('p', { class: 'cr-nomsg' }, tr().noMessages))
    const mine = lastOwn(msgs, me)
    let dividerDone = false
    for (const run of runs(msgs, me)) {
      body.append(el('div', { class: 'cr-day' }, el('span', {}, dayLabel(run.day))))
      for (const it of run.items) {
        if (divider && !dividerDone && it.msg.author !== me && parseTime(it.msg.at) > divider) {
          dividerDone = true
          body.append(el('div', { class: 'cr-new', role: 'separator' }, el('span', {}, tr().newMessages)))
        }
        const m = it.msg
        body.append(m.kind === 'system' ? systemLine(m) : m.kind === 'call' ? callCard(m) : bubble(m, it.head, it.own, mine?.id === m.id))
      }
    }
    if (stick || keep) body.scrollTop = body.scrollHeight
    else body.scrollTop += body.scrollHeight - before
  }

  const drawTabBody = () => {
    body.replaceChildren()
    if (tab === 'files') {
      const files = tabMsgs.flatMap((m) => m.attachments.map((a) => ({ a, m })))
      if (!files.length) return void body.append(emptyState({ art: 'documents', title: tr().filesEmptyTitle, text: tr().filesEmptyText }))
      const list = el('ul', { class: 'cf-list' })
      for (const { a, m } of files.reverse()) {
        list.append(el('li', { class: 'cf-item' }, fileCard(a), el('span', { class: 'cf-by' }, sub(tr().sharedBy, { n: who(m.author) }) + ' · ' + new Date(parseTime(m.at)).toLocaleDateString(lang, { day: 'numeric', month: 'short' }))))
      }
      body.append(list)
    } else if (tab === 'pinned') {
      if (!tabMsgs.length) return void body.append(emptyState({ art: 'notes', title: tr().pinnedEmptyTitle, text: tr().pinnedEmptyText }))
      for (const m of tabMsgs.slice().reverse()) {
        const unpin = el('button', { type: 'button', class: 'msk-btn ghost mini' }, tr().unpinMessage)
        unpin.addEventListener('click', () => void pin(m, false).then(() => setTab('pinned')))
        body.append(el('div', { class: 'cp-item' }, el('div', { class: 'cb-meta' }, el('strong', {}, who(m.author)), el('time', {}, new Date(parseTime(m.at)).toLocaleString(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))), renderMessage(m.text, m.mentions.map(nameOf).filter(Boolean), true), unpin))
      }
    }
  }

  const drawRoomEmpty = () => {
    head.replaceChildren()
    tabsBar.replaceChildren()
    searchBar.hidden = true
    composeBox.hidden = true
    typingLine.textContent = ''
    body.replaceChildren(emptyState({ art: 'chat', title: tr().pickChatTitle, text: tr().pickChatText, actions: [Object.assign(el('button', { type: 'button', class: 'msk-btn' }, tr().newChat), { onclick: () => startNew() })] }))
  }

  // ------------------------------------------------------------------------------------------------- open a chat
  const closeRoom = () => {
    current = null
    msgs = []
    members = []
    more = false
    tab = 'chat'
    divider = 0
    status = 'connecting'
    wasLive = false
    typingOn = false
    root.setAttribute('data-view', 'list')
    drawList()
  }

  let readTimer: ReturnType<typeof setTimeout> | undefined
  const markRead = () => {
    clearTimeout(readTimer)
    readTimer = setTimeout(() => {
      if (!current || document.visibilityState !== 'visible') return
      void readNow(current)
    }, 500)
  }
  const readNow = async (id: string) => {
    try {
      await cmd('chats.mark_read', { chat: id })
      const c = chats.find((x) => x.id === id)
      if (c) {
        c.unread = 0
        c.mentions = 0
        c.marked_unread = false
        c.last_read_at = new Date().toISOString()
      }
      scheduleList()
      void announce(id, { t: 'read' })
    } catch {
      // not worth a message: the next opening reads again
    }
  }

  const loadMembers = async (id: string) => {
    const r = await cmd<Member[]>('chats.members', { chat: id })
    return r.map((m) => ({ ...m, last_read_at: m.last_read_at ?? null }))
  }
  const reloadMembers = async () => {
    if (!current) return
    try {
      const id = current
      const ms = await loadMembers(id)
      if (current === id) {
        members = ms
        drawMessages(false)
      }
    } catch {
      // the next hint or opening reads again
    }
  }

  const open = async (id: string, jump?: string) => {
    if (current !== id) {
      current = id
      msgs = []
      members = []
      more = false
        tab = 'chat'
        typingOn = false
      compose.reply(null)
      compose.edit(null)
    }
    found = null
    query = ''
    search.value = ''
    const c = currentChat()
    divider = c && c.unread > 0 ? parseTime(c.last_read_at) || 1 : 0
    root.setAttribute('data-view', 'room')
    composeBox.hidden = false
    typingLine.hidden = false
    searchBar.hidden = true
    syncChannels()
    pushState()
    drawHead()
    drawList()
    compose.disable(null)
    body.replaceChildren(skeleton({ kind: 'rows', count: 5 }))
    loading = true
    try {
      const r = await cmd<{ messages: ChatMsg[]; more: boolean; members: Member[] }>('chats.messages', { chat: id, limit: PAGE })
      if (current !== id) return
      msgs = r.messages
      more = r.more
      members = r.members
    } catch (e) {
      if (current === id) {
        const code = (e as { code?: string })?.code
        body.replaceChildren(emptyState({ art: 'chat', title: code === 'not_a_member' ? tr().notMember : tr().chatLoadFailed + errText(e, msk.context?.lang) }))
        composeBox.hidden = true
      }
      return
    } finally {
      loading = false
    }
    drawHead()
    drawMessages(true)
    if (jump) await jumpTo(jump)
    if (c && (c.unread > 0 || c.marked_unread)) markRead()
    compose.focus()
    // a name that changed is brought up to date in the chats of the person
    if (myName) void cmd('chats.touch', { name: myName }).catch(() => undefined)
  }

  const loadOlder = async () => {
    if (!current || !msgs.length) return
    const first = msgs[0]!
    try {
      const r = await cmd<{ messages: ChatMsg[]; more: boolean }>('chats.messages', { chat: current, before: first.at, limit: PAGE })
      for (const m of r.messages) msgs = upsert(msgs, m)
      more = r.more
      drawMessages(false)
    } catch (e) {
      fail(e)
    }
  }

  const jumpTo = async (id: string) => {
    for (let i = 0; i < 6 && !msgs.some((m) => m.id === id); i++) {
      if (!more) break
      await loadOlder()
    }
    if (tab !== 'chat') await setTab('chat')
    const node = body.querySelector(`[data-id="${CSS.escape(id)}"]`)
    if (node) {
      node.scrollIntoView({ block: 'center' })
      node.classList.add('flash')
      setTimeout(() => node.classList.remove('flash'), 1600)
    }
  }

  /** What a hint of the channel says changed: the message is read again from the data. */
  const refreshMessage = async (id: string, kind: string) => {
    if (!current) return
    const chat = current
    try {
      const m = await cmd<ChatMsg>('chats.message', { id })
      if (current !== chat) return
      msgs = upsert(msgs, m)
      drawMessages(false)
      if (m.author !== me && kind === 'msg' && document.visibilityState === 'visible') markRead()
    } catch {
      msgs = msgs.filter((x) => x.id !== id)
      drawMessages(false)
    }
  }

  // ----------------------------------------------------------------------------------------------------- actions
  const setTyping = (on: boolean) => {
    typingOn = on
    pushState()
  }

  const send = async (m: Outgoing) => {
    if (!current) return
    const chat = current
    try {
      if (m.attachments.length) await shareFiles(m.attachments)
      const row = await cmd<ChatMsg>('chats.send', { chat, text: m.text, reply_to: m.replyTo, importance: m.importance, attachments: m.attachments })
      msgs = upsert(msgs, row)
        divider = 0
      drawMessages(true)
      void announce(chat, { t: 'msg', id: row.id })
      overviewSoon()
    } catch (e) {
      toast(tr().sendFailed + errText(e, msk.context?.lang), { tone: 'err', ms: 6000 })
      throw e
    }
  }

  const saveEdit = async (id: string, text: string) => {
    try {
      await msk.crud('chat_messages').update(id, { text })
      const m = await cmd<ChatMsg>('chats.message', { id })
      msgs = upsert(msgs, m)
      drawMessages(false)
      if (current) void announce(current, { t: 'edit', id })
    } catch (e) {
      fail(e)
      throw e
    }
  }

  const react = async (m: ChatMsg, emoji: string) => {
    try {
      const row = await cmd<ChatMsg>('chats.react', { id: m.id, emoji })
      msgs = upsert(msgs, row)
      drawMessages(false)
      if (current) void announce(current, { t: 'react', id: m.id })
    } catch (e) {
      fail(e)
    }
  }

  const pin = async (m: ChatMsg, pinned: boolean) => {
    try {
      const row = await cmd<ChatMsg>('chats.pin_message', { id: m.id, pinned })
      msgs = upsert(msgs, row)
      drawMessages(false)
      if (current) void announce(current, { t: 'pin', id: m.id })
    } catch (e) {
      fail(e)
    }
  }

  const removeMessage = async (m: ChatMsg) => {
    if (!(await confirmDialog({ title: tr().delete, text: tr().deleteConfirm, ok: tr().delete, cancel: tr().cancel, danger: true }))) return
    try {
      const row = await cmd<ChatMsg>('chats.delete_message', { id: m.id })
      msgs = upsert(msgs, row)
      drawMessages(false)
      if (current) void announce(current, { t: 'del', id: m.id })
    } catch (e) {
      fail(e)
    }
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast(tr().copied, { tone: 'ok', ms: 1500 })
    } catch {
      // the browser refused: nothing to say
    }
  }

  // --------------------------------------------------------------------------------------------- new chat, people
  const startNew = () => {
    newChatDialog(msk, tr, me, async (people, name) => {
      if (people.length === 1) {
        const r = await cmd<{ id: string }>('chats.open_direct', { user: people[0]!.id, name: people[0]!.name, my_name: myName })
        await loadOverview()
        await open(r.id)
      } else {
        const r = await cmd<{ id: string }>('chats.create_group', { name, users: people, my_name: myName })
        await loadOverview()
        await open(r.id)
      }
    })
  }

  const showAdd = () => {
    const c = currentChat()
    if (!c) return
    addPeopleDialog(msk, tr, c, me, async (people, history) => {
      if (c.kind === 'direct') {
        // Teams makes a new group of the two people and the newcomers
        const users = [...c.members.filter((m) => m.id !== me), ...people].map((p) => ({ id: p.id, name: p.name }))
        const r = await cmd<{ id: string }>('chats.create_group', { name: '', users, my_name: myName })
        await loadOverview()
        return void (await open(r.id))
      }
      const h: HistoryChoice = history
      await cmd('chats.add_members', { chat: c.id, users: people, history: h === 'week' ? new Date(Date.now() - 7 * 86_400_000).toISOString() : h })
      void announce(c.id, { t: 'members' })
      await loadOverview()
      await reloadMembers()
      await refreshTail()
    })
  }

  const refreshTail = async () => {
    if (!current) return
    try {
      const r = await cmd<{ messages: ChatMsg[] }>('chats.messages', { chat: current, limit: 5 })
      for (const m of r.messages) msgs = upsert(msgs, m)
      drawMessages(true)
    } catch {
      // the next hint reads again
    }
  }

  const showPeople = () => {
    const c = currentChat()
    if (!c) return
    void loadMembers(c.id)
      .then((ms) => {
        members = ms
        peopleDialog(tr, c, ms, me, onlineState, {
          remove: async (m) => {
            await cmd('chats.remove_member', { chat: c.id, user: m.id })
            void announce(c.id, { t: 'members' })
            await loadOverview()
            await refreshTail()
          },
          rename: async (name) => {
            await cmd('chats.rename', { chat: c.id, name })
            void announce(c.id, { t: 'members' })
            await loadOverview()
            await refreshTail()
          },
          add: () => showAdd(),
        })
      })
      .catch(fail)
  }

  head.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    if (t.closest('.cr-titles h2') && currentChat()?.kind === 'group') showPeople()
  })

  // --------------------------------------------------------------------------------------------------- search
  const runSearch = async (q: string, chat?: string) => {
    try {
      return await cmd<{ id: string; chat: string; at: string; text: string; author_name: string }[]>('chats.search', { q, ...(chat ? { chat } : {}) })
    } catch (e) {
      fail(e)
      return []
    }
  }
  search.addEventListener('input', () => {
    query = search.value
    if (!query.trim()) found = null
    drawList()
  })
  search.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && search.value.trim().length >= 2) {
      found = await runSearch(search.value.trim())
      drawList()
    } else if (e.key === 'Escape') {
      search.value = ''
      query = ''
      found = null
      drawList()
    }
  })

  const toggleSearch = () => {
    if (!searchBar.hidden) {
      searchBar.hidden = true
        if (tab === 'chat') drawMessages(false)
      return
    }
    searchBar.hidden = false
    searchBar.replaceChildren()
    const input = el('input', { type: 'search', class: 'cr-searchinput', 'aria-label': tr().searchMessages, placeholder: tr().searchMessages })
    const close = el('button', { type: 'button', class: 'cr-act', 'aria-label': tr().searchClose, title: tr().searchClose }, '×')
    close.addEventListener('click', toggleSearch)
    const results = el('div', { class: 'cr-hits' })
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Escape') return toggleSearch()
      if (e.key !== 'Enter' || input.value.trim().length < 2) return
      const r = await runSearch(input.value.trim(), current ?? undefined)
      results.replaceChildren()
      if (!r.length) results.append(el('p', { class: 'cl-none' }, tr().searchNone))
      for (const h of r) {
        const b = el('button', { type: 'button', class: 'cl-hit' }, el('span', { class: 'cl-line' }, el('strong', {}, h.author_name || tr().deletedAuthor), el('time', { class: 'cl-time' }, new Date(parseTime(h.at)).toLocaleDateString(lang, { day: 'numeric', month: 'short' }))), el('span', { class: 'cl-prev' }, h.text))
        b.addEventListener('click', () => {
          toggleSearch()
          void jumpTo(h.id)
        })
        results.append(b)
      }
    })
    searchBar.append(el('div', { class: 'cr-searchrow' }, input, close), results)
    input.focus()
  }

  // ------------------------------------------------------------------------------------------------------ files
  /** The folder of Documents that holds what people attach from their devices: made at the first upload. */
  const chatFolder = async () => {
    if (docsFolder) return docsFolder
    const root_ = await msk.files.list(null, DOCS)
    const hit = root_.entries.find((e) => e.is_dir && e.name === 'Chat')
    docsFolder = hit ? hit.id : (await msk.files.mkdir('Chat', null, DOCS)).id
    return docsFolder
  }

  const uploadFile = async (f: File): Promise<Attachment> => {
    const parent = await chatFolder()
    const e = await msk.files.uploadLarge(f, f.name, { parent, source: DOCS })
    return { id: e.id, name: e.name, size: e.size, mime: e.mime ?? '' }
  }

  /** The files a person attaches belong to them; the people of the chat get read access, so that everyone can open them. */
  const shareFiles = async (files: Attachment[]) => {
    const c = currentChat()
    if (!c) return
    for (const a of files) {
      for (const m of c.members.filter((x) => x.id !== me).slice(0, 50)) {
        try {
          await msk.setShare(a.id, { principal: { type: 'user', id: m.id, name: m.name }, level: 'read' })
        } catch (e) {
          toast(sub(tr().shareFailed, { n: a.name }) + errText(e, msk.context?.lang), { tone: 'err', ms: 6000 })
          return
        }
      }
    }
  }

  const openFile = async (a: Attachment) => {
    try {
      const url = await msk.files.url(a.id, false, DOCS)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      fail(e)
    }
  }

  // ------------------------------------------------------------------------------------------------------ calls
  const startCall = async (audio: boolean) => {
    if (!current) return
    const chat = current
    try {
      const m = await cmd<ChatMsg>('chats.call_start', { chat, audio_only: audio })
      msgs = upsert(msgs, m)
      drawMessages(true)
      void announce(chat, { t: 'call', id: m.id })
      overviewSoon()
      await joinCall(m)
    } catch (e) {
      toast(tr().callFailed + errText(e, msk.context?.lang), { tone: 'err', ms: 6000 })
    }
  }

  const joinCall = async (m: ChatMsg) => {
    const engine = engineFor(m.meta.engine)
    const room_ = String(m.meta.room ?? '')
    if (!engine || !room_) return toast(tr().callFailed, { tone: 'err', ms: 6000 })
    if (call) await leaveCall()
    try {
      await cmd('chats.call_join', { id: m.id })
    } catch (e) {
      return fail(e)
    }
    const frame = el('iframe', {
      class: 'ccall-frame',
      title: tr().callTitle,
      src: engine.embedUrl(room_, myName, { audioOnly: m.meta.audio_only === true, lang }),
      allow: engine.allow,
      referrerpolicy: 'no-referrer',
    })
    const leaveBtn = el('button', { type: 'button', class: 'msk-btn danger mini' }, tr().leaveCall)
    const big = el('button', { type: 'button', class: 'cr-act', 'aria-label': '⤢', title: '⤢' }, '⤢')
    const box = el('div', { class: 'ccall', role: 'dialog', 'aria-label': tr().callTitle }, el('div', { class: 'ccall-bar' }, el('strong', {}, engine.label), el('span', { class: 'cc-grow' }), big, leaveBtn), frame, el('p', { class: 'ccall-note' }, tr().callPrivacy))
    big.addEventListener('click', () => box.classList.toggle('big'))
    leaveBtn.addEventListener('click', () => void leaveCall())
    root.append(box)
    // a call stays open while the person stays: a beat every minute tells the others so (a closed tab stops it)
    const timer = setInterval(() => void cmd('chats.call_join', { id: m.id }).catch(() => undefined), 60_000)
    call = { msg: m, frame, timer, box }
  }

  const leaveCall = async () => {
    const c = call
    if (!c) return
    call = null
    clearInterval(c.timer)
    c.box.remove()
    try {
      const m = await cmd<ChatMsg>('chats.call_leave', { id: c.msg.id })
      if (current === m.chat) {
        msgs = upsert(msgs, m)
        drawMessages(false)
      }
      void announce(m.chat, { t: 'call', id: m.id })
    } catch {
      // the call ends by itself when nobody beats any more
    }
  }
  window.addEventListener('pagehide', () => {
    if (call) void leaveCall()
  })

  // ------------------------------------------------------------------------------------------------------ start
  const retitle = () => {
    title.textContent = tr().title
    newBtn.setAttribute('aria-label', tr().newChat)
    newBtn.title = tr().newChat
    search.setAttribute('aria-label', tr().searchChats)
    search.placeholder = tr().searchChats
    chanLink.textContent = '# ' + tr().channels
    drawFilters()
    drawList()
    if (current) {
      drawHead()
      drawMessages(false)
    } else drawRoomEmpty()
    compose.retitle()
  }
  newBtn.addEventListener('click', startNew)
  chanLink.addEventListener('click', () => void msk.open((msk.plugin?.id ?? 'com.mosaikit.chat'), 'channels'))
  msk.onContext((ctx) => {
    if (langOf(ctx.lang) === lang) return
    lang = langOf(ctx.lang)
    retitle()
  })
  document.addEventListener('visibilitychange', () => {
    away = false
    if (document.visibilityState === 'visible') {
      pushState()
      void loadOverview()
      if (current) markRead()
    } else {
      setTimeout(() => {
        if (document.visibilityState === 'hidden') {
          away = true
          pushState()
        }
      }, AWAY_AFTER)
    }
  })
  window.addEventListener('focus', () => void loadOverview())
  setInterval(() => void loadOverview(), 60_000)

  retitle()
  drawRoomEmpty()
  void msk.loading(loadOverview()).then(() => {
    const at = msk.at ?? ''
    const m = /^chat\/([0-9a-f-]{36})$/i.exec(at)
    if (m && chats.some((c) => c.id === m[1])) void open(m[1]!.toLowerCase())
  })
}
