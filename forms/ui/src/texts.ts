// The texts of the Forms UI and of its public page (English by default; Italian and Spanish follow the language of the host,
// or `navigator.language` in the public page, which has no `msk.context`).
const en = {
  title: 'Forms', newForm: '＋ New form', filter: 'Show', open: 'Open', closed: 'Closed', all: 'All',
  emptyTitle: 'No forms yet', emptyText: 'Build a form, share a public link to collect answers from anyone with no account, and read them in a table or a CSV.',
  emptyFilter: 'No forms here. Try another filter.',
  stateOpen: 'Open', stateClosed: 'Closed', fieldsN: '{n} fields', fieldsOne: '1 field', noFields: 'No fields yet', answered: 'Answered',
  answersN: '{n} answers', answersOne: '1 answer', closesOn: 'closes on {d}', by: 'by {n}',
  fillIn: 'Fill in', answersTab: 'Answers', tabs: 'View', edit: 'Edit', share: 'Share…', publicLink: 'Public link', remove: 'Delete', removeConfirm: 'Delete the form “{n}” and all its answers?',
  back: '← Forms', cancel: 'Cancel', close: 'Close', save: 'Save', create: 'Create', failed: 'Could not start the UI of the plugin: ', loadFailed: 'Could not load the forms: ',
  // the builder
  newTitle: 'New form', editTitle: 'Edit form', fTitle: 'Title', fIntro: 'Introduction', fOpen: 'Open (takes answers)', fCloses: 'Closes on', fMax: 'Most answers (1 to 5000)', fThanks: 'Thank-you message',
  fFields: 'Fields', addField: '＋ Add field', fieldN: 'Field {n}', fFieldLabel: 'Field {n}: label', fKind: 'Field {n}: type', fRequired: 'Required', fHelp: 'Field {n}: help text',
  kText: 'Short text', kLong: 'Long text', kChoice: 'One choice', kMulti: 'Several choices', kNumber: 'Number', kDate: 'Date', kEmail: 'Email',
  optionN: 'Field {n}, option {o}', addOption: 'Add option', removeOption: 'Remove option {o} of field {n}', moveUp: 'Move field {n} up', moveDown: 'Move field {n} down', removeField: 'Remove field {n}',
  needTitle: 'Write a title', needLabel: 'Field {n} needs a label', needOptions: 'Field {n} needs from 2 to 12 options', needOptionText: 'Field {n}: every option needs a text', needDupOption: 'Field {n}: an option is repeated',
  tooMany: 'A form has at most 30 fields', badMax: 'The most answers is a whole number from 1 to 5000', noFieldsBuilder: 'No fields yet. Add the first one.',
  // filling in
  requiredMark: 'required', send: 'Send', fixTitle: 'Please fix the following', eRequired: '{label} is required', eEmail: '{label}: enter an email address such as name@example.org',
  eNumber: '{label}: enter a number', eDate: '{label}: enter a date', eChoice: '{label}: pick one of the options', eLong: '{label}: at most {max} characters',
  closedNotice: 'This form is not taking answers.', answeredNotice: 'You have already answered this form.', noFieldsFill: 'This form has no fields yet.',
  thanksTitle: 'Thank you', thanksDefault: 'Your answer was sent.', backToList: 'Back to the forms', honey: 'Leave this field empty', yourAnswer: 'Your answer',
  // the answers
  total: 'Answers', noAnswers: 'Nobody has answered yet.', colName: 'Name', colWhen: 'Submitted', colActions: 'Actions', counts: 'Counts per option', countOf: '{a} of {t} answered',
  exportCsv: 'Export CSV', csvName: 'Name', csvWhen: 'Submitted at', exported: 'CSV downloaded', truncated: 'Showing the newest 5000 answers.',
  deleteAnswer: 'Delete', deleteLabel: 'Delete the answer of {n}', deleteConfirm: 'Delete this answer of {n}? It cannot be undone.', deleted: 'Answer deleted',
  // the public page
  pClosed: 'This form is closed: it is not taking answers.', pFull: 'This form has received all the answers it can take.', pAlready: 'You have already answered this form.',
  pRate: 'Too many requests. Wait a minute and try again.', pOff: 'This form is not available: the organisation has not allowed public forms.',
  pSendFailed: 'The answer could not be sent: {error}', pOpenFailed: 'Could not open the form: {error}', pRejected: 'The answer was not accepted.', pInvalid: 'Check the answers: {error}',
}
export type Texts = typeof en
export type L = 'en' | 'it' | 'es'

