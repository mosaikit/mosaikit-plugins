// The texts of the Calendar UI (English by default; Italian and Spanish follow the language of the host).
const en = {
  title: 'Calendar', today: 'Today', prev: 'Previous', next: 'Next', month: 'Month', week: 'Week', day: 'Day', viewLabel: 'View',
  showTasks: 'Show task due dates', newEvent: '＋ New event', invitations: 'My invitations', export: 'Export month (.ics)',
  invitationsTitle: 'My invitations', noInvitations: 'No invitations waiting for an answer.', inviteBy: 'from {n}',
  emptyTitle: 'Nothing here yet', emptyText: 'No events or task due dates in this period. Click a day or use “New event” to add one.',
  taskDue: 'Task due: {t}', more: '+{n} more', allDay: 'All day', noEventsDay: 'Nothing on this day.', dayOf: '{d}, {n} items', untimed: 'No time',
  newTitle: 'New event', editTitle: 'Edit event', fTitle: 'Title', fAllDay: 'All day', fStartDate: 'Start date', fStartTime: 'Start time', fEndDate: 'End date', fEndTime: 'End time',
  fLocation: 'Location', fDetails: 'Details', fRepeat: 'Repeat', fUntil: 'Repeat until', fColor: 'Color', fInvitees: 'Invitees', addInvitee: 'Invite a person',
  noneFound: 'No one found', removeInvitee: 'Remove', noInvitees: 'Nobody invited yet.',
  repeatNone: 'Does not repeat', repeatDaily: 'Every day', repeatWeekly: 'Every week', repeatMonthly: 'Every month', repeatYearly: 'Every year',
  blue: 'Blue', green: 'Green', red: 'Red', orange: 'Orange', purple: 'Purple', grey: 'Grey',
  timesNote: 'Times are local times, exactly as you write them: there is no time zone conversion.',
  seriesNote: 'This event repeats: editing it changes the whole series.',
  shareNote: 'The invitees need read access to see the event: share it with them after you save it.',
  save: 'Save', create: 'Create event', cancel: 'Cancel',
  needTitle: 'Write a title', needStart: 'Choose the start date', endBefore: 'The event cannot end before it starts', badTime: 'Write the times as HH:MM',
  createdTitle: 'Event created', createdText: 'Share the event with the invitees so they can see it.', shareNow: 'Share…', later: 'Later',
  when: 'When', where: 'Where', whoIsInvited: 'Invitees', detailsTitle: 'Details', noDetails: 'No details.', repeatsLine: '{r}', untilLine: 'until {d}',
  answerYes: 'Yes', answerMaybe: 'Maybe', answerNo: 'No', myAnswer: 'Your answer', noAnswer: 'No answer yet', wordYes: 'coming', wordNo: 'not coming', wordMaybe: 'maybe',
  counts: '{y} yes · {m} maybe · {n} no', answered: 'Your answer: {a}', answerSaved: 'Answer saved',
  addIcs: 'Add to my calendar (.ics)', edit: 'Edit', share: 'Share…', remove: 'Delete', removeConfirm: 'Delete the event “{n}”? Every occurrence disappears.', removeSeriesConfirm: 'Delete the event “{n}”? The whole series is deleted.',
  close: 'Close', failed: 'Could not start the UI of the plugin: ', loadFailed: 'Could not load the calendar: ', tasksFailed: 'The task due dates are not available: ',
  owner: 'Organised by {n}', exportEmpty: 'No events to export in this month.',
}
export type Texts = typeof en
export type L = 'en' | 'it' | 'es'

