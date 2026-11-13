import type { Msk } from '@mosaikit/plugin-api'
// The texts of the Polls UI (English by default; Italian and Spanish follow the language of the host).
const en = {
  title: 'Polls', newPoll: '＋ New poll', open: 'Open', closed: 'Closed', all: 'All', filter: 'Show', back: '← Polls',
  emptyTitle: 'No polls yet', emptyText: 'Ask a quick question: write the options, share the poll with the people who should answer and watch the results come in.',
  emptyFilter: 'No polls here. Try another filter.',
  stateOpen: 'Open', stateClosed: 'Closed', closesOn: 'Closes on {d}', voted: 'Voted', voters: '{n} voters', oneVoter: '1 voter', noVoters: 'No votes yet', by: 'by {n}',
  fQuestion: 'Question', fDetails: 'Details', fOptions: 'Options', fOption: 'Option {n}', addOption: '＋ Add an option', removeOption: 'Remove option {n}',
  fMultiple: 'Allow more than one choice', fHide: 'Hide who voted', fResults: 'Show results', fCloses: 'Closes on',
  always: 'Always', afterVote: 'After the person votes', afterClose: 'Only when the poll is closed',
  create: 'Create', save: 'Save', cancel: 'Cancel', edit: 'Edit', remove: 'Delete', share: 'Share…', newTitle: 'New poll', editTitle: 'Edit poll',
  removeConfirm: 'Delete the poll “{n}”?', closePoll: 'Close the poll', reopen: 'Reopen', closedToast: 'The poll is closed', reopenedToast: 'The poll is open again',
  vote: 'Vote', changeVote: 'Change my vote', voteSaved: 'Your vote is saved', pickOne: 'Choose an option to vote', chooseOne: 'Choose one option', chooseMany: 'Choose one or more options',
  closedNote: 'This poll is closed: voting is disabled.', results: 'Results', peopleVoted: '{n} people voted', onePersonVoted: '1 person voted', percentOf: '{p}%, {v} votes', winner: 'Leading',
  hiddenAfterVote: 'The results appear after you vote.', hiddenAfterClose: 'The results appear when the poll is closed.', anonymous: 'Votes are anonymous.',
  editWarning: 'People have already voted. Changing the options can make some votes count for another option or not count at all.',
  needQuestion: 'Write a question', pOpt_empty: 'An option is empty', pOpt_count: 'A poll has from 2 to 12 options', pOpt_duplicate: 'Two options are the same', pOpt_long: 'An option has at most 100 characters',
  live: 'Results update live', failed: 'Could not start the UI of the plugin: ', loadFailed: 'Could not load the polls: ',
  publicLink: 'Public link', publicHint: 'People outside the organisation vote from the link, once for each browser, and never see who voted.', visitors: 'Visitors: {n}',
  pAlready: 'You have already voted from this browser. A vote cannot be changed.', pRate: 'Too many attempts. Wait a minute and try again.',
  pOff: 'This poll cannot take votes from a public link right now.', pCap: 'This poll has reached the most voters it takes.',
  pSendFailed: 'Could not send the vote: {error}', pOpenFailed: 'Could not open the poll: {error}', pHoney: 'Leave this field empty',
  pOnce: 'You can vote once from this browser. Nobody sees who voted.', pYours: 'Your choice', pClosedVote: 'This poll closed before your vote.',
}
export type Texts = typeof en
export type L = string

