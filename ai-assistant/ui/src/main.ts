// UI of the AI Assistant: a chat with the assistant of the kernel, the saved chats (create, rename, resume, delete) and the
// access tokens for outside AI clients. The kernel runs the tools as the person; a tool that writes comes back as a proposal and
// the HOST (not this page) asks the person to confirm it, so nothing here can run a change on its own.
import '@mosaikit/plugin-api/style.css'
import './assistant.css'
import {
  confirmDialog,
  connect,
  dialog,
  el,
  emptyState,
  errText,
  renderMarkdown,
  toast,
  type AssistantSettings,
  type AssistantAttachment,
  type AssistantModels,
  type AssistantStatus,
  type AssistantTool,
  type AssistantToolCall,
  type Msk,
  type Row,
} from '@mosaikit/plugin-api'
import { desktopConfig, dropFileData, fmtDuration, fmtStamp, parseMessages, rowsOf, serialize, titleOf, toolLabel, toolMessage, unanswered, type Stamped } from './chat.ts'
import { createComposer } from './composer.ts'
import { rowsOf as previewRows, verbOf } from './preview.ts'
import { bindTexts, langOf, sub, TEXTS } from './texts.ts'

const app = document.getElementById('app')!

type View = 'chat' | 'history' | 'settings'

interface Current {
  id: string | null
  title: string
  messages: Stamped[]
}

