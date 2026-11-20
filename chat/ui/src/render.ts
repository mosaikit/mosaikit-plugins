// Draws the text of a chat message: the Markdown of the plugin kit, plus what a chat adds to it (`++underline++`,
// `~~strike~~`, the names that were mentioned). Everything is built with text nodes, so nothing the sender wrote is ever
// read as HTML.
import { renderMarkdown } from '@mosaikit/plugin-api'
import { mentionPieces } from './chats-logic.ts'

const MARKS = /(\+\+[^+\n]+\+\+|~~[^~\n]+~~)/g
const SKIP = new Set(['CODE', 'PRE', 'A'])

function textNodes(root: Node, out: Text[] = []): Text[] {
  for (const n of Array.from(root.childNodes)) {
    if (n.nodeType === 3) out.push(n as Text)
    else if (n.nodeType === 1 && !SKIP.has((n as Element).tagName)) textNodes(n, out)
  }
  return out
}

function piece(text: string, names: string[]): Node[] {
  return mentionPieces(text, names).map((p) => {
    if (p.t === 'text') return document.createTextNode(p.v)
    const m = document.createElement('span')
    m.className = 'cm-mention'
    m.textContent = p.v
    return m
  })
}

/** The message as DOM: `names` are the people mentioned (they show in a mark), `everyone` marks `@everyone` too. */
export function renderMessage(text: string, names: string[], everyone = false): HTMLElement {
  const root = renderMarkdown(text)
  const wanted = everyone ? [...names, 'everyone'] : names
  for (const node of textNodes(root)) {
    const src = node.nodeValue ?? ''
    if (!src.includes('++') && !src.includes('~~') && !(src.includes('@') && wanted.length)) continue
    const frag = document.createDocumentFragment()
    for (const part of src.split(MARKS)) {
      if (!part) continue
      if (part.length > 4 && part.startsWith('++') && part.endsWith('++')) {
        const u = document.createElement('u')
        u.append(...piece(part.slice(2, -2), wanted))
        frag.append(u)
      } else if (part.length > 4 && part.startsWith('~~') && part.endsWith('~~')) {
        const s = document.createElement('s')
        s.append(...piece(part.slice(2, -2), wanted))
        frag.append(s)
      } else frag.append(...piece(part, wanted))
    }
    node.replaceWith(frag)
  }
  return root
}
