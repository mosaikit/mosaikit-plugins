// Which view of the app is shown: the chats of Chat 2.0 or the channels of the earlier versions. The place the page is opened
// at wins (a notification, a link, a search result, `msk.open(plugin, at)`), then the choice the person made last time.
export type View = 'chats' | 'channels'
export const VIEWS: readonly View[] = ['chats', 'channels']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const parseView = (s: string | null | undefined): View | null => (s === 'chats' || s === 'channels' ? s : null)

/** The view a place points to: «channels» (the old place of the channels page) and the id of a channel (old notifications)
 *  are the channels; «chats» and `chat/<id>` are the chats; anything else points to none. */
export function viewAt(at: string | undefined): View | null {
  const a = at ?? ''
  if (a === 'channels' || UUID.test(a)) return 'channels'
  if (a === 'chats' || a.startsWith('chat/')) return 'chats'
  return null
}

/** The view to open: the place first, then what the person chose, then the chats. */
export const initialView = (at: string | undefined, saved: string | null | undefined): View => viewAt(at) ?? parseView(saved) ?? 'chats'

/** The view an arrow key moves to from `from` (the two views wrap around); null for any other key. */
export function viewByKey(key: string, from: View): View | null {
  const i = VIEWS.indexOf(from)
  if (key === 'ArrowRight' || key === 'ArrowDown') return VIEWS[(i + 1) % VIEWS.length]!
  if (key === 'ArrowLeft' || key === 'ArrowUp') return VIEWS[(i + VIEWS.length - 1) % VIEWS.length]!
  if (key === 'Home') return VIEWS[0]!
  if (key === 'End') return VIEWS[VIEWS.length - 1]!
  return null
}

/** The key of the choice, per person: two people on one browser do not share it. */
export const viewKey = (user: string | undefined) => `mosaikit.chat.view.${user ?? ''}`

export function loadView(user: string | undefined): View | null {
  try {
    return parseView(localStorage.getItem(viewKey(user)))
  } catch {
    return null
  }
}

export function saveView(user: string | undefined, v: View): void {
  try {
    localStorage.setItem(viewKey(user), v)
  } catch {
    /* private window or blocked storage: the choice is just not remembered */
  }
}
