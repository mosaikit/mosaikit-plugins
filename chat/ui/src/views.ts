// The switch at the top of the left column of the app: Chats | Channels. A tab list (arrows, Home and End move between the
// tabs and open the view), line icons of the set of the chat, colours from the tokens, so light and dark follow the shell.
import { el } from '@mosaikit/plugin-api'
import { icon } from './icons.ts'
import { VIEWS, viewByKey, type View } from './views-logic.ts'

export interface ViewSwitch {
  el: HTMLElement
  /** Marks the view that is shown (does not call `onPick`). */
  set: (v: View) => void
  /** Puts the focus on the tab of the view. */
  focus: (v: View) => void
  /** Names the tabs again (language change). */
  retitle: (labels: Record<View, string>, group: string) => void
}

export function viewSwitch(opts: { labels: Record<View, string>; group: string; value: View; onPick: (v: View) => void }): ViewSwitch {
  const tabs = new Map<View, HTMLButtonElement>()
  const names = new Map<View, HTMLElement>()
  const root = el('div', { class: 'cv-switch', role: 'tablist', 'aria-label': opts.group })
  let value = opts.value
  const set = (v: View) => {
    value = v
    for (const [k, b] of tabs) {
      b.setAttribute('aria-selected', String(k === v))
      b.tabIndex = k === v ? 0 : -1
    }
  }
  for (const v of VIEWS) {
    const name = el('span', { class: 'cv-name' }, opts.labels[v])
    const b = el('button', { type: 'button', class: 'cv-tab', role: 'tab', 'data-view': v }, icon(v === 'chats' ? 'messageCircle' : 'hash', 16), name)
    b.addEventListener('click', () => {
      if (v !== value) opts.onPick(v)
    })
    b.addEventListener('keydown', (e) => {
      const to = viewByKey(e.key, v)
      if (!to) return
      e.preventDefault()
      if (to !== value) opts.onPick(to)
      else tabs.get(to)?.focus()
    })
    tabs.set(v, b)
    names.set(v, name)
    root.append(b)
  }
  set(value)
  return {
    el: root,
    set,
    focus: (v) => tabs.get(v)?.focus(),
    retitle: (labels, group) => {
      root.setAttribute('aria-label', group)
      for (const v of VIEWS) names.get(v)!.textContent = labels[v]
    },
  }
}
