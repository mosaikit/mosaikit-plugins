import type { Msk } from '@mosaikit/plugin-api'
// The texts of the Tasks UI (English by default; Italian and Spanish follow the language of the host).
const en = {
  title: 'Tasks', newLabel: '＋ New task', list: 'List', board: 'Board', week: 'Week',
  overdue: 'Overdue', today: 'Today', week7: 'Next 7 days', later: 'Later', nodate: 'No date', open: 'Open', done: 'Done',
  due: 'Due {d}', mark: 'Mark as done: {t}', reopen: 'Reopen: {t}', done_on: 'Done {d}',
  emptyTitle: 'No tasks yet', emptyText: 'Add what has to be done and when: type it in the line above.',
  quickLabel: 'Quick add a task', quickPlaceholder: 'Add a task… e.g. Call Ana tomorrow !high #work @phone every week', add: 'Add',
  quickHint: 'Words understood: today, tomorrow, monday…, in 3 days, 2026-12-31, !high !low, #project, @label, every day / week / month',
  added: 'Added: {t}', addFailed: 'Could not add the task: ',
  description: 'Description', descPlaceholder: 'Notes, links… Use “- [ ] step” for a check list.', noDescription: 'No description.',
  labels: 'Labels', labelsPlaceholder: 'Add a label…', removeLabel: 'Remove label',
  write: 'Write', preview: 'Preview', bold: 'Bold', italic: 'Italic', heading: 'Heading', bullets: 'List', checks: 'Check list', quote: 'Quote', code: 'Code', link: 'Link', nothingToPreview: 'Nothing to preview',
  progress: '{d} of {n} done', colEmpty: 'Nothing here', moved: '{title} moved to {column}',
  failed: 'Could not start the UI of the plugin: ',
}
export type Texts = typeof en
export type L = string

const it: Texts = {
  title: 'Attività', newLabel: '＋ Nuova attività', list: 'Elenco', board: 'Bacheca', week: 'Settimana',
  overdue: 'In ritardo', today: 'Oggi', week7: 'Prossimi 7 giorni', later: 'Più avanti', nodate: 'Senza data', open: 'Aperte', done: 'Fatte',
  due: 'Scade {d}', mark: 'Segna come fatta: {t}', reopen: 'Riapri: {t}', done_on: 'Fatta il {d}',
  emptyTitle: 'Ancora nessuna attività', emptyText: 'Aggiungi cosa c’è da fare e per quando: scrivilo nella riga qui sopra.',
  quickLabel: 'Aggiungi subito un’attività', quickPlaceholder: 'Aggiungi… es. Chiamare Ana domani !alta #lavoro @telefono ogni settimana', add: 'Aggiungi',
  quickHint: 'Parole capite: oggi, domani, lunedì…, tra 3 giorni, 2026-12-31, !alta !bassa, #progetto, @etichetta, ogni giorno / settimana / mese',
  added: 'Aggiunta: {t}', addFailed: 'Impossibile aggiungere l’attività: ',
  description: 'Descrizione', descPlaceholder: 'Note, link… Usa “- [ ] passo” per una lista di controllo.', noDescription: 'Nessuna descrizione.',
  labels: 'Etichette', labelsPlaceholder: 'Aggiungi un’etichetta…', removeLabel: 'Rimuovi etichetta',
  write: 'Scrivi', preview: 'Anteprima', bold: 'Grassetto', italic: 'Corsivo', heading: 'Titolo', bullets: 'Elenco', checks: 'Lista di controllo', quote: 'Citazione', code: 'Codice', link: 'Link', nothingToPreview: 'Niente da mostrare',
  progress: '{d} di {n} fatti', colEmpty: 'Niente qui', moved: '{title} spostata in {column}',
  failed: 'Impossibile avviare la UI del plugin: ',
}
const es: Texts = {
  title: 'Tareas', newLabel: '＋ Nueva tarea', list: 'Lista', board: 'Tablero', week: 'Semana',
  overdue: 'Atrasadas', today: 'Hoy', week7: 'Próximos 7 días', later: 'Más adelante', nodate: 'Sin fecha', open: 'Abiertas', done: 'Hechas',
  due: 'Vence {d}', mark: 'Marcar como hecha: {t}', reopen: 'Reabrir: {t}', done_on: 'Hecha el {d}',
  emptyTitle: 'Todavía no hay tareas', emptyText: 'Añade lo que hay que hacer y para cuándo: escríbelo en la línea de arriba.',
  quickLabel: 'Añadir una tarea al instante', quickPlaceholder: 'Añadir… p. ej. Llamar a Ana mañana !alta #trabajo @teléfono cada semana', add: 'Añadir',
  quickHint: 'Palabras entendidas: hoy, mañana, lunes…, en 3 días, 2026-12-31, !alta !baja, #proyecto, @etiqueta, cada día / semana / mes',
  added: 'Añadida: {t}', addFailed: 'No se pudo añadir la tarea: ',
  description: 'Descripción', descPlaceholder: 'Notas, enlaces… Usa “- [ ] paso” para una lista de control.', noDescription: 'Sin descripción.',
  labels: 'Etiquetas', labelsPlaceholder: 'Añadir una etiqueta…', removeLabel: 'Quitar etiqueta',
  write: 'Escribir', preview: 'Vista previa', bold: 'Negrita', italic: 'Cursiva', heading: 'Título', bullets: 'Lista', checks: 'Lista de control', quote: 'Cita', code: 'Código', link: 'Enlace', nothingToPreview: 'Nada que mostrar',
  progress: '{d} de {n} hechos', colEmpty: 'Nada aquí', moved: '{title} movida a {column}',
  failed: 'No se pudo iniciar la interfaz del plugin: ',
}
// Page texts: English, Italian and Spanish are the tables above. The other languages come from the language plugins
// (`lang/ui/<plugin id>.json`, English phrase → translation, read through `msk.t`), once `bindTexts` has run; the English
// phrase is shown when a language has none. Without a host (a public page) the tables are used as they are.
let host: Msk | undefined
type Tree = string | { [k: string]: Tree }
/** Connects the tables to the host: `TEXTS[code]` then reads `msk.t` for the languages that are not in the tables. */
export function bindTexts(msk: Msk) {
  host = msk
}
let built: { code: string; texts: unknown; value: Texts } | undefined
function translated(code: string, msk: Msk): Texts {
  const texts = msk.context?.texts
  if (built && built.code === code && built.texts === texts) return built.value
  const tx = (v: Tree): Tree => (typeof v === 'string' ? msk.t(v) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, tx(x)])))
  built = { code, texts, value: tx(en as unknown as Tree) as unknown as Texts }
  return built.value
}
const tables: Record<string, Texts> = { en, it, es }
export const TEXTS = new Proxy(tables, {
  get: (t, code) => (typeof code !== 'string' ? undefined : host && !(code in t) ? translated(code, host) : (t[code] ?? en)),
}) as Record<string, Texts>

/** The code of the language (`es`, `ar`…), `en` when none is known. */
export const langOf = (l: string | undefined): L => ((l ?? (typeof navigator === 'undefined' ? '' : navigator.language)).toLowerCase().split('-')[0] || 'en')
export const sub = (t: string, vars: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '')
