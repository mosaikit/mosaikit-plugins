// The box where the person writes to the assistant, in the style of the chat of Claude: a rounded card with the text on top, the files
// attached as chips, and at the bottom a «+» to attach, the microphone and the send button; the chooser of the model sits under the
// card. It is made once and kept (the chat is drawn again at every message, what the person is writing must stay).
import { el, toast, type AssistantAttachment } from '@mosaikit/plugin-api'
import { readFile, speechLang, type Picked } from './files.ts'
import type { Texts } from './texts.ts'

export const MAX_FILES = 4

const NS = 'http://www.w3.org/2000/svg'
/** A 24x24 line icon from Lucide, drawn from its paths. */
function icon(paths: string[], size = 18): SVGElement {
  const s = document.createElementNS(NS, 'svg')
  s.setAttribute('viewBox', '0 0 24 24')
  s.setAttribute('width', String(size))
  s.setAttribute('height', String(size))
  s.setAttribute('fill', 'none')
  s.setAttribute('stroke', 'currentColor')
  s.setAttribute('stroke-width', '2')
  s.setAttribute('stroke-linecap', 'round')
  s.setAttribute('stroke-linejoin', 'round')
  s.setAttribute('aria-hidden', 'true')
  for (const d of paths) {
    const p = document.createElementNS(NS, 'path')
    p.setAttribute('d', d)
    s.append(p)
  }
  return s
}
const PLUS = ['M5 12h14', 'M12 5v14']
const MIC = ['M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z', 'M19 10v2a7 7 0 0 1-14 0v-2', 'M12 19v3']
const ARROW_UP = ['m5 12 7-7 7 7', 'M12 19V5']
const CLIP = ['m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48']
const CLOSE = ['M18 6 6 18', 'm6 6 12 12']
const STOP = ['M7 7h10v10H7z']

export interface ComposerOptions {
  tr: () => Texts
  lang: () => string
  /** the person sends: the text (maybe empty when there are files) and the files */
  onSend: (text: string, files: AssistantAttachment[]) => void
  /** the person pressed stop while the assistant was working */
  onStop: () => void
  /** the model chooser, built by the page (it knows the models), shown in the bar of the card */
  chooser: () => HTMLElement | null
}

export interface Composer {
  el: HTMLElement
  setBusy(busy: boolean): void
  focus(): void
  /** the chooser may change (the models arrive late) */
  refreshChooser(): void
}

const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1 << 20 ? `${Math.round(n / 1024)} KB` : `${(n / (1 << 20)).toFixed(1)} MB`)

type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

