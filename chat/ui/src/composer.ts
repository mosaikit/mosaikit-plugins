// The compose box of a chat: a text area that keeps Markdown, a toolbar of formatting (Bold, Italic, Underline, Strikethrough,
// lists, quote, code, link), an emoji picker, the importance of the message, files to attach, @mention suggestions and the
// send button. It knows nothing of the data: the page gives it the people and what to do with a message.
import { avatar, el, menu, popover } from '@mosaikit/plugin-api'
import { applyFormat, EMOJI, insertAt, mentionAt, mentionChoices, sendsOnEnter, fileSize, type Attachment, type ChatMsg, type Format, type Member, type Person } from './chats-logic.ts'
import { snippet } from './logic.ts'
import { sub, type Texts } from './texts.ts'

export interface Outgoing {
  text: string
  importance: 'normal' | 'important' | 'urgent'
  attachments: Attachment[]
  replyTo: string
}

export interface ComposerOptions {
  tr: () => Texts
  me: string
  members: () => Member[]
  names: (id: string) => string
  group: () => boolean
  /** whether files can be attached (the plugin has the rights on Documents) */
  canAttach: boolean
  onSend: (m: Outgoing) => Promise<void>
  onSaveEdit: (id: string, text: string) => Promise<void>
  onTyping: (on: boolean) => void
  /** files picked on this device, put in Documents; resolves to the attachment */
  upload: (file: File) => Promise<Attachment>
  /** the dialog that picks files of Documents */
  pickFromDocs: () => Promise<Attachment[]>
}

export interface Composer {
  el: HTMLElement
  focus(): void
  reply(m: ChatMsg | null): void
  edit(m: ChatMsg | null): void
  disable(reason: string | null): void
  /** the texts changed (language) */
  retitle(): void
  /** the text now in the box, for tests and drafts */
  value(): string
}

const FORMATS: { f: Format; glyph: string; key: keyof Texts; shortcut?: string }[] = [
  { f: 'bold', glyph: 'B', key: 'bold', shortcut: 'b' },
  { f: 'italic', glyph: 'I', key: 'italic', shortcut: 'i' },
  { f: 'underline', glyph: 'U', key: 'underline', shortcut: 'u' },
  { f: 'strike', glyph: 'S', key: 'strike' },
  { f: 'bullets', glyph: '•', key: 'bullets' },
  { f: 'numbers', glyph: '1.', key: 'numbers' },
  { f: 'quote', glyph: '❝', key: 'quote' },
  { f: 'code', glyph: '</>', key: 'codeBtn' },
  { f: 'link', glyph: '🔗', key: 'linkBtn', shortcut: 'k' },
]

const TYPING_EVERY = 3000

