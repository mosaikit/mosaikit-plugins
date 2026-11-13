import type { Msk } from '@mosaikit/plugin-api'
// The texts of the Approvals UI (English by default; Italian and Spanish follow the language of the host).
const en = {
  title: 'Approvals', newRequest: '＋ New request', toDecide: 'To decide', mine: 'My requests', all: 'All', filter: 'Show', badge: '{n} to decide',
  emptyTitle: 'No requests yet', emptyText: 'Write a request, choose who must approve it and share it with them.',
  emptyTodoTitle: 'Nothing to decide', emptyTodoText: 'When somebody asks for your approval, it shows up here.',
  emptyMineTitle: 'You have not asked for anything yet', emptyMineText: 'Send a request to the people who must approve it.',
  pending: 'Pending', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled',
  vWaiting: 'waiting for the decision', vLater: 'not yet their turn', vNone: 'no decision',
  by: 'asked by {n}', amountIs: 'Amount: {a}', waitingFor: 'Waiting for {n}', yourTurn: 'Your turn', open: 'Open',
  modeAny: 'One approval is enough', modeAll: 'Everybody must approve', modeSeq: 'One after the other',
  fTitle: 'Title', fDetails: 'Details', fAmount: 'Amount (optional, for example 1200 EUR)', fMode: 'Who must approve', fApprovers: 'Approvers',
  addApprover: 'Add an approver', noApprovers: 'No approvers yet. Search for a person above.', orderNote: 'They decide in the order of this list.', moveUp: 'Move up', moveDown: 'Move down', removeApprover: 'Remove',
  shareNote: 'The approvers need read access to decide: share the request with them after you send it.', noneFound: 'No one found',
  send: 'Send request', save: 'Save', cancel: 'Cancel', edit: 'Edit', remove: 'Delete', share: 'Share…', newTitle: 'New request', editTitle: 'Edit request',
  cancelRequest: 'Cancel the request', cancelConfirm: 'Cancel the request “{n}”? It cannot be reopened.', keepIt: 'Keep it',
  removeConfirm: 'Delete the request “{n}”?',
  approve: 'Approve', reject: 'Reject', comment: 'Comment', commentHint: 'Optional. Say why when you reject.', decisionFinal: 'Your decision is final: it cannot be changed.',
  detailsTitle: 'Details', noDetails: 'No details.', history: 'Decisions', approversTitle: 'Approvers',
  needTitle: 'Write a title', needApprover: 'Choose at least one approver', needReason: 'Say why you reject the request',
  doneApproved: 'You approved the request', doneRejected: 'You rejected the request',
  createdTitle: 'Request sent', createdText: 'The approvers can decide only if they can read the request: share it with them now.', shareNow: 'Share…', later: 'Later',
  close: 'Close', failed: 'Could not start the UI of the plugin: ', loadFailed: 'Could not load the requests: ',
}
export type Texts = typeof en
export type L = string