const it: Texts = {
  title: 'Calendario', today: 'Oggi', prev: 'Precedente', next: 'Successivo', month: 'Mese', week: 'Settimana', day: 'Giorno', viewLabel: 'Vista',
  showTasks: 'Mostra le scadenze delle attività', newEvent: '＋ Nuovo evento', invitations: 'I miei inviti', export: 'Esporta il mese (.ics)',
  invitationsTitle: 'I miei inviti', noInvitations: 'Nessun invito in attesa di risposta.', inviteBy: 'da {n}',
  emptyTitle: 'Ancora niente qui', emptyText: 'Nessun evento né scadenza in questo periodo. Clicca un giorno o usa “Nuovo evento” per aggiungerne uno.',
  taskDue: 'Attività in scadenza: {t}', more: '+{n} altri', allDay: 'Tutto il giorno', noEventsDay: 'Niente in questo giorno.', dayOf: '{d}, {n} elementi', untimed: 'Senza ora',
  newTitle: 'Nuovo evento', editTitle: 'Modifica evento', fTitle: 'Titolo', fAllDay: 'Tutto il giorno', fStartDate: 'Data di inizio', fStartTime: 'Ora di inizio', fEndDate: 'Data di fine', fEndTime: 'Ora di fine',
  fLocation: 'Luogo', fDetails: 'Dettagli', fRepeat: 'Ripeti', fUntil: 'Ripeti fino al', fColor: 'Colore', fInvitees: 'Invitati', addInvitee: 'Invita una persona',
  noneFound: 'Nessuno trovato', removeInvitee: 'Rimuovi', noInvitees: 'Nessun invitato.',
  repeatNone: 'Non si ripete', repeatDaily: 'Ogni giorno', repeatWeekly: 'Ogni settimana', repeatMonthly: 'Ogni mese', repeatYearly: 'Ogni anno',
  blue: 'Blu', green: 'Verde', red: 'Rosso', orange: 'Arancione', purple: 'Viola', grey: 'Grigio',
  timesNote: 'Gli orari sono orari locali, esattamente come li scrivi: non c’è conversione di fuso orario.',
  seriesNote: 'Questo evento si ripete: modificarlo cambia tutta la serie.',
  shareNote: 'Gli invitati hanno bisogno del diritto di lettura per vedere l’evento: condividilo con loro dopo averlo salvato.',
  save: 'Salva', create: 'Crea evento', cancel: 'Annulla',
  needTitle: 'Scrivi un titolo', needStart: 'Scegli la data di inizio', endBefore: 'L’evento non può finire prima di iniziare', badTime: 'Scrivi gli orari come HH:MM',
  createdTitle: 'Evento creato', createdText: 'Condividi l’evento con gli invitati perché possano vederlo.', shareNow: 'Condividi…', later: 'Più tardi',
  when: 'Quando', where: 'Dove', whoIsInvited: 'Invitati', detailsTitle: 'Dettagli', noDetails: 'Nessun dettaglio.', repeatsLine: '{r}', untilLine: 'fino al {d}',
  answerYes: 'Sì', answerMaybe: 'Forse', answerNo: 'No', myAnswer: 'La tua risposta', noAnswer: 'Nessuna risposta', wordYes: 'partecipa', wordNo: 'non partecipa', wordMaybe: 'forse',
  counts: '{y} sì · {m} forse · {n} no', answered: 'La tua risposta: {a}', answerSaved: 'Risposta salvata',
  addIcs: 'Aggiungi al mio calendario (.ics)', edit: 'Modifica', share: 'Condividi…', remove: 'Elimina', removeConfirm: 'Eliminare l’evento “{n}”? Spariscono tutte le occorrenze.', removeSeriesConfirm: 'Eliminare l’evento “{n}”? Si elimina tutta la serie.',
  close: 'Chiudi', failed: 'Impossibile avviare la UI del plugin: ', loadFailed: 'Impossibile caricare il calendario: ', tasksFailed: 'Le scadenze delle attività non sono disponibili: ',
  owner: 'Organizzato da {n}', exportEmpty: 'Nessun evento da esportare in questo mese.',
}
const es: Texts = {
  title: 'Calendario', today: 'Hoy', prev: 'Anterior', next: 'Siguiente', month: 'Mes', week: 'Semana', day: 'Día', viewLabel: 'Vista',
  showTasks: 'Mostrar los vencimientos de tareas', newEvent: '＋ Nuevo evento', invitations: 'Mis invitaciones', export: 'Exportar el mes (.ics)',
  invitationsTitle: 'Mis invitaciones', noInvitations: 'No hay invitaciones esperando respuesta.', inviteBy: 'de {n}',
  emptyTitle: 'Todavía no hay nada', emptyText: 'No hay eventos ni vencimientos en este periodo. Haz clic en un día o usa “Nuevo evento” para añadir uno.',
  taskDue: 'Tarea con vencimiento: {t}', more: '+{n} más', allDay: 'Todo el día', noEventsDay: 'Nada este día.', dayOf: '{d}, {n} elementos', untimed: 'Sin hora',
  newTitle: 'Nuevo evento', editTitle: 'Editar evento', fTitle: 'Título', fAllDay: 'Todo el día', fStartDate: 'Fecha de inicio', fStartTime: 'Hora de inicio', fEndDate: 'Fecha de fin', fEndTime: 'Hora de fin',
  fLocation: 'Lugar', fDetails: 'Detalles', fRepeat: 'Repetir', fUntil: 'Repetir hasta', fColor: 'Color', fInvitees: 'Invitados', addInvitee: 'Invitar a una persona',
  noneFound: 'No se encontró a nadie', removeInvitee: 'Quitar', noInvitees: 'Nadie invitado todavía.',
  repeatNone: 'No se repite', repeatDaily: 'Cada día', repeatWeekly: 'Cada semana', repeatMonthly: 'Cada mes', repeatYearly: 'Cada año',
  blue: 'Azul', green: 'Verde', red: 'Rojo', orange: 'Naranja', purple: 'Morado', grey: 'Gris',
  timesNote: 'Las horas son horas locales, tal como las escribes: no hay conversión de zona horaria.',
  seriesNote: 'Este evento se repite: editarlo cambia toda la serie.',
  shareNote: 'Los invitados necesitan acceso de lectura para ver el evento: compártelo con ellos después de guardarlo.',
  save: 'Guardar', create: 'Crear evento', cancel: 'Cancelar',
  needTitle: 'Escribe un título', needStart: 'Elige la fecha de inicio', endBefore: 'El evento no puede terminar antes de empezar', badTime: 'Escribe las horas como HH:MM',
  createdTitle: 'Evento creado', createdText: 'Comparte el evento con los invitados para que puedan verlo.', shareNow: 'Compartir…', later: 'Más tarde',
  when: 'Cuándo', where: 'Dónde', whoIsInvited: 'Invitados', detailsTitle: 'Detalles', noDetails: 'Sin detalles.', repeatsLine: '{r}', untilLine: 'hasta el {d}',
  answerYes: 'Sí', answerMaybe: 'Quizá', answerNo: 'No', myAnswer: 'Tu respuesta', noAnswer: 'Sin respuesta', wordYes: 'asiste', wordNo: 'no asiste', wordMaybe: 'quizá',
  counts: '{y} sí · {m} quizá · {n} no', answered: 'Tu respuesta: {a}', answerSaved: 'Respuesta guardada',
  addIcs: 'Añadir a mi calendario (.ics)', edit: 'Editar', share: 'Compartir…', remove: 'Eliminar', removeConfirm: '¿Eliminar el evento “{n}”? Desaparecen todas las repeticiones.', removeSeriesConfirm: '¿Eliminar el evento “{n}”? Se elimina toda la serie.',
  close: 'Cerrar', failed: 'No se pudo iniciar la interfaz del plugin: ', loadFailed: 'No se pudo cargar el calendario: ', tasksFailed: 'Los vencimientos de tareas no están disponibles: ',
  owner: 'Organizado por {n}', exportEmpty: 'No hay eventos que exportar en este mes.',
}
export const TEXTS: Record<L, Texts> = { en, it, es }

export const langOf = (l: string | undefined): L => {
  const x = (l ?? navigator.language).toLowerCase()
  return x.startsWith('it') ? 'it' : x.startsWith('es') ? 'es' : 'en'
}
export const sub = (t: string, vars: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))