function mount(msk: Msk) {
  document.documentElement.classList.add('msk-fill')
  bindTexts(msk)
  const lang = () => langOf(msk.context?.lang)
  const tr = () => TEXTS[lang()]!
  const chats = msk.crud('chats')
  let status: AssistantStatus = { available: false, provider: null, model: null, source: null, mcp_url: '' }
  let tools = new Map<string, AssistantTool>()
  let models: AssistantModels = { default: '', models: [], all: false }
  // the model the person prefers, kept in this browser; none: the default of the platform
  const MODEL_KEY = 'msk.assistant.model'
  const preferred = (): string | undefined => {
    try {
      const m = localStorage.getItem(MODEL_KEY)
      return m && models.models.some((x) => x.id === m) ? m : undefined
    } catch {
      return undefined
    }
  }
  let saved: Row[] = []
  let current: Current = { id: null, title: '', messages: [] }
  let view: View = 'chat'
  let busy = false
  // a frame may not take the focus before the person did something in it
  let acted = false
  window.addEventListener('pointerdown', () => (acted = true), { once: true })
  window.addEventListener('keydown', () => (acted = true), { once: true })
  // the text the assistant is writing now, shown as it grows
  let live = ''
  let liveEl: HTMLElement | null = null
  const fail = (e: unknown, prefix = '') => toast(prefix + errText(e, msk.context?.lang), { tone: 'err', ms: 6000 })

  const root = el('div', { class: 'as' })
  app.replaceChildren(root)

  // ------------------------------------------------------------ persistence
  async function load() {
    try {
      const r = await chats.list({ sort: 'updated_at', dir: 'desc' })
      saved = r.rows
    } catch (e) {
      fail(e, tr().loadFailed)
    }
  }

  async function persist() {
    if (!current.messages.length) return
    const values = { title: current.title || titleOf(current.messages, tr().newChat), messages: serialize(current.messages) }
    try {
      if (current.id) await chats.update(current.id, values)
      else {
        const row = await chats.create(values)
        current.id = row.id
      }
      current.title = values.title
      await load()
    } catch (e) {
      fail(e)
    }
  }

  const open = (row: Row) => {
    current = { id: row.id, title: String(row.values.title ?? ''), messages: parseMessages(row.values.messages) }
    view = 'chat'
    render()
  }
  const fresh = () => {
    current = { id: null, title: '', messages: [] }
    view = 'chat'
    render()
  }

  // ------------------------------------------------------------ the loop
  async function ask() {
    busy = true
    live = ''
    render()
    const base = current.messages.length
    const ctl = new AbortController()
    abort = ctl
    // when the question left, and when the last message arrived: every message knows how long its step took
    const t0 = Date.now()
    let mark = t0
    const tick = setInterval(() => {
      if (liveEl && !live) liveEl.textContent = `${tr().thinking} ${fmtDuration(Date.now() - t0, lang())}`
    }, 1000)
    try {
      // every message is put in the chat as it is complete; the text in between is shown as it is written
      const res = await msk.assistant.chatStream(
        current.messages,
        (e) => {
        if (e.type === 'delta') {
          live += e.text
          if (liveEl) liveEl.textContent = live
          else render()
        } else if (e.type === 'message') {
          live = ''
          const now = Date.now()
          const m: Stamped = { ...e.message, at: new Date(now).toISOString() }
          // the last answer says how long the whole reply took; a step, how long it took
          m.ms = m.role === 'assistant' && !m.tool_calls?.length ? now - t0 : now - mark
          mark = now
          current.messages.push(m)
          render()
        }
      },
        { model: preferred(), signal: ctl.signal },
      )
      if (res.cancelled) {
        // what was written so far stays, said to be stopped; a tool asked for and not run is closed
        const now = Date.now()
        current.messages.push({ role: 'assistant', content: live.trim() ? `${live.trim()} …` : '', at: new Date(now).toISOString(), ms: now - t0, stopped: true })
        for (const c of unanswered(current.messages.slice(base))) current.messages.push(toolMessage(c, { error: 'The person stopped the reply.' }))
      }
      await persist()
    } catch (e) {
      // a loop that stopped half way: what it asked for and did not get is closed, so it does not look like a proposal
      for (const c of unanswered(current.messages.slice(base))) current.messages.push(toolMessage(c, { error: 'The assistant stopped before this ran.' }))
      if (current.messages.length > base) await persist()
      fail(e, tr().sendFailed)
    }
    clearInterval(tick)
    abort = null
    dropFileData(current.messages)
    busy = false
    live = ''
    render()
  }

  async function send(text: string, files: AssistantAttachment[] = []) {
    const t = text.trim()
    if ((!t && !files.length) || busy) return
    // a change nobody confirmed is closed before the new question
    for (const c of unanswered(current.messages)) current.messages.push(toolMessage(c, { error: 'The person did not confirm it.' }))
    current.messages.push({ role: 'user', content: t, at: new Date().toISOString(), ...(files.length ? { attachments: files } : {}) })
    await ask()
  }

  /** The person reviews a proposal: the host shows the dialog; once every proposal has an answer the assistant goes on. */
  async function decide(call: AssistantToolCall, run: boolean) {
    if (busy) return
    busy = true
    render()
    try {
      if (!run) current.messages.push(toolMessage(call, { error: tr().declined }))
      else {
        const r = await msk.assistant.call(call.name, call.arguments)
        current.messages.push(toolMessage(call, 'cancelled' in r ? { error: tr().declined } : { result: r.result }))
      }
    } catch (e) {
      current.messages.push(toolMessage(call, { error: errText(e, msk.context?.lang) }))
    }
    await persist()
    busy = false
    if (unanswered(current.messages).length === 0) await ask()
    else render()
  }

  // the chooser of the model, in the bar of the composer: only when there is a choice
  function chooser(): HTMLElement | null {
    if (!status.available || models.models.length < 2) return null
    const pick = el('select', { class: 'as-model', 'aria-label': tr().model, title: tr().model, 'data-testid': 'assistant-model' }) as HTMLSelectElement
    for (const m of models.models) pick.append(el('option', { value: m.id }, m.id === models.default ? `${m.label} (${tr().modelDefault})` : m.label))
    pick.value = preferred() ?? models.default
    pick.addEventListener('change', () => {
      try {
        localStorage.setItem(MODEL_KEY, pick.value)
      } catch {
        /* the choice lasts until the page closes */
      }
    })
    return pick
  }
  // the reply being asked, to stop it
  let abort: AbortController | null = null
  const composer = createComposer({ tr, lang, onSend: (text, files) => void send(text, files), onStop: () => abort?.abort(), chooser })

  // ------------------------------------------------------------ the chat view
  /** The line under a bubble: the date and time, and how long the reply took. */
  const meta = (side: 'user' | 'bot', text: string) => el('div', { class: `as-meta ${side}`, 'data-testid': 'assistant-meta' }, text)

  function stepNode(call: AssistantToolCall, result: { ok: boolean; text: string } | null, waiting: boolean, ms?: number) {
    const state = waiting ? tr().toolWaiting : result ? (result.ok ? '' : tr().toolFailed) : tr().thinking
    const details = el('pre', { class: 'as-detail' }, JSON.stringify(call.arguments ?? {}, null, 2) + (result ? `\n→ ${result.text}`.slice(0, 1500) : ''))
    details.hidden = true
    const toggle = el('button', { class: 'as-link', type: 'button', 'aria-expanded': 'false' }, tr().show)
    toggle.addEventListener('click', () => {
      details.hidden = !details.hidden
      toggle.textContent = details.hidden ? tr().show : tr().hide
      toggle.setAttribute('aria-expanded', String(!details.hidden))
    })
    return el('div', { class: 'as-step' + (result && !result.ok ? ' err' : ''), 'data-testid': 'assistant-step' }, el('div', { class: 'as-stephead' }, el('span', { class: 'as-chip' }, `${tr().tool}: ${toolLabel(call.name)}`), ms !== undefined ? el('span', { class: 'as-meta' }, fmtDuration(ms, lang())) : '', state ? el('span', { class: 'as-state' }, state) : '', toggle), details)
  }

  function proposalNode(call: AssistantToolCall) {
    const t = tools.get(call.name)
    const run = el('button', { class: 'msk-btn', type: 'button', 'data-testid': 'assistant-run' }, tr().run)
    const no = el('button', { class: 'msk-btn ghost', type: 'button', 'data-testid': 'assistant-dismiss' }, tr().dismiss)
    run.addEventListener('click', () => void decide(call, true))
    no.addEventListener('click', () => void decide(call, false))
    run.disabled = no.disabled = busy
    // the change said in words: the app, what it does and «label: value» for each field, not the JSON of the call
    const short = call.name.split('__')[0] ?? ''
    const app = t?.app || (short ? short[0]!.toUpperCase() + short.slice(1) : '')
    const verb = (t?.verb as 'create' | 'update' | 'list' | undefined) || verbOf(call.name)
    const title = sub(verb === 'create' ? tr().createIn : verb === 'update' ? tr().changeIn : tr().runIn, { app })
    const fields = el('dl', { class: 'as-fields' })
    for (const r of previewRows(t, call.arguments, lang(), tr().yes, tr().no)) {
      fields.append(el('div', { class: 'as-field' }, el('dt', {}, r.label), el('dd', { class: r.long ? 'long' : '' }, r.value)))
    }
    const raw = el('pre', { class: 'as-detail' }, JSON.stringify(call.arguments ?? {}, null, 2))
    raw.hidden = true
    const rawToggle = el('button', { class: 'as-link', type: 'button', 'aria-expanded': 'false' }, tr().rawData)
    rawToggle.addEventListener('click', () => {
      raw.hidden = !raw.hidden
      rawToggle.setAttribute('aria-expanded', String(!raw.hidden))
    })
    return el(
      'div',
      { class: 'as-proposal', role: 'group', 'aria-label': tr().proposal, 'data-testid': 'assistant-proposal' },
      el('div', { class: 'as-prophead' }, el('span', { class: 'as-appchip' }, app), el('strong', {}, title)),
      t ? el('p', { class: 'as-lead' }, t.subject && verb === 'create' ? sub(tr().createLead, { subject: t.subject }) : t.subject && verb === 'update' ? sub(tr().changeLead, { subject: t.subject }) : t.description) : '',
      fields,
      el('div', { class: 'as-acts' }, run, no, rawToggle),
      raw,
    )
  }

  function chatView() {
    const log = el('div', { class: 'as-log', role: 'log', 'aria-live': 'polite' })
    const waiting = new Set(unanswered(current.messages).map((c) => c.id))
    if (!current.messages.length) {
      const box = emptyState({ art: 'chat', title: tr().emptyTitle, text: tr().emptyText })
      const sug = el('div', { class: 'as-suggest' })
      for (const s of [tr().s1, tr().s2, tr().s3, tr().s4]) {
        const b = el('button', { class: 'as-chipbtn', type: 'button' }, s)
        b.addEventListener('click', () => void send(s))
        sug.append(b)
      }
      log.append(box, sug)
    }
    const shownWaiting = new Set<string>()
    for (const r of rowsOf(current.messages)) {
      if (r.kind === 'user') {
        if (r.files?.length) log.append(el('div', { class: 'as-sent' }, ...r.files.map((f) => el('span', { class: 'as-filechip', 'data-testid': 'assistant-sent-file' }, f.name))))
        if (r.text) log.append(el('div', { class: 'as-msg user' }, r.text))
        log.append(meta('user', fmtStamp(r.at, lang())))
      }
      else if (r.kind === 'assistant') log.append(el('div', { class: 'as-msg bot' }, renderMarkdown(r.text)), meta('bot', [fmtStamp(r.at, lang()), r.stopped && r.ms !== undefined ? sub(tr().stopped, { t: fmtDuration(r.ms, lang()) }) : r.ms !== undefined ? fmtDuration(r.ms, lang()) : ''].filter(Boolean).join(' · ')))
      else if (r.kind === 'stopped') log.append(el('div', { class: 'as-msg bot as-stopped', 'data-testid': 'assistant-stopped' }, tr().stoppedShort), meta('bot', [fmtStamp(r.at, lang()), r.ms !== undefined ? sub(tr().stopped, { t: fmtDuration(r.ms, lang()) }) : ''].filter(Boolean).join(' · ')))
      else if (waiting.has(r.call.id)) {
        shownWaiting.add(r.call.id)
        log.append(proposalNode(r.call))
      } else log.append(stepNode(r.call, r.result, false, r.ms))
    }
    liveEl = null
    if (busy) {
      liveEl = el('div', { class: 'as-msg bot' + (live ? '' : ' as-busy'), 'aria-live': 'polite' }, live || tr().thinking)
      log.append(liveEl)
    }
    queueMicrotask(() => (log.scrollTop = log.scrollHeight))

    composer.setBusy(busy)
    queueMicrotask(() => !busy && acted && composer.focus())
    return [log, composer.el]
  }

  // ------------------------------------------------------------ the saved chats
  function historyView() {
    const list = el('ul', { class: 'as-list' })
    if (!saved.length) return [emptyState({ art: 'chat', title: tr().noChats })]
    for (const row of saved) {
      const title = String(row.values.title ?? '')
      const openBtn = el('button', { class: 'as-open', type: 'button', 'data-testid': 'assistant-chat' }, title)
      openBtn.addEventListener('click', () => open(row))
      const ren = el('button', { class: 'msk-btn ghost mini', type: 'button' }, tr().rename)
      const del = el('button', { class: 'msk-btn ghost mini danger-text', type: 'button' }, tr().remove)
      ren.addEventListener('click', () => rename(row))
      del.addEventListener('click', () => remove(row))
      list.append(el('li', { class: 'as-item' }, openBtn, el('span', { class: 'as-when' }, new Date(row.updated_at).toLocaleDateString(lang())), ren, del))
    }
    return [el('div', { class: 'as-body' }, list)]
  }

  function rename(row: Row) {
    const input = el('input', { class: 'msk-input', type: 'text', value: String(row.values.title ?? ''), maxlength: '120', 'aria-label': tr().renamePrompt }) as HTMLInputElement
    const ok = el('button', { class: 'msk-btn', type: 'button' }, tr().save)
    const no = el('button', { class: 'msk-btn ghost', type: 'button' }, tr().cancel)
    const d = dialog({ title: tr().renamePrompt, body: input, actions: [no, ok] })
    no.addEventListener('click', d.close)
    const go = async () => {
      const v = input.value.trim()
      if (!v) return
      try {
        await chats.update(row.id, { title: v })
        if (current.id === row.id) current.title = v
        await load()
        d.close()
        render()
      } catch (e) {
        fail(e)
      }
    }
    ok.addEventListener('click', () => void go())
    input.addEventListener('keydown', (e) => e.key === 'Enter' && void go())
    input.select()
  }

  async function remove(row: Row) {
    const title = String(row.values.title ?? '')
    if (!(await confirmDialog({ title: tr().removeTitle, text: sub(tr().removeText, { n: title }), ok: tr().remove, cancel: tr().cancel, danger: true }))) return
    try {
      await chats.remove(row.id)
      if (current.id === row.id) current = { id: null, title: '', messages: [] }
      await load()
      render()
    } catch (e) {
      fail(e)
    }
  }

  // ------------------------------------------------------------ tokens and the key of the tenant
  function settingsView() {
    const body = el('div', { class: 'as-body as-settings' })
    body.append(el('h2', {}, tr().tokensTitle), el('p', { class: 'as-dim' }, tr().tokensText))
    const url = status.mcp_url
    body.append(el('p', { class: 'as-dim' }, `${tr().tServer}: `), el('code', { class: 'as-code', 'data-testid': 'assistant-mcp-url' }, url), el('p', { class: 'as-dim' }, tr().tConnector))

    const name = el('input', { class: 'msk-input', type: 'text', maxlength: '80', placeholder: tr().tNamePlaceholder, 'aria-label': tr().tName, 'data-testid': 'assistant-token-name' }) as HTMLInputElement
    const write = el('input', { type: 'checkbox', 'data-testid': 'assistant-token-write' }) as HTMLInputElement
    const days = el('input', { class: 'msk-input', type: 'number', min: '1', max: '365', value: '90', 'aria-label': tr().tDays }) as HTMLInputElement
    const create = el('button', { class: 'msk-btn', type: 'button', 'data-testid': 'assistant-token-create' }, tr().tCreate)
    const issued = el('div', { class: 'as-issued', 'data-testid': 'assistant-token-issued' })
    const tokenList = el('ul', { class: 'as-list', 'data-testid': 'assistant-tokens' })
    body.append(
      el('div', { class: 'as-form' }, el('label', {}, tr().tName, name), el('label', { class: 'as-check' }, write, tr().tWrite), el('label', {}, tr().tDays, days), create),
      issued,
      tokenList,
    )

    const copy = async (text: string, b: HTMLButtonElement) => {
      try {
        await navigator.clipboard.writeText(text)
        b.textContent = tr().copied
      } catch {
        /* the text is selectable */
      }
    }
    const refresh = async () => {
      try {
        const tokens = await msk.assistant.tokens.list()
        tokenList.replaceChildren()
        if (!tokens.length) tokenList.append(el('li', { class: 'as-dim' }, tr().tNone))
        for (const t of tokens) {
          const d = (s: string) => new Date(s).toLocaleDateString(lang())
          const meta = [t.allow_write ? tr().tWrites : tr().tReadOnly, sub(tr().tCreated, { d: d(t.created_at) }), t.last_used_at ? sub(tr().tUsed, { d: d(t.last_used_at) }) : tr().tNeverUsed, t.expires_at ? sub(tr().tExpires, { d: d(t.expires_at) }) : ''].filter(Boolean).join(' · ')
          const revoke = el('button', { class: 'msk-btn ghost mini danger-text', type: 'button' }, tr().tRevoke)
          revoke.addEventListener('click', async () => {
            if (!(await confirmDialog({ title: tr().tRevokeTitle, text: sub(tr().tRevokeText, { n: t.name }), ok: tr().tRevoke, cancel: tr().cancel, danger: true }))) return
            try {
              await msk.assistant.tokens.revoke(t.id)
              await refresh()
            } catch (e) {
              fail(e)
            }
          })
          tokenList.append(el('li', { class: 'as-item' }, el('span', { class: 'as-open' }, el('strong', {}, t.name), el('span', { class: 'as-dim' }, ` ${meta}`)), revoke))
        }
      } catch (e) {
        fail(e)
      }
    }
    create.addEventListener('click', async () => {
      try {
        const t = await msk.assistant.tokens.create({ name: name.value.trim() || tr().tNamePlaceholder, allow_write: write.checked, days: Number(days.value) || 90 })
        const cfg = desktopConfig(url, t.token)
        const copyToken = el('button', { class: 'msk-btn ghost mini', type: 'button' }, tr().copy) as HTMLButtonElement
        const copyCfg = el('button', { class: 'msk-btn ghost mini', type: 'button' }, tr().copy) as HTMLButtonElement
        copyToken.addEventListener('click', () => void copy(t.token, copyToken))
        copyCfg.addEventListener('click', () => void copy(cfg, copyCfg))
        issued.replaceChildren(
          el('p', { class: 'as-warn' }, tr().tShownOnce),
          el('div', { class: 'as-row' }, el('code', { class: 'as-code', 'data-testid': 'assistant-token-value' }, t.token), copyToken),
          el('p', { class: 'as-dim' }, tr().tConfig),
          el('div', { class: 'as-row' }, el('pre', { class: 'as-detail' }, cfg), copyCfg),
        )
        name.value = ''
        await refresh()
      } catch (e) {
        fail(e, tr().tCreateFailed)
      }
    })
    void refresh()
    // the key of the tenant: the kernel answers only a Tenant Manager, and only when the Administrator allows it
    void keySection(body)
    return [body]
  }

  async function keySection(body: HTMLElement) {
    let s: AssistantSettings
    try {
      s = await msk.assistant.settings.get()
    } catch {
      return
    }
    if (!s.allow_byok) return
    const provider = el('select', { class: 'msk-input', 'aria-label': tr().kProvider }, el('option', { value: 'anthropic' }, 'Anthropic'), el('option', { value: 'openai' }, 'OpenAI')) as HTMLSelectElement
    provider.value = s.provider === 'openai' ? 'openai' : 'anthropic'
    const model = el('input', { class: 'msk-input', type: 'text', value: s.model, placeholder: 'claude-sonnet-5-5', 'aria-label': tr().kModel }) as HTMLInputElement
    const key = el('input', { class: 'msk-input', type: 'password', autocomplete: 'off', placeholder: s.has_key ? tr().kKeySaved : '', 'aria-label': tr().kKey }) as HTMLInputElement
    const save = el('button', { class: 'msk-btn', type: 'button' }, tr().kSave)
    const clear = el('button', { class: 'msk-btn ghost', type: 'button' }, tr().kClear)
    save.addEventListener('click', async () => {
      try {
        await msk.assistant.settings.set({ provider: provider.value, model: model.value.trim(), ...(key.value ? { api_key: key.value } : {}) })
        toast(tr().kSaved, { tone: 'ok' })
        key.value = ''
        status = await msk.assistant.status()
      } catch (e) {
        fail(e)
      }
    })
    clear.addEventListener('click', async () => {
      try {
        await msk.assistant.settings.clear()
        toast(tr().kCleared, { tone: 'ok' })
        status = await msk.assistant.status()
      } catch (e) {
        fail(e)
      }
    })
    body.append(el('h2', {}, tr().keyTitle), el('p', { class: 'as-dim' }, tr().keyText), el('div', { class: 'as-form' }, el('label', {}, tr().kProvider, provider), el('label', {}, tr().kModel, model), el('label', {}, tr().kKey, key), save, clear))
  }

  // ------------------------------------------------------------ the page
  function render() {
    const bar = el('header', { class: 'as-head' }, el('h1', {}, tr().title))
    const btn = (label: string, on: () => void, pressed = false, testid = '') => {
      const b = el('button', { class: 'msk-btn ghost mini', type: 'button', 'aria-pressed': String(pressed), ...(testid ? { 'data-testid': testid } : {}) }, label)
      b.addEventListener('click', on)
      return b
    }
    bar.append(
      btn(tr().newChat, fresh, false, 'assistant-new'),
      btn(tr().history, () => ((view = view === 'history' ? 'chat' : 'history'), render()), view === 'history', 'assistant-history'),
      btn(tr().settings, () => ((view = view === 'settings' ? 'chat' : 'settings'), render()), view === 'settings', 'assistant-settings'),
    )
    const parts: (Node | string)[] = [bar]
    if (!status.available) parts.push(el('div', { class: 'as-body' }, emptyState({ art: 'chat', title: tr().offTitle, text: tr().offText })))
    else if (view === 'history') parts.push(...historyView())
    else if (view === 'settings') parts.push(...settingsView())
    else parts.push(...chatView())
    root.replaceChildren(...parts)
  }

  msk.onContext(() => render())
  // Escape inside the frame closes the side panel of the shell (the key never reaches the host page)
  if (msk.at === 'panel') document.addEventListener('keydown', (e) => e.key === 'Escape' && !e.defaultPrevented && void msk.assistant.close().catch(() => {}))

  void (async () => {
    try {
      status = await msk.assistant.status()
    } catch {
      status = { available: false, provider: null, model: null, source: null, mcp_url: '' }
    }
    if (status.available) {
      try {
        tools = new Map((await msk.assistant.tools()).map((t) => [t.name, t]))
      } catch {
        /* the descriptions are a nicety */
      }
      try {
        models = await msk.assistant.models()
        composer.refreshChooser()
      } catch {
        /* the default model is used */
      }
      await load()
    }
    render()
  })()
}

connect()
  .then(mount)
  .catch((e) => {
    app.textContent = TEXTS[langOf(undefined)]!.failed + errText(e)
  })
