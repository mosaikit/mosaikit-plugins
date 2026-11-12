// A small Markdown toolbar for the text field of a note (bold, italic, heading, list, check list, quote, code, link) and the
// download of a text. The helpers that change the text come from the kit of the plugin API.
import { el, prefixLines, wrapSelection } from '@mosaikit/plugin-api'

export interface MdLabels {
  bold: string
  italic: string
  heading: string
  list: string
  checks: string
  quote: string
  code: string
  link: string
  group: string
}

/** The toolbar for `ta`: every button changes the text where the selection is and keeps the focus in the field. Ctrl/Cmd+B and +I too. */
export function mdToolbar(ta: HTMLTextAreaElement, L: MdLabels): HTMLElement {
  const apply = (r: { text: string; start: number; end: number }) => {
    ta.value = r.text
    ta.setSelectionRange(r.start, r.end)
    ta.focus()
    ta.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const sel = () => [ta.selectionStart ?? 0, ta.selectionEnd ?? 0] as const
  const tools: [string, string, () => void][] = [
    ['B', L.bold, () => apply(wrapSelection(ta.value, ...sel(), '**', '**', L.bold.toLowerCase()))],
    ['I', L.italic, () => apply(wrapSelection(ta.value, ...sel(), '*', '*', L.italic.toLowerCase()))],
    ['H', L.heading, () => apply(prefixLines(ta.value, ...sel(), '## '))],
    ['•', L.list, () => apply(prefixLines(ta.value, ...sel(), '- '))],
    ['☑', L.checks, () => apply(prefixLines(ta.value, ...sel(), '- [ ] '))],
    ['❝', L.quote, () => apply(prefixLines(ta.value, ...sel(), '> '))],
    ['</>', L.code, () => apply(wrapSelection(ta.value, ...sel(), '`', '`', L.code.toLowerCase()))],
    ['🔗', L.link, () => apply(wrapSelection(ta.value, ...sel(), '[', '](https://)', L.link.toLowerCase()))],
  ]
  const bar = el('div', { class: 'msk-rt-bar nbar', role: 'toolbar', 'aria-label': L.group })
  for (const [glyph, name, run] of tools) {
    const b = el('button', { type: 'button', class: 'msk-rt-btn', title: name, 'aria-label': name }, glyph)
    b.addEventListener('click', run)
    bar.append(b)
  }
  ta.addEventListener('keydown', (ev) => {
    if (!(ev.ctrlKey || ev.metaKey)) return
    const k = ev.key.toLowerCase()
    if (k === 'b' || k === 'i') {
      ev.preventDefault()
      tools[k === 'b' ? 0 : 1]![2]()
    }
  })
  return bar
}

/** Saves `text` as a file with the browser's download. */
export function saveText(text: string, name: string) {
  const u = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
  const a = el('a', { href: u, download: name, style: 'display:none' })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(u), 10000)
}
