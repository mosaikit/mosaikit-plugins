import type { Msk } from '@mosaikit/plugin-api'
// The texts of the Dashboard UI (English by default; Italian and Spanish follow the language of the host).
// The texts of a widget come from the contribution of its plugin (`data.texts`), not from here.
const en = {
  title: 'Dashboard', board: 'Board', newBoard: '＋ New board', edit: 'Edit', share: 'Share…', remove: 'Delete', refresh: 'Refresh',
  defaultName: 'My dashboard', updated: 'Updated {t}',
  newTitle: 'New board', editTitle: 'Edit board', fName: 'Name', fColumns: 'Columns', fWidgets: 'Widgets',
  widgetsHelp: 'Tick the widgets the board shows and put them in order.',
  colAuto: 'Automatic', col2: '2 columns', col3: '3 columns',
  moveUp: 'Move up: {n}', moveDown: 'Move down: {n}',
  create: 'Create', save: 'Save', cancel: 'Cancel', close: 'Close',
  removeConfirm: 'Delete the board “{n}”?', needName: 'Write a name', saved: 'Board saved',
  emptyNoneTitle: 'No widgets yet', emptyNoneText: 'Apps add their widgets here by themselves: open tasks, notices to confirm, polls to vote, requests to decide. Turn on an app that offers one and it shows up.',
  emptyBoardTitle: 'This board is empty', emptyBoardText: 'Choose the widgets this board shows and put them in the order you like.', emptyBoardAction: 'Choose widgets',
  nothing: 'Nothing to show', unavailable: 'This widget is not available right now.', more: '＋{n} more',
  ok: 'OK', warn: 'Attention', err: 'Alert',
  failed: 'Could not start the UI of the plugin: ', loadFailed: 'Could not load the dashboard: ', widgetsFailed: 'Could not load the widgets: ',
}
export type Texts = typeof en
export type L = string

const it: Texts = {
  title: 'Dashboard', board: 'Bacheca', newBoard: '＋ Nuova bacheca', edit: 'Modifica', share: 'Condividi…', remove: 'Elimina', refresh: 'Aggiorna',
  defaultName: 'La mia dashboard', updated: 'Aggiornato {t}',
  newTitle: 'Nuova bacheca', editTitle: 'Modifica bacheca', fName: 'Nome', fColumns: 'Colonne', fWidgets: 'Widget',
  widgetsHelp: 'Spunta i widget che la bacheca mostra e mettili in ordine.',
  colAuto: 'Automatico', col2: '2 colonne', col3: '3 colonne',
  moveUp: 'Sposta su: {n}', moveDown: 'Sposta giù: {n}',
  create: 'Crea', save: 'Salva', cancel: 'Annulla', close: 'Chiudi',
  removeConfirm: 'Eliminare la bacheca “{n}”?', needName: 'Scrivi un nome', saved: 'Bacheca salvata',
  emptyNoneTitle: 'Ancora nessun widget', emptyNoneText: 'Le app aggiungono qui i loro widget da sole: attività aperte, avvisi da confermare, sondaggi da votare, richieste da decidere. Attiva un’app che ne offre uno e comparirà.',
  emptyBoardTitle: 'Questa bacheca è vuota', emptyBoardText: 'Scegli i widget che la bacheca mostra e mettili nell’ordine che preferisci.', emptyBoardAction: 'Scegli i widget',
  nothing: 'Niente da mostrare', unavailable: 'Questo widget al momento non è disponibile.', more: '＋{n} altri',
  ok: 'OK', warn: 'Attenzione', err: 'Allarme',
  failed: 'Impossibile avviare la UI del plugin: ', loadFailed: 'Impossibile caricare la dashboard: ', widgetsFailed: 'Impossibile caricare i widget: ',
}
const es: Texts = {
  title: 'Panel', board: 'Tablero', newBoard: '＋ Nuevo tablero', edit: 'Editar', share: 'Compartir…', remove: 'Eliminar', refresh: 'Actualizar',
  defaultName: 'Mi panel', updated: 'Actualizado {t}',
  newTitle: 'Nuevo tablero', editTitle: 'Editar tablero', fName: 'Nombre', fColumns: 'Columnas', fWidgets: 'Widgets',
  widgetsHelp: 'Marca los widgets que muestra el tablero y ponlos en orden.',
  colAuto: 'Automático', col2: '2 columnas', col3: '3 columnas',
  moveUp: 'Subir: {n}', moveDown: 'Bajar: {n}',
  create: 'Crear', save: 'Guardar', cancel: 'Cancelar', close: 'Cerrar',
  removeConfirm: '¿Eliminar el tablero “{n}”?', needName: 'Escribe un nombre', saved: 'Tablero guardado',
  emptyNoneTitle: 'Todavía no hay widgets', emptyNoneText: 'Las apps añaden aquí sus widgets por sí solas: tareas abiertas, avisos por confirmar, encuestas por votar, solicitudes por decidir. Activa una app que ofrezca uno y aparecerá.',
  emptyBoardTitle: 'Este tablero está vacío', emptyBoardText: 'Elige los widgets que muestra el tablero y ponlos en el orden que prefieras.', emptyBoardAction: 'Elegir widgets',
  nothing: 'Nada que mostrar', unavailable: 'Este widget no está disponible ahora mismo.', more: '＋{n} más',
  ok: 'OK', warn: 'Atención', err: 'Alerta',
  failed: 'No se pudo iniciar la interfaz del plugin: ', loadFailed: 'No se pudo cargar el panel: ', widgetsFailed: 'No se pudieron cargar los widgets: ',
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
export const sub = (t: string, vars: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))
