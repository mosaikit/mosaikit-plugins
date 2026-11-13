// The "Review" tab of a note: whether it is reviewed and by whom, a review with a comment, the history of
// the reviews. The host shows this page inside the detail of the note, in a frame of its own, and gives it
// the note (`msk.tab`); the values are the ones of this extension on the note, kept by the kernel.
import '@mosaikit/plugin-api/style.css'
import './tab.css'
import { connect, errText, type Msk, type Row, type TabClient, type Values } from '@mosaikit/plugin-api'
import { addReview, parseHistory } from './history.ts'

// The key of a text is the English phrase; the other languages come from the language plugins
// (`lang/ui/com.mosaikit.note-review.json`, read through `msk.t`), Italian from this table.
const IT: Record<string, string> = {
  'Review of «{name}»': 'Revisione di «{name}»',
  'Reviewed by {name}': 'Revisionata da {name}',
  'Not reviewed yet': 'Non ancora revisionata',
  'Comment (optional)': 'Commento (facoltativo)',
  'Mark as reviewed': 'Segna come revisionata',
  'Mark as not reviewed': 'Segna come non revisionata',
  'History of the reviews': 'Storia delle revisioni',
  'No review yet.': 'Nessuna revisione.',
  reviewed: 'revisionata',
  'marked as not reviewed': 'segnata come non revisionata',
  'You can see the reviews; only who can edit the note reviews it.': 'Puoi vedere le revisioni; solo chi può modificare la nota la revisiona.',
  'This page opens as the "Review" tab of a note.': 'Questa pagina si apre come scheda «Revisione» di una nota.',
  Saved: 'Salvato',
}

const app = document.getElementById('app')!

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string)[]) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v
    else el.setAttribute(k, v)
  }
  el.append(...children)
  return el
}

function start(msk: Msk) {
  if (!msk.tab) {
    app.textContent = 'This page opens as the "Review" tab of a note.'
    return
  }
  msk.ownTexts({ it: IT })
  const tab: TabClient = msk.tabClient()
  const canWrite = msk.tab.level === 'write' || msk.tab.level === 'manage'
  const lang = () => msk.context?.lang ?? 'en'
  const tr = (phrase: string, vars: Record<string, string> = {}) => msk.t(phrase, vars)
  const date = (iso: string) => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(lang() === 'it' ? 'it-IT' : lang() === 'en' ? 'en-GB' : lang(), { dateStyle: 'medium', timeStyle: 'short' })
  }
  let item: Row | null = null
  let values: Values = {}
  let msg = ''
  let error = false

  function render() {
    document.documentElement.lang = lang()
    const name = String(item?.values.title ?? '')
    const reviewed = values.reviewed === true
    const status = h('p', { class: 'status' + (reviewed ? ' ok' : '') }, reviewed ? tr('Reviewed by {name}', { name: String(values.reviewed_by ?? '') }) : tr('Not reviewed yet'))
    const parts: Node[] = [h('h1', {}, tr('Review of «{name}»', { name })), status]
    if (canWrite) {
      const comment = h('textarea', { id: 'comment', rows: '2', maxlength: '500' })
      const label = h('label', { for: 'comment' }, tr('Comment (optional)'))
      const save = (ok: boolean) => async () => {
        try {
          const by = msk.user?.name ?? ''
          values = await tab.set({
            reviewed: ok,
            reviewed_by: ok ? by : null,
            history: addReview(values.history, { at: new Date().toISOString(), by, reviewed: ok, note: comment.value }),
          })
          msg = tr('Saved')
          error = false
        } catch (e) {
          msg = errText(e, msk.context?.lang)
          error = true
        }
        render()
      }
      const primary = h('button', { type: 'button', class: 'msk-btn' }, tr('Mark as reviewed'))
      primary.addEventListener('click', save(true))
      const secondary = h('button', { type: 'button', class: 'msk-btn ghost' }, tr('Mark as not reviewed'))
      secondary.addEventListener('click', save(false))
      parts.push(h('div', { class: 'msk-field' }, label, comment), h('div', { class: 'msk-actions' }, primary, ...(reviewed ? [secondary] : [])))
    } else parts.push(h('p', { class: 'hint' }, tr('You can see the reviews; only who can edit the note reviews it.')))
    parts.push(h('p', { class: 'msk-msg' + (error ? ' err' : ''), role: 'status' }, msg))
    const reviews = parseHistory(values.history).reverse()
    parts.push(
      h('h2', {}, tr('History of the reviews')),
      reviews.length
        ? h(
            'ol',
            { class: 'history' },
            ...reviews.map((r) =>
              h('li', {}, h('span', { class: 'when' }, date(r.at)), ' · ', h('b', {}, r.by), ' — ', r.reviewed ? tr('reviewed') : tr('marked as not reviewed'), ...(r.note ? [h('q', {}, r.note)] : [])),
            ),
          )
        : h('p', { class: 'hint' }, tr('No review yet.')),
    )
    app.replaceChildren(...parts)
  }

  void msk.loading(Promise.all([tab.item(), tab.values()]))
    .then(([i, v]) => {
      item = i
      values = v
      render()
    })
    .catch((e) => {
      msg = errText(e, msk.context?.lang)
      error = true
      render()
    })
  msk.onContext(render)
  tab.autoResize(document.documentElement)
}

connect()
  .then(start)
  .catch((e) => {
    app.textContent = errText(e)
  })
