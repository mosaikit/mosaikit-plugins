// UI of the Tasks plugin: a list with status chips and a board (Overdue, Open, Done), both next to the detail panel
// (English by default; Italian and Spanish follow the language of the host).
import '@mosaikit/plugin-api/style.css'
import './tasks.css'
import { chip, connect, el, errText, mountCrud, type CrudView, type ItemCtx, type Msk, type Row } from '@mosaikit/plugin-api'

const TEXTS = {
  en: { title: 'Tasks', newLabel: '＋ New task', list: 'List', board: 'Board', overdue: 'Overdue', open: 'Open', done: 'Done', due: 'Due {d}', mark: 'Mark as done: {t}', reopen: 'Reopen: {t}', done_on: 'Done {d}', emptyTitle: 'No tasks yet', emptyText: 'Add what has to be done and when.', failed: 'Could not start the UI of the plugin: ' },
  it: { title: 'Attività', newLabel: '＋ Nuova attività', list: 'Elenco', board: 'Bacheca', overdue: 'In ritardo', open: 'Aperte', done: 'Fatte', due: 'Scade {d}', mark: 'Segna come fatta: {t}', reopen: 'Riapri: {t}', done_on: 'Fatta il {d}', emptyTitle: 'Ancora nessuna attività', emptyText: 'Aggiungi cosa c’è da fare e per quando.', failed: 'Impossibile avviare la UI del plugin: ' },
  es: { title: 'Tareas', newLabel: '＋ Nueva tarea', list: 'Lista', board: 'Tablero', overdue: 'Atrasadas', open: 'Abiertas', done: 'Hechas', due: 'Vence {d}', mark: 'Marcar como hecha: {t}', reopen: 'Reabrir: {t}', done_on: 'Hecha el {d}', emptyTitle: 'Todavía no hay tareas', emptyText: 'Añade lo que hay que hacer y para cuándo.', failed: 'No se pudo iniciar la interfaz del plugin: ' },
}
type L = keyof typeof TEXTS

const langOf = (l: string | undefined): L => {
  const x = (l ?? navigator.language).toLowerCase()
  return x.startsWith('it') ? 'it' : x.startsWith('es') ? 'es' : 'en'
}
const app = document.getElementById('app')!

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const isDone = (r: Row) => !!r.values.done
const isOverdue = (r: Row) => !isDone(r) && typeof r.values.due === 'string' && r.values.due !== '' && r.values.due < today()
const fmt = (iso: string, lang: L) => {
  const d = new Date(iso + 'T00:00:00')
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(lang, { day: 'numeric', month: 'short' })
}
const sub = (t: string, vars: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '')

function mount(msk: Msk) {
  let lang = langOf(msk.context?.lang)
  const tr = () => TEXTS[lang]
  const item = (c: ItemCtx) => {
    const title = c.text('title')
    const done = isDone(c.row)
    const box = el('input', { type: 'checkbox', class: 'tcheck', 'aria-label': sub(done ? tr().reopen : tr().mark, { t: title }) })
    box.checked = done
    box.disabled = !c.canWrite
    box.addEventListener('change', () => void c.update({ done: box.checked }))
    const meta = el('div', { class: 'tmeta' })
    const prio = String(c.value('priority') ?? '')
    if (prio) meta.append(chip(c.text('priority'), prio === 'high' ? 'err' : prio === 'medium' ? 'acc' : ''))
    const due = String(c.value('due') ?? '')
    if (done && c.value('completed_on')) meta.append(el('span', { class: 'tdue' }, sub(tr().done_on, { d: fmt(String(c.value('completed_on')), lang) })))
    else if (due) meta.append(el('span', { class: 'tdue' + (isOverdue(c.row) ? ' late' : '') }, sub(tr().due, { d: fmt(due, lang) })))
    return el('div', { class: 'task' + (done ? ' done' : '') }, box, el('div', { class: 'tbody' }, el('div', { class: 'ttitle' }, title), meta))
  }
  const views = (): CrudView[] => [
    { key: 'list', label: tr().list, kind: 'list', item },
    {
      key: 'board',
      label: tr().board,
      kind: 'board',
      item,
      columns: [
        { key: 'overdue', label: (l) => TEXTS[langOf(l)].overdue, match: isOverdue },
        { key: 'open', label: (l) => TEXTS[langOf(l)].open, match: (r) => !isDone(r) && !isOverdue(r) },
        { key: 'done', label: (l) => TEXTS[langOf(l)].done, match: isDone },
      ],
    },
  ]
  const open = () => mountCrud(app, msk, 'tasks', { title: tr().title, newLabel: tr().newLabel, empty: { art: 'tasks', title: tr().emptyTitle, text: tr().emptyText }, columns: ['title', 'due', 'priority', 'done'], views: views() })
  let off = open()
  // the view follows the host for its own texts; the title and the button are ours
  msk.onContext((ctx) => {
    if (langOf(ctx.lang) === lang) return
    lang = langOf(ctx.lang)
    off()
    off = open()
  })
}

connect()
  .then(mount)
  .catch((e) => {
    app.textContent = TEXTS[langOf(undefined)].failed + errText(e)
  })
