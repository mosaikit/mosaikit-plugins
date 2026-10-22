// The "Review" tab of a note: whether it is reviewed and by whom, a review with a comment, the history of
// the reviews. The host shows this page inside the detail of the note, in a frame of its own, and gives it
// the note (`msk.tab`); the values are the ones of this extension on the note, kept by the kernel.
import '@mosaikit/plugin-api/style.css'
import './tab.css'
import { connect, errText, type Msk, type Row, type TabClient, type Values } from '@mosaikit/plugin-api'
import { addReview, parseHistory } from './history.ts'

const TEXTS = {
  en: {
    title: 'Review of «{name}»',
    reviewedBy: 'Reviewed by {name}',
    notReviewed: 'Not reviewed yet',
    comment: 'Comment (optional)',
    review: 'Mark as reviewed',
    unreview: 'Mark as not reviewed',
    history: 'History of the reviews',
    noHistory: 'No review yet.',
    reviewed: 'reviewed',
    reopened: 'marked as not reviewed',
    readOnly: 'You can see the reviews; only who can edit the note reviews it.',
    notTab: 'This page opens as the "Review" tab of a note.',
    saved: 'Saved',
  },
  it: {
    title: 'Revisione di «{name}»',
    reviewedBy: 'Revisionata da {name}',
    notReviewed: 'Non ancora revisionata',
    comment: 'Commento (facoltativo)',
    review: 'Segna come revisionata',
    unreview: 'Segna come non revisionata',
    history: 'Storia delle revisioni',
    noHistory: 'Nessuna revisione.',
    reviewed: 'revisionata',
    reopened: 'segnata come non revisionata',
    readOnly: 'Puoi vedere le revisioni; solo chi può modificare la nota la revisiona.',
    notTab: 'Questa pagina si apre come scheda «Revisione» di una nota.',
    saved: 'Salvato',
  },
}
type Key = keyof (typeof TEXTS)['en']

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
    app.textContent = TEXTS.en.notTab
    return
  }
  const tab: TabClient = msk.tabClient()
  const canWrite = msk.tab.level === 'write' || msk.tab.level === 'manage'
  const lang = () => (msk.context?.lang === 'it' ? 'it' : 'en')
  const tr = (k: Key, vars: Record<string, string> = {}) => TEXTS[lang()][k].replace(/\{(\w+)\}/g, (_, v: string) => vars[v] ?? '')
  const date = (iso: string) => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(lang() === 'it' ? 'it-IT' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  }
  let item: Row | null = null
  let values: Values = {}
  let msg = ''
  let error = false

  function render() {
    document.documentElement.lang = lang()
    const name = String(item?.values.title ?? '')
    const reviewed = values.reviewed === true
    const status = h('p', { class: 'status' + (reviewed ? ' ok' : '') }, reviewed ? tr('reviewedBy', { name: String(values.reviewed_by ?? '') }) : tr('notReviewed'))
    const parts: Node[] = [h('h1', {}, tr('title', { name })), status]
    if (canWrite) {
      const comment = h('textarea', { id: 'comment', rows: '2', maxlength: '500' })
      const label = h('label', { for: 'comment' }, tr('comment'))
      const save = (ok: boolean) => async () => {
        try {
          const by = msk.user?.name ?? ''
          values = await tab.set({
            reviewed: ok,
            reviewed_by: ok ? by : null,
            history: addReview(values.history, { at: new Date().toISOString(), by, reviewed: ok, note: comment.value }),
          })
          msg = tr('saved')
          error = false
        } catch (e) {
          msg = errText(e, msk.context?.lang)
          error = true
        }
        render()
      }
      const primary = h('button', { type: 'button', class: 'msk-btn' }, tr('review'))
      primary.addEventListener('click', save(true))
      const secondary = h('button', { type: 'button', class: 'msk-btn ghost' }, tr('unreview'))
      secondary.addEventListener('click', save(false))
      parts.push(h('div', { class: 'msk-field' }, label, comment), h('div', { class: 'msk-actions' }, primary, ...(reviewed ? [secondary] : [])))
    } else parts.push(h('p', { class: 'hint' }, tr('readOnly')))
    parts.push(h('p', { class: 'msk-msg' + (error ? ' err' : ''), role: 'status' }, msg))
    const reviews = parseHistory(values.history).reverse()
    parts.push(
      h('h2', {}, tr('history')),
      reviews.length
        ? h(
            'ol',
            { class: 'history' },
            ...reviews.map((r) =>
              h('li', {}, h('span', { class: 'when' }, date(r.at)), ' · ', h('b', {}, r.by), ' — ', r.reviewed ? tr('reviewed') : tr('reopened'), ...(r.note ? [h('q', {}, r.note)] : [])),
            ),
          )
        : h('p', { class: 'hint' }, tr('noHistory')),
    )
    app.replaceChildren(...parts)
  }

  void Promise.all([tab.item(), tab.values()])
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