const it: Texts = {
  title: 'Approvazioni', newRequest: '＋ Nuova richiesta', toDecide: 'Da decidere', mine: 'Le mie richieste', all: 'Tutte', filter: 'Mostra', badge: '{n} da decidere',
  emptyTitle: 'Ancora nessuna richiesta', emptyText: 'Scrivi una richiesta, scegli chi deve approvarla e condividila con loro.',
  emptyTodoTitle: 'Niente da decidere', emptyTodoText: 'Quando qualcuno chiede la tua approvazione, la trovi qui.',
  emptyMineTitle: 'Non hai ancora chiesto nulla', emptyMineText: 'Invia una richiesta alle persone che devono approvarla.',
  pending: 'In attesa', approved: 'Approvata', rejected: 'Rifiutata', cancelled: 'Annullata',
  vWaiting: 'in attesa della decisione', vLater: 'non ancora il suo turno', vNone: 'nessuna decisione',
  by: 'chiesta da {n}', amountIs: 'Importo: {a}', waitingFor: 'In attesa di {n}', yourTurn: 'Tocca a te', open: 'Apri',
  modeAny: 'Ne basta una', modeAll: 'Devono approvare tutti', modeSeq: 'Uno dopo l’altro',
  fTitle: 'Titolo', fDetails: 'Dettagli', fAmount: 'Importo (facoltativo, per esempio 1200 EUR)', fMode: 'Chi deve approvare', fApprovers: 'Approvatori',
  addApprover: 'Aggiungi un approvatore', noApprovers: 'Ancora nessun approvatore. Cerca una persona qui sopra.', orderNote: 'Decidono nell’ordine di questo elenco.', moveUp: 'Sposta su', moveDown: 'Sposta giù', removeApprover: 'Rimuovi',
  shareNote: 'Gli approvatori hanno bisogno del diritto di lettura per decidere: condividi la richiesta con loro dopo averla inviata.', noneFound: 'Nessuno trovato',
  send: 'Invia richiesta', save: 'Salva', cancel: 'Annulla', edit: 'Modifica', remove: 'Elimina', share: 'Condividi…', newTitle: 'Nuova richiesta', editTitle: 'Modifica richiesta',
  cancelRequest: 'Annulla la richiesta', cancelConfirm: 'Annullare la richiesta “{n}”? Non si può riaprire.', keepIt: 'Mantieni',
  removeConfirm: 'Eliminare la richiesta “{n}”?',
  approve: 'Approva', reject: 'Rifiuta', comment: 'Commento', commentHint: 'Facoltativo. Se rifiuti, spiega perché.', decisionFinal: 'La tua decisione è definitiva: non si può cambiare.',
  detailsTitle: 'Dettagli', noDetails: 'Nessun dettaglio.', history: 'Decisioni', approversTitle: 'Approvatori',
  needTitle: 'Scrivi un titolo', needApprover: 'Scegli almeno un approvatore', needReason: 'Spiega perché rifiuti la richiesta',
  doneApproved: 'Hai approvato la richiesta', doneRejected: 'Hai rifiutato la richiesta',
  createdTitle: 'Richiesta inviata', createdText: 'Gli approvatori possono decidere solo se possono leggere la richiesta: condividila subito con loro.', shareNow: 'Condividi…', later: 'Più tardi',
  close: 'Chiudi', failed: 'Impossibile avviare la UI del plugin: ', loadFailed: 'Impossibile caricare le richieste: ',
}
const es: Texts = {
  title: 'Aprobaciones', newRequest: '＋ Nueva solicitud', toDecide: 'Por decidir', mine: 'Mis solicitudes', all: 'Todas', filter: 'Mostrar', badge: '{n} por decidir',
  emptyTitle: 'Todavía no hay solicitudes', emptyText: 'Escribe una solicitud, elige quién debe aprobarla y compártela con esas personas.',
  emptyTodoTitle: 'Nada por decidir', emptyTodoText: 'Cuando alguien pida tu aprobación, aparecerá aquí.',
  emptyMineTitle: 'Todavía no has pedido nada', emptyMineText: 'Envía una solicitud a las personas que deben aprobarla.',
  pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada', cancelled: 'Cancelada',
  vWaiting: 'esperando la decisión', vLater: 'todavía no es su turno', vNone: 'sin decisión',
  by: 'pedida por {n}', amountIs: 'Importe: {a}', waitingFor: 'Esperando a {n}', yourTurn: 'Te toca', open: 'Abrir',
  modeAny: 'Basta con una', modeAll: 'Deben aprobar todos', modeSeq: 'Uno tras otro',
  fTitle: 'Título', fDetails: 'Detalles', fAmount: 'Importe (opcional, por ejemplo 1200 EUR)', fMode: 'Quién debe aprobar', fApprovers: 'Aprobadores',
  addApprover: 'Añadir un aprobador', noApprovers: 'Todavía no hay aprobadores. Busca a una persona arriba.', orderNote: 'Deciden en el orden de esta lista.', moveUp: 'Subir', moveDown: 'Bajar', removeApprover: 'Quitar',
  shareNote: 'Los aprobadores necesitan acceso de lectura para decidir: comparte la solicitud con ellos después de enviarla.', noneFound: 'No se encontró a nadie',
  send: 'Enviar solicitud', save: 'Guardar', cancel: 'Cancelar', edit: 'Editar', remove: 'Eliminar', share: 'Compartir…', newTitle: 'Nueva solicitud', editTitle: 'Editar solicitud',
  cancelRequest: 'Cancelar la solicitud', cancelConfirm: '¿Cancelar la solicitud “{n}”? No se puede reabrir.', keepIt: 'Mantener',
  removeConfirm: '¿Eliminar la solicitud “{n}”?',
  approve: 'Aprobar', reject: 'Rechazar', comment: 'Comentario', commentHint: 'Opcional. Si rechazas, explica por qué.', decisionFinal: 'Tu decisión es definitiva: no se puede cambiar.',
  detailsTitle: 'Detalles', noDetails: 'Sin detalles.', history: 'Decisiones', approversTitle: 'Aprobadores',
  needTitle: 'Escribe un título', needApprover: 'Elige al menos un aprobador', needReason: 'Explica por qué rechazas la solicitud',
  doneApproved: 'Has aprobado la solicitud', doneRejected: 'Has rechazado la solicitud',
  createdTitle: 'Solicitud enviada', createdText: 'Los aprobadores solo pueden decidir si pueden leer la solicitud: compártela ahora con ellos.', shareNow: 'Compartir…', later: 'Más tarde',
  close: 'Cerrar', failed: 'No se pudo iniciar la interfaz del plugin: ', loadFailed: 'No se pudieron cargar las solicitudes: ',
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