export function composer(o: ComposerOptions): Composer {
  const tr = o.tr
  let replyTo: ChatMsg | null = null
  let editing: ChatMsg | null = null
  let importance: Outgoing['importance'] = 'normal'
  let attachments: Attachment[] = []
  let busy = 0
  let sending = false
  let lastTyping = 0
  let typingOff: ReturnType<typeof setTimeout> | undefined
  let suggestions: { list: Person[]; at: { q: string; from: number }; active: number } | null = null

  const bar = el('div', { class: 'cc-bar' })
  bar.hidden = true
  const chips = el('div', { class: 'cc-files' })
  chips.hidden = true
  const input = el('textarea', { class: 'cc-input', rows: '1', maxlength: '4000' })
  const pop = el('ul', { class: 'cc-mentions', role: 'listbox' })
  pop.hidden = true
  const fmtBar = el('div', { class: 'cc-fmt', role: 'toolbar' })
  fmtBar.hidden = true
  const send = el('button', { type: 'button', class: 'cc-send' }, '➤')
  const fmtBtn = el('button', { type: 'button', class: 'cc-tool', 'aria-pressed': 'false' }, 'Aa')
  const impBtn = el('button', { type: 'button', class: 'cc-tool' }, '❗')
  const emojiBtn = el('button', { type: 'button', class: 'cc-tool' }, '☺')
  const attachBtn = el('button', { type: 'button', class: 'cc-tool' }, '📎')
  attachBtn.hidden = !o.canAttach
  const file = el('input', { type: 'file', multiple: '', class: 'cc-hidden', tabindex: '-1', 'aria-hidden': 'true' })
  const tools = el('div', { class: 'cc-tools' }, fmtBtn, impBtn, emojiBtn, attachBtn, el('span', { class: 'cc-grow' }), send)
  const box = el('div', { class: 'cc-box' }, input, pop)
  const root = el('div', { class: 'cc' }, bar, fmtBar, box, chips, tools, file)

  const label = () => {
    input.setAttribute('aria-label', tr().composerPlaceholder)
    if (!input.disabled) input.placeholder = tr().composerPlaceholder
    send.setAttribute('aria-label', editing ? tr().save : tr().send)
    send.title = editing ? tr().save : tr().send
    fmtBtn.setAttribute('aria-label', tr().format)
    fmtBtn.title = tr().format
    impBtn.setAttribute('aria-label', tr().importance)
    impBtn.title = tr().importance
    emojiBtn.setAttribute('aria-label', tr().emoji)
    emojiBtn.title = tr().emoji
    attachBtn.setAttribute('aria-label', tr().attach)
    attachBtn.title = tr().attach
    fmtBar.setAttribute('aria-label', tr().format)
    for (const b of Array.from(fmtBar.children)) {
      const t = tr()[(b as HTMLElement).dataset.key as keyof Texts]
      b.setAttribute('aria-label', t)
      ;(b as HTMLElement).title = t
    }
  }

  // ------------------------------------------------------------------------------------------------------ formatting
  const grow = () => {
    input.style.height = 'auto'
    input.style.height = Math.min(input.scrollHeight, 180) + 'px'
  }
  const apply = (e: { text: string; start: number; end: number }) => {
    input.value = e.text
    input.setSelectionRange(e.start, e.end)
    input.focus()
    grow()
    changed()
  }
  const format = (f: Format) => apply(applyFormat(f, input.value, input.selectionStart ?? 0, input.selectionEnd ?? 0, tr()[FORMATS.find((x) => x.f === f)!.key]!.toLowerCase()))
  for (const f of FORMATS) {
    const b = el('button', { type: 'button', class: 'cc-fmtbtn', 'data-key': f.key }, f.glyph)
    b.addEventListener('click', () => format(f.f))
    fmtBar.append(b)
  }
  fmtBtn.addEventListener('click', () => {
    fmtBar.hidden = !fmtBar.hidden
    fmtBtn.setAttribute('aria-pressed', String(!fmtBar.hidden))
    input.focus()
  })

  emojiBtn.addEventListener('click', () => {
    const grid = el('div', { class: 'cc-emoji', role: 'listbox', 'aria-label': tr().emoji })
    const p = popover(emojiBtn, grid)
    for (const e of EMOJI) {
      const b = el('button', { type: 'button', class: 'cc-emojibtn', role: 'option', 'aria-label': e }, e)
      b.addEventListener('click', () => {
        p.close()
        apply(insertAt(input.value, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, e))
      })
      grid.append(b)
    }
  })

  const drawImportance = () => {
    impBtn.classList.toggle('on', importance !== 'normal')
    impBtn.textContent = importance === 'urgent' ? '‼' : '❗'
    impBtn.setAttribute('data-importance', importance)
  }
  impBtn.addEventListener('click', () =>
    menu(impBtn, [
      { label: tr().importanceNormal, onClick: () => ((importance = 'normal'), drawImportance()) },
      { label: '❗ ' + tr().importantLabel, onClick: () => ((importance = 'important'), drawImportance()) },
      { label: '‼ ' + tr().urgentLabel, onClick: () => ((importance = 'urgent'), drawImportance()) },
    ]),
  )

  // ------------------------------------------------------------------------------------------------------ attachments
  const drawFiles = () => {
    chips.replaceChildren()
    chips.hidden = !attachments.length && !busy
    for (const a of attachments) {
      const x = el('button', { type: 'button', class: 'cc-x', 'aria-label': sub(tr().removeFile, { n: a.name }) }, '×')
      x.addEventListener('click', () => {
        attachments = attachments.filter((f) => f.id !== a.id)
        drawFiles()
      })
      chips.append(el('span', { class: 'cc-chip' }, '📎 ', el('span', { class: 'cc-chipname' }, a.name), el('span', { class: 'cc-chipsize' }, a.size ? fileSize(a.size) : ''), x))
    }
    if (busy) chips.append(el('span', { class: 'cc-chip busy', role: 'status' }, sub(tr().uploading, { n: String(busy) })))
  }
  const add = (list: Attachment[]) => {
    for (const a of list) if (!attachments.some((f) => f.id === a.id) && attachments.length < 10) attachments.push(a)
    drawFiles()
  }
  const failed = (e: unknown, key: 'uploadFailed' | 'attachFailed') => {
    const m = tr()[key] + (e instanceof Error ? e.message : String(e))
    chips.append(el('span', { class: 'cc-chip err', role: 'alert' }, m))
    chips.hidden = false
  }
  attachBtn.addEventListener('click', () =>
    menu(attachBtn, [
      { label: tr().fromDevice, onClick: () => file.click() },
      {
        label: tr().fromDocs,
        onClick: () =>
          void o
            .pickFromDocs()
            .then(add)
            .catch((e) => failed(e, 'attachFailed')),
      },
    ]),
  )
  file.addEventListener('change', async () => {
    const picked = Array.from(file.files ?? [])
    file.value = ''
    for (const f of picked) {
      busy++
      drawFiles()
      try {
        add([await o.upload(f)])
      } catch (e) {
        failed(e, 'uploadFailed')
      } finally {
        busy--
        drawFiles()
      }
    }
  })

  // ------------------------------------------------------------------------------------------------------- mentions
  const hidePop = () => {
    suggestions = null
    pop.hidden = true
    pop.replaceChildren()
  }
  const choose = (p: Person) => {
    if (!suggestions) return
    const { from } = suggestions.at
    const end = input.selectionStart ?? input.value.length
    const name = p.id === '*' ? tr().mentionEveryone : p.name
    const e = insertAt(input.value, from, end, `@${name} `)
    hidePop()
    apply(e)
  }
  const drawPop = () => {
    pop.replaceChildren()
    if (!suggestions) return void (pop.hidden = true)
    pop.hidden = false
    pop.setAttribute('aria-label', tr().mentionList)
    suggestions.list.forEach((p, i) => {
      const b = el('button', { type: 'button', role: 'option', class: 'cc-mention' + (i === suggestions!.active ? ' on' : ''), 'aria-selected': String(i === suggestions!.active) }, avatar(p.name), el('span', {}, p.id === '*' ? tr().mentionEveryone : p.name))
      b.addEventListener('mousedown', (ev) => ev.preventDefault())
      b.addEventListener('click', () => choose(p))
      pop.append(el('li', {}, b))
    })
  }
  const suggest = () => {
    const at = mentionAt(input.value, input.selectionStart ?? 0)
    if (!at) return hidePop()
    const list = mentionChoices(o.members(), o.me, at.q, o.group(), tr().mentionEveryone)
    if (!list.length) return hidePop()
    suggestions = { list, at, active: 0 }
    drawPop()
  }

  // ---------------------------------------------------------------------------------------------------------- state
  const changed = () => {
    const now = Date.now()
    if (input.value.trim() && now - lastTyping > TYPING_EVERY) {
      lastTyping = now
      o.onTyping(true)
    }
    clearTimeout(typingOff)
    typingOff = setTimeout(() => {
      if (lastTyping) o.onTyping(false)
      lastTyping = 0
    }, 4000)
    suggest()
  }

  const drawBar = () => {
    bar.replaceChildren()
    bar.hidden = !replyTo && !editing
    const x = el('button', { type: 'button', class: 'cc-barx', 'aria-label': tr().cancel }, '×')
    x.addEventListener('click', () => (editing ? edit(null) : reply(null)))
    if (editing) bar.append(el('span', {}, '✎ ', tr().editingMessage, ' — ', snippet(editing.text, 60)), x)
    else if (replyTo) bar.append(el('span', {}, sub(tr().replyingTo, { n: o.names(replyTo.author) || tr().deletedAuthor }), ' — ', snippet(replyTo.text || tr().deletedMsg, 80)), x)
    label()
  }
  function reply(m: ChatMsg | null) {
    replyTo = m
    editing = null
    drawBar()
    if (m) input.focus()
  }
  function edit(m: ChatMsg | null) {
    editing = m
    replyTo = null
    if (m) input.value = m.text
    else input.value = ''
    grow()
    drawBar()
    if (m) input.focus()
  }

  const go = async () => {
    const text = input.value.trim()
    if (sending || busy || (!text && !attachments.length)) return
    sending = true
    send.disabled = true
    try {
      if (editing) {
        if (!text) return
        await o.onSaveEdit(editing.id, text)
        edit(null)
      } else {
        await o.onSend({ text, importance, attachments, replyTo: replyTo?.id ?? '' })
        input.value = ''
        attachments = []
        importance = 'normal'
        replyTo = null
        drawFiles()
        drawImportance()
        drawBar()
      }
      grow()
      hidePop()
      clearTimeout(typingOff)
      if (lastTyping) o.onTyping(false)
      lastTyping = 0
    } catch {
      // the page shows the reason; the text stays so that nothing is lost
    } finally {
      sending = false
      send.disabled = input.disabled
      input.focus()
    }
  }
  send.addEventListener('click', () => void go())
  input.addEventListener('input', () => {
    grow()
    changed()
  })
  input.addEventListener('click', suggest)
  input.addEventListener('keydown', (e) => {
    if (suggestions) {
      const n = suggestions.list.length
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        suggestions.active = (suggestions.active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n
        return drawPop()
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        return choose(suggestions.list[suggestions.active]!)
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        return hidePop()
      }
    }
    if (e.key === 'Escape' && (editing || replyTo)) {
      e.preventDefault()
      return editing ? edit(null) : reply(null)
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      const f = FORMATS.find((x) => x.shortcut === e.key.toLowerCase())
      if (f) {
        e.preventDefault()
        return format(f.f)
      }
    }
    if (sendsOnEnter(e)) {
      e.preventDefault()
      void go()
    }
  })
  input.addEventListener('blur', () => setTimeout(hidePop, 150))
  // a file dropped or pasted into the box is attached like one picked
  input.addEventListener('paste', (e) => {
    const files = Array.from(e.clipboardData?.files ?? [])
    if (!files.length || !o.canAttach) return
    e.preventDefault()
    const dt = new DataTransfer()
    files.forEach((f) => dt.items.add(f))
    file.files = dt.files
    file.dispatchEvent(new Event('change'))
  })

  label()
  drawImportance()
  return {
    el: root,
    focus: () => input.focus(),
    reply,
    edit,
    disable(reason) {
      input.disabled = !!reason
      send.disabled = !!reason
      for (const b of [fmtBtn, impBtn, emojiBtn, attachBtn]) b.disabled = !!reason
      input.placeholder = reason ?? tr().composerPlaceholder
    },
    retitle: () => {
      drawBar()
      label()
    },
    value: () => input.value,
  }
}