function recognitionClass(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function createComposer(o: ComposerOptions): Composer {
  const tr = o.tr
  let busy = false
  let files: AssistantAttachment[] = []

  const box = el('textarea', { class: 'as-input', rows: '1', 'data-testid': 'assistant-input' }) as HTMLTextAreaElement
  const chips = el('div', { class: 'as-files', 'data-testid': 'assistant-files' })
  const picker = el('input', {
    type: 'file',
    multiple: '',
    hidden: '',
    accept: 'image/png,image/jpeg,image/webp,image/gif,application/pdf,text/*,.md,.csv,.json,.xml,.yml,.yaml,.log,.txt',
    'data-testid': 'assistant-file-input',
  }) as HTMLInputElement
  const add = el('button', { class: 'as-icon', type: 'button', 'data-testid': 'assistant-attach' }, icon(PLUS)) as HTMLButtonElement
  const mic = el('button', { class: 'as-icon', type: 'button', 'aria-pressed': 'false', 'data-testid': 'assistant-mic' }, icon(MIC)) as HTMLButtonElement
  const send = el('button', { class: 'as-send', type: 'button', 'data-testid': 'assistant-send' }, icon(ARROW_UP, 16)) as HTMLButtonElement
  // compact: one line of text with the microphone at its end, then a thin bar with «+», the model and the send button
  const top = el('div', { class: 'as-top' }, box, mic)
  const slot = el('span', { class: 'as-slot' })
  const bar = el('div', { class: 'as-bar' }, add, slot, el('span', { class: 'as-spacer' }), send)
  const card = el('div', { class: 'as-card' }, chips, top, bar, picker)
  const root = el('div', { class: 'as-composer' }, card)

  // ------------------------------------------------------------ the text
  const fit = () => {
    box.style.height = 'auto'
    box.style.height = `${Math.min(box.scrollHeight, 180)}px`
  }
  const refresh = () => {
    box.placeholder = tr().placeholder
    box.setAttribute('aria-label', tr().placeholder)
    add.title = add.ariaLabel = tr().attach
    // while the assistant works the send button is the stop button
    send.title = send.ariaLabel = busy ? tr().stop : tr().send
    send.classList.toggle('stop', busy)
    send.replaceChildren(busy ? icon(STOP, 14) : icon(ARROW_UP, 16))
    send.dataset.testid = busy ? 'assistant-stop' : 'assistant-send'
    send.setAttribute('data-testid', busy ? 'assistant-stop' : 'assistant-send')
    mic.title = mic.ariaLabel = recognitionClass() ? (listening ? tr().micStop : tr().mic) : tr().micUnsupported
    mic.disabled = busy || !recognitionClass()
    add.disabled = busy
    box.disabled = busy
    send.disabled = !busy && !box.value.trim() && !files.length
    mic.hidden = !recognitionClass()
  }

  // ------------------------------------------------------------ the files
  const drawChips = () => {
    chips.replaceChildren()
    chips.hidden = !files.length
    files.forEach((f, i) => {
      const x = el('button', { class: 'as-chipx', type: 'button', 'aria-label': `${tr().removeFile}: ${f.name}`, title: tr().removeFile }, icon(CLOSE, 12))
      x.addEventListener('click', () => {
        files = files.filter((_, j) => j !== i)
        drawChips()
        refresh()
      })
      chips.append(el('span', { class: 'as-filechip', 'data-testid': 'assistant-file' }, icon(CLIP, 13), el('span', { class: 'as-filename' }, f.name), el('span', { class: 'as-filesize' }, fmtSize(f.size ?? 0)), x))
    })
  }

  async function take(list: FileList | File[]) {
    for (const file of Array.from(list)) {
      if (files.length >= MAX_FILES) {
        toast(tr().tooManyFiles.replace('{n}', String(MAX_FILES)), { tone: 'err' })
        break
      }
      const r: Picked = await readFile(file)
      if (!r.ok) {
        toast(r.reason === 'type' ? tr().fileType.replace('{n}', file.name) : tr().fileTooBig.replace('{n}', file.name).replace('{max}', r.limit), { tone: 'err', ms: 6000 })
        continue
      }
      files.push(r.file)
    }
    drawChips()
    refresh()
  }

  add.addEventListener('click', () => picker.click())
  picker.addEventListener('change', () => {
    if (picker.files) void take(picker.files)
    picker.value = ''
  })
  // drag a file onto the card, or paste an image
  card.addEventListener('dragover', (e) => {
    e.preventDefault()
    card.classList.add('drop')
  })
  card.addEventListener('dragleave', () => card.classList.remove('drop'))
  card.addEventListener('drop', (e) => {
    e.preventDefault()
    card.classList.remove('drop')
    if (!busy && e.dataTransfer?.files.length) void take(e.dataTransfer.files)
  })
  box.addEventListener('paste', (e) => {
    const pasted = Array.from(e.clipboardData?.files ?? [])
    if (pasted.length && !busy) {
      e.preventDefault()
      void take(pasted)
    }
  })

  // ------------------------------------------------------------ sending
  const submit = () => {
    const text = box.value.trim()
    if (busy || (!text && !files.length)) return
    const sent = files
    box.value = ''
    files = []
    drawChips()
    fit()
    refresh()
    o.onSend(text, sent)
  }
  send.addEventListener('click', () => (busy ? o.onStop() : submit()))
  box.addEventListener('input', () => {
    fit()
    refresh()
  })
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      submit()
    }
  })

  // ------------------------------------------------------------ the voice: the speech recognition of the browser
  let listening = false
  let rec: SpeechRecognitionLike | null = null
  const stopListening = () => {
    listening = false
    mic.setAttribute('aria-pressed', 'false')
    mic.classList.remove('live')
    refresh()
  }
  mic.addEventListener('click', () => {
    const Rec = recognitionClass()
    if (!Rec || busy) return
    if (listening) {
      rec?.stop()
      return
    }
    const r = new Rec()
    rec = r
    r.lang = speechLang(o.lang())
    r.interimResults = true
    r.continuous = false
    const before = box.value
    let heard = ''
    r.onresult = (e) => {
      let text = ''
      for (let i = 0; i < e.results.length; i++) text += e.results[i]![0]!.transcript
      heard = text.trim()
      box.value = `${before}${before && heard ? ' ' : ''}${heard}`
      fit()
      refresh()
    }
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast(tr().micDenied, { tone: 'err', ms: 8000 })
      else if (e.error === 'network') toast(tr().micNetwork, { tone: 'err', ms: 6000 })
      else if (e.error !== 'no-speech' && e.error !== 'aborted') toast(`${tr().micFailed}: ${e.error}`, { tone: 'err' })
    }
    r.onend = () => {
      stopListening()
      // what was said is the command: it is sent as it is (a change is still confirmed by the person in a dialog of the platform)
      if (heard) submit()
    }
    try {
      r.start()
      listening = true
      mic.setAttribute('aria-pressed', 'true')
      mic.classList.add('live')
      refresh()
    } catch {
      stopListening()
    }
  })

  const refreshChooser = () => {
    slot.replaceChildren()
    const c = o.chooser()
    if (c) slot.append(c)
    slot.hidden = !c
  }
  drawChips()
  refresh()
  refreshChooser()

  return {
    el: root,
    setBusy(b) {
      busy = b
      refresh()
    },
    focus: () => box.focus(),
    refreshChooser,
  }
}
