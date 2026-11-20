// UI of the Chat plugin. The page opens at a place: «chats» (the default, and `chat/<id>` from a notification) shows the
// chats of Chat 2.0, the replica of the Chat section of Teams; «channels» (or the id of a channel, as old notifications
// have it) shows the channels of the earlier versions, untouched.
import '@mosaikit/plugin-api/style.css'
import './chat.css'
import './chats.css'
import { connect, errText } from '@mosaikit/plugin-api'
import { mountChannels } from './channels.ts'
import { mountChats } from './chats.ts'
import { bindTexts, langOf, TEXTS } from './texts.ts'

const app = document.getElementById('app')!
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

connect()
  .then((msk) => {
    bindTexts(msk)
    const at = msk.at ?? ''
    if (at === 'channels' || UUID.test(at)) mountChannels(msk, app)
    else mountChats(msk, app)
  })
  .catch((e) => {
    app.textContent = TEXTS[langOf(undefined)]!.failed + errText(e)
  })
