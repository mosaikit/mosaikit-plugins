// UI of the Chat plugin. One app, two views switched from the top of its left column: the chats of Chat 2.0 (the replica of
// the Chat section of Teams) and the channels of the earlier versions, untouched. The page opens at a place: «chats» (the
// default, and `chat/<id>` from a notification) shows the chats; «channels» (or the id of a channel, as old notifications
// have it) shows the channels; with no place the page opens on the view the person used last. A view is built when it is
// first shown and then kept (its live channels and its unread counts go on in the background).
import '@mosaikit/plugin-api/style.css'
import './chat.css'
import './chats.css'
import { connect, errText } from '@mosaikit/plugin-api'
import { mountChannels } from './channels.ts'
import { mountChats } from './chats.ts'
import { bindTexts, langOf, TEXTS } from './texts.ts'
import { initialView, loadView, saveView, VIEWS, type View } from './views-logic.ts'
import { viewSwitch, type ViewSwitch } from './views.ts'

const app = document.getElementById('app')!

connect()
  .then((msk) => {
    bindTexts(msk)
    document.documentElement.classList.add('msk-fill')
    let lang = langOf(msk.context?.lang)
    const labels = () => ({ chats: TEXTS[lang]!.filterChats, channels: TEXTS[lang]!.channels })
    const boxes = new Map<View, HTMLElement>(VIEWS.map((v) => [v, document.createElement('div')]))
    const switches = new Map<View, ViewSwitch>()
    const mounted = new Set<View>()

    const show = (v: View, focus = false) => {
      if (!mounted.has(v)) {
        mounted.add(v)
        const nav = viewSwitch({ labels: labels(), group: TEXTS[lang]!.viewsLabel, value: v, onPick: (to) => show(to, true) })
        switches.set(v, nav)
        if (v === 'chats') mountChats(msk, boxes.get(v)!, { nav: nav.el })
        else mountChannels(msk, boxes.get(v)!, { nav: nav.el })
      }
      for (const [k, b] of boxes) b.hidden = k !== v
      for (const s of switches.values()) s.set(v)
      saveView(msk.user?.id, v)
      // the tab that had the focus is in the view that is now hidden
      if (focus) switches.get(v)?.focus(v)
    }

    for (const [v, b] of boxes) {
      b.className = 'cv-view'
      b.dataset.view = v
      b.hidden = true
    }
    app.replaceChildren(...boxes.values())
    msk.onContext((ctx) => {
      if (langOf(ctx.lang) === lang) return
      lang = langOf(ctx.lang)
      for (const s of switches.values()) s.retitle(labels(), TEXTS[lang]!.viewsLabel)
    })
    show(initialView(msk.at, loadView(msk.user?.id)))
  })
  .catch((e) => {
    app.textContent = TEXTS[langOf(undefined)]!.failed + errText(e)
  })