const it: Texts = {
  title: 'Moduli', newForm: '＋ Nuovo modulo', filter: 'Mostra', open: 'Aperti', closed: 'Chiusi', all: 'Tutti',
  emptyTitle: 'Ancora nessun modulo', emptyText: 'Costruisci un modulo, condividi un link pubblico per raccogliere risposte da chiunque senza account e leggile in una tabella o in un CSV.',
  emptyFilter: 'Nessun modulo qui. Prova un altro filtro.',
  stateOpen: 'Aperto', stateClosed: 'Chiuso', fieldsN: '{n} campi', fieldsOne: '1 campo', noFields: 'Ancora nessun campo', answered: 'Risposto',
  answersN: '{n} risposte', answersOne: '1 risposta', closesOn: 'si chiude il {d}', by: 'di {n}',
  fillIn: 'Compila', answersTab: 'Risposte', tabs: 'Vista', edit: 'Modifica', share: 'Condividi…', publicLink: 'Link pubblico', remove: 'Elimina', removeConfirm: 'Eliminare il modulo “{n}” e tutte le sue risposte?',
  back: '← Moduli', cancel: 'Annulla', close: 'Chiudi', save: 'Salva', create: 'Crea', failed: 'Impossibile avviare la UI del plugin: ', loadFailed: 'Impossibile caricare i moduli: ',
  newTitle: 'Nuovo modulo', editTitle: 'Modifica modulo', fTitle: 'Titolo', fIntro: 'Introduzione', fOpen: 'Aperto (accetta risposte)', fCloses: 'Si chiude il', fMax: 'Numero massimo di risposte (da 1 a 5000)', fThanks: 'Messaggio di ringraziamento',
  fFields: 'Campi', addField: '＋ Aggiungi campo', fieldN: 'Campo {n}', fFieldLabel: 'Campo {n}: etichetta', fKind: 'Campo {n}: tipo', fRequired: 'Obbligatorio', fHelp: 'Campo {n}: testo di aiuto',
  kText: 'Testo breve', kLong: 'Testo lungo', kChoice: 'Una scelta', kMulti: 'Più scelte', kNumber: 'Numero', kDate: 'Data', kEmail: 'Email',
  optionN: 'Campo {n}, opzione {o}', addOption: 'Aggiungi opzione', removeOption: 'Rimuovi l’opzione {o} del campo {n}', moveUp: 'Sposta su il campo {n}', moveDown: 'Sposta giù il campo {n}', removeField: 'Rimuovi il campo {n}',
  needTitle: 'Scrivi un titolo', needLabel: 'Il campo {n} ha bisogno di un’etichetta', needOptions: 'Il campo {n} ha bisogno da 2 a 12 opzioni', needOptionText: 'Campo {n}: ogni opzione ha bisogno di un testo', needDupOption: 'Campo {n}: un’opzione è ripetuta',
  tooMany: 'Un modulo ha al massimo 30 campi', badMax: 'Il numero massimo di risposte è un intero da 1 a 5000', noFieldsBuilder: 'Ancora nessun campo. Aggiungi il primo.',
  requiredMark: 'obbligatorio', send: 'Invia', fixTitle: 'Correggi quanto segue', eRequired: '{label} è obbligatorio', eEmail: '{label}: inserisci un indirizzo email come nome@esempio.it',
  eNumber: '{label}: inserisci un numero', eDate: '{label}: inserisci una data', eChoice: '{label}: scegli una delle opzioni', eLong: '{label}: al massimo {max} caratteri',
  closedNotice: 'Questo modulo non accetta risposte.', answeredNotice: 'Hai già risposto a questo modulo.', noFieldsFill: 'Questo modulo non ha ancora campi.',
  thanksTitle: 'Grazie', thanksDefault: 'La tua risposta è stata inviata.', backToList: 'Torna ai moduli', honey: 'Lascia vuoto questo campo', yourAnswer: 'La tua risposta',
  total: 'Risposte', noAnswers: 'Nessuno ha ancora risposto.', colName: 'Nome', colWhen: 'Inviata', colActions: 'Azioni', counts: 'Conteggi per opzione', countOf: '{a} su {t} hanno risposto',
  exportCsv: 'Esporta CSV', csvName: 'Nome', csvWhen: 'Inviata il', exported: 'CSV scaricato', truncated: 'Mostro le 5000 risposte più recenti.',
  deleteAnswer: 'Elimina', deleteLabel: 'Elimina la risposta di {n}', deleteConfirm: 'Eliminare questa risposta di {n}? Non si può annullare.', deleted: 'Risposta eliminata',
  pClosed: 'Questo modulo è chiuso: non accetta risposte.', pFull: 'Questo modulo ha ricevuto tutte le risposte che può accettare.', pAlready: 'Hai già risposto a questo modulo.',
  pRate: 'Troppe richieste. Aspetta un minuto e riprova.', pOff: 'Questo modulo non è disponibile: l’organizzazione non ha consentito i moduli pubblici.',
  pSendFailed: 'Impossibile inviare la risposta: {error}', pOpenFailed: 'Impossibile aprire il modulo: {error}', pRejected: 'La risposta non è stata accettata.', pInvalid: 'Controlla le risposte: {error}',
}
const es: Texts = {
  title: 'Formularios', newForm: '＋ Nuevo formulario', filter: 'Mostrar', open: 'Abiertos', closed: 'Cerrados', all: 'Todos',
  emptyTitle: 'Todavía no hay formularios', emptyText: 'Crea un formulario, comparte un enlace público para recoger respuestas de cualquiera sin cuenta y léelas en una tabla o en un CSV.',
  emptyFilter: 'No hay formularios aquí. Prueba otro filtro.',
  stateOpen: 'Abierto', stateClosed: 'Cerrado', fieldsN: '{n} campos', fieldsOne: '1 campo', noFields: 'Todavía no hay campos', answered: 'Respondido',
  answersN: '{n} respuestas', answersOne: '1 respuesta', closesOn: 'se cierra el {d}', by: 'de {n}',
  fillIn: 'Rellenar', answersTab: 'Respuestas', tabs: 'Vista', edit: 'Editar', share: 'Compartir…', publicLink: 'Enlace público', remove: 'Eliminar', removeConfirm: '¿Eliminar el formulario “{n}” y todas sus respuestas?',
  back: '← Formularios', cancel: 'Cancelar', close: 'Cerrar', save: 'Guardar', create: 'Crear', failed: 'No se pudo iniciar la interfaz del plugin: ', loadFailed: 'No se pudieron cargar los formularios: ',
  newTitle: 'Nuevo formulario', editTitle: 'Editar formulario', fTitle: 'Título', fIntro: 'Introducción', fOpen: 'Abierto (acepta respuestas)', fCloses: 'Se cierra el', fMax: 'Número máximo de respuestas (de 1 a 5000)', fThanks: 'Mensaje de agradecimiento',
  fFields: 'Campos', addField: '＋ Añadir campo', fieldN: 'Campo {n}', fFieldLabel: 'Campo {n}: etiqueta', fKind: 'Campo {n}: tipo', fRequired: 'Obligatorio', fHelp: 'Campo {n}: texto de ayuda',
  kText: 'Texto corto', kLong: 'Texto largo', kChoice: 'Una opción', kMulti: 'Varias opciones', kNumber: 'Número', kDate: 'Fecha', kEmail: 'Correo',
  optionN: 'Campo {n}, opción {o}', addOption: 'Añadir opción', removeOption: 'Quitar la opción {o} del campo {n}', moveUp: 'Subir el campo {n}', moveDown: 'Bajar el campo {n}', removeField: 'Quitar el campo {n}',
  needTitle: 'Escribe un título', needLabel: 'El campo {n} necesita una etiqueta', needOptions: 'El campo {n} necesita de 2 a 12 opciones', needOptionText: 'Campo {n}: cada opción necesita un texto', needDupOption: 'Campo {n}: una opción está repetida',
  tooMany: 'Un formulario tiene como máximo 30 campos', badMax: 'El número máximo de respuestas es un entero de 1 a 5000', noFieldsBuilder: 'Todavía no hay campos. Añade el primero.',
  requiredMark: 'obligatorio', send: 'Enviar', fixTitle: 'Corrige lo siguiente', eRequired: '{label} es obligatorio', eEmail: '{label}: escribe una dirección de correo como nombre@ejemplo.es',
  eNumber: '{label}: escribe un número', eDate: '{label}: escribe una fecha', eChoice: '{label}: elige una de las opciones', eLong: '{label}: como máximo {max} caracteres',
  closedNotice: 'Este formulario no acepta respuestas.', answeredNotice: 'Ya has respondido a este formulario.', noFieldsFill: 'Este formulario todavía no tiene campos.',
  thanksTitle: 'Gracias', thanksDefault: 'Tu respuesta se ha enviado.', backToList: 'Volver a los formularios', honey: 'Deja este campo vacío', yourAnswer: 'Tu respuesta',
  total: 'Respuestas', noAnswers: 'Todavía nadie ha respondido.', colName: 'Nombre', colWhen: 'Enviada', colActions: 'Acciones', counts: 'Recuento por opción', countOf: '{a} de {t} han respondido',
  exportCsv: 'Exportar CSV', csvName: 'Nombre', csvWhen: 'Enviada el', exported: 'CSV descargado', truncated: 'Se muestran las 5000 respuestas más recientes.',
  deleteAnswer: 'Eliminar', deleteLabel: 'Eliminar la respuesta de {n}', deleteConfirm: '¿Eliminar esta respuesta de {n}? No se puede deshacer.', deleted: 'Respuesta eliminada',
  pClosed: 'Este formulario está cerrado: no acepta respuestas.', pFull: 'Este formulario ha recibido todas las respuestas que puede aceptar.', pAlready: 'Ya has respondido a este formulario.',
  pRate: 'Demasiadas solicitudes. Espera un minuto e inténtalo de nuevo.', pOff: 'Este formulario no está disponible: la organización no ha permitido los formularios públicos.',
  pSendFailed: 'No se pudo enviar la respuesta: {error}', pOpenFailed: 'No se pudo abrir el formulario: {error}', pRejected: 'La respuesta no se ha aceptado.', pInvalid: 'Revisa las respuestas: {error}',
}
export const TEXTS: Record<L, Texts> = { en, it, es }

export const langOf = (l: string | undefined): L => {
  const x = (l ?? navigator.language).toLowerCase()
  return x.startsWith('it') ? 'it' : x.startsWith('es') ? 'es' : 'en'
}
export const sub = (t: string, vars: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))