const it: Texts = {
  title: 'Sondaggi', newPoll: '＋ Nuovo sondaggio', open: 'Aperti', closed: 'Chiusi', all: 'Tutti', filter: 'Mostra', back: '← Sondaggi',
  emptyTitle: 'Ancora nessun sondaggio', emptyText: 'Fai una domanda veloce: scrivi le opzioni, condividi il sondaggio con chi deve rispondere e guarda arrivare i risultati.',
  emptyFilter: 'Nessun sondaggio qui. Prova un altro filtro.',
  stateOpen: 'Aperto', stateClosed: 'Chiuso', closesOn: 'Chiude il {d}', voted: 'Votato', voters: '{n} votanti', oneVoter: '1 votante', noVoters: 'Ancora nessun voto', by: 'di {n}',
  fQuestion: 'Domanda', fDetails: 'Dettagli', fOptions: 'Opzioni', fOption: 'Opzione {n}', addOption: '＋ Aggiungi un’opzione', removeOption: 'Rimuovi l’opzione {n}',
  fMultiple: 'Permetti più di una scelta', fHide: 'Nascondi chi ha votato', fResults: 'Mostra i risultati', fCloses: 'Chiude il',
  always: 'Sempre', afterVote: 'Dopo che la persona ha votato', afterClose: 'Solo a sondaggio chiuso',
  create: 'Crea', save: 'Salva', cancel: 'Annulla', edit: 'Modifica', remove: 'Elimina', share: 'Condividi…', newTitle: 'Nuovo sondaggio', editTitle: 'Modifica sondaggio',
  removeConfirm: 'Eliminare il sondaggio “{n}”?', closePoll: 'Chiudi il sondaggio', reopen: 'Riapri', closedToast: 'Il sondaggio è chiuso', reopenedToast: 'Il sondaggio è di nuovo aperto',
  vote: 'Vota', changeVote: 'Cambia il mio voto', voteSaved: 'Il tuo voto è salvato', pickOne: 'Scegli un’opzione per votare', chooseOne: 'Scegli una sola opzione', chooseMany: 'Scegli una o più opzioni',
  closedNote: 'Questo sondaggio è chiuso: non si può più votare.', results: 'Risultati', peopleVoted: '{n} persone hanno votato', onePersonVoted: '1 persona ha votato', percentOf: '{p}%, {v} voti', winner: 'In testa',
  hiddenAfterVote: 'I risultati compaiono dopo il tuo voto.', hiddenAfterClose: 'I risultati compaiono quando il sondaggio è chiuso.', anonymous: 'I voti sono anonimi.',
  editWarning: 'Alcune persone hanno già votato. Cambiare le opzioni può far contare alcuni voti per un’altra opzione o non farli contare affatto.',
  needQuestion: 'Scrivi una domanda', pOpt_empty: 'Un’opzione è vuota', pOpt_count: 'Un sondaggio ha da 2 a 12 opzioni', pOpt_duplicate: 'Due opzioni sono uguali', pOpt_long: 'Un’opzione ha al massimo 100 caratteri',
  live: 'I risultati si aggiornano in tempo reale', failed: 'Impossibile avviare la UI del plugin: ', loadFailed: 'Impossibile caricare i sondaggi: ',
  publicLink: 'Link pubblico', publicHint: 'Chi è fuori dall’organizzazione vota dal link, una sola volta per browser, e non vede mai chi ha votato.', visitors: 'Visitatori: {n}',
  pAlready: 'Hai già votato da questo browser. Un voto non si può cambiare.', pRate: 'Troppi tentativi. Aspetta un minuto e riprova.',
  pOff: 'Questo sondaggio al momento non accetta voti da un link pubblico.', pCap: 'Questo sondaggio ha raggiunto il numero massimo di votanti.',
  pSendFailed: 'Impossibile inviare il voto: {error}', pOpenFailed: 'Impossibile aprire il sondaggio: {error}', pHoney: 'Lascia vuoto questo campo',
  pOnce: 'Puoi votare una sola volta da questo browser. Nessuno vede chi ha votato.', pYours: 'La tua scelta', pClosedVote: 'Il sondaggio si è chiuso prima del tuo voto.',
}
const es: Texts = {
  title: 'Encuestas', newPoll: '＋ Nueva encuesta', open: 'Abiertas', closed: 'Cerradas', all: 'Todas', filter: 'Mostrar', back: '← Encuestas',
  emptyTitle: 'Todavía no hay encuestas', emptyText: 'Haz una pregunta rápida: escribe las opciones, comparte la encuesta con quienes deban responder y mira llegar los resultados.',
  emptyFilter: 'No hay encuestas aquí. Prueba otro filtro.',
  stateOpen: 'Abierta', stateClosed: 'Cerrada', closesOn: 'Se cierra el {d}', voted: 'Votada', voters: '{n} votantes', oneVoter: '1 votante', noVoters: 'Aún no hay votos', by: 'de {n}',
  fQuestion: 'Pregunta', fDetails: 'Detalles', fOptions: 'Opciones', fOption: 'Opción {n}', addOption: '＋ Añadir una opción', removeOption: 'Quitar la opción {n}',
  fMultiple: 'Permitir más de una opción', fHide: 'Ocultar quién ha votado', fResults: 'Mostrar resultados', fCloses: 'Se cierra el',
  always: 'Siempre', afterVote: 'Después de que la persona vote', afterClose: 'Solo cuando la encuesta se cierre',
  create: 'Crear', save: 'Guardar', cancel: 'Cancelar', edit: 'Editar', remove: 'Eliminar', share: 'Compartir…', newTitle: 'Nueva encuesta', editTitle: 'Editar encuesta',
  removeConfirm: '¿Eliminar la encuesta “{n}”?', closePoll: 'Cerrar la encuesta', reopen: 'Reabrir', closedToast: 'La encuesta está cerrada', reopenedToast: 'La encuesta vuelve a estar abierta',
  vote: 'Votar', changeVote: 'Cambiar mi voto', voteSaved: 'Tu voto está guardado', pickOne: 'Elige una opción para votar', chooseOne: 'Elige una sola opción', chooseMany: 'Elige una o más opciones',
  closedNote: 'Esta encuesta está cerrada: ya no se puede votar.', results: 'Resultados', peopleVoted: '{n} personas han votado', onePersonVoted: '1 persona ha votado', percentOf: '{p}%, {v} votos', winner: 'En cabeza',
  hiddenAfterVote: 'Los resultados aparecen después de que votes.', hiddenAfterClose: 'Los resultados aparecen cuando la encuesta se cierre.', anonymous: 'Los votos son anónimos.',
  editWarning: 'Ya ha votado gente. Cambiar las opciones puede hacer que algunos votos cuenten para otra opción o que no cuenten.',
  needQuestion: 'Escribe una pregunta', pOpt_empty: 'Una opción está vacía', pOpt_count: 'Una encuesta tiene de 2 a 12 opciones', pOpt_duplicate: 'Dos opciones son iguales', pOpt_long: 'Una opción tiene como máximo 100 caracteres',
  live: 'Los resultados se actualizan en directo', failed: 'No se pudo iniciar la interfaz del plugin: ', loadFailed: 'No se pudieron cargar las encuestas: ',
  publicLink: 'Enlace público', publicHint: 'Quienes están fuera de la organización votan desde el enlace, una sola vez por navegador, y nunca ven quién ha votado.', visitors: 'Visitantes: {n}',
  pAlready: 'Ya has votado desde este navegador. Un voto no se puede cambiar.', pRate: 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.',
  pOff: 'Esta encuesta no admite votos desde un enlace público en este momento.', pCap: 'Esta encuesta ha alcanzado el máximo de votantes.',
  pSendFailed: 'No se pudo enviar el voto: {error}', pOpenFailed: 'No se pudo abrir la encuesta: {error}', pHoney: 'Deja este campo vacío',
  pOnce: 'Puedes votar una sola vez desde este navegador. Nadie ve quién ha votado.', pYours: 'Tu elección', pClosedVote: 'La encuesta se cerró antes de tu voto.',
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
