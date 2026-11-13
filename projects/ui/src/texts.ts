import type { Msk } from '@mosaikit/plugin-api'
// The texts of the Projects UI (English by default; Italian and Spanish follow the language of the host).
const en = {
  title: 'Projects', newProject: '＋ New project', filter: 'Status',
  all: 'All', planned: 'Planned', active: 'Active', on_hold: 'On hold', done: 'Done',
  emptyTitle: 'No projects yet', emptyText: 'Create a project to give a set of tasks a board, milestones with dates and sprints.', emptyFilter: 'No project with this status.',
  tasksMissingTitle: 'Install the Tasks plugin', tasksMissingText: 'Projects arranges the tasks of the Tasks plugin. Install it (version 0.6 or later), turn it on, and come back.',
  progressNeedsTasks: 'Progress needs the Tasks plugin.',
  back: '← Projects', tBoard: 'Board', tMilestones: 'Milestones', tSprints: 'Sprints', tDetails: 'Details', view: 'View',
  tasksDone: '{done} of {total} tasks done', noTasks: 'No tasks yet', percent: '{p}% complete', noProgress: 'Progress not shown',
  next: 'Next: {n}, {d}', noMilestone: 'No milestone ahead', dates: '{a} to {b}', since: 'from {a}', until: 'until {b}',
  readOnly: 'You can read this project but not change it.',
  addTaskIn: 'Add a task to {c}', addPlaceholder: '＋ Add a task', add: 'Add', moveTo: 'Move to…', moveAria: 'Move “{t}”', moved: '“{t}” moved to {c}',
  due: 'due {d}', low: 'Low', medium: 'Medium', high: 'High', doneMark: '✓ Done', inSprint: 'Sprint: {s}', colEmpty: 'Nothing here',
  attachExisting: 'Add existing tasks…', attachTitle: 'Add existing tasks', attachHint: 'Open tasks that belong to no project.', searchTasks: 'Search tasks',
  attachNone: 'No task without a project matches.', attachGo: 'Add to project', attached: '{n} task(s) added', pickOne: 'Pick at least one task',
  mAdd: '＋ Add milestone', mName: 'Name', mDate: 'Date', overdue: 'Overdue', mDoneAria: 'Mark “{n}” as done', mEmptyTitle: 'No milestones yet', mEmptyText: 'A milestone is a date to reach: a release, an approval, a deadline.',
  mNew: 'New milestone', mEdit: 'Edit milestone', mNeed: 'Write a name and choose a date',
  sAdd: '＋ Add sprint', sName: 'Name', sStart: 'Starts on', sEnd: 'Ends on', current: 'Current', unassigned: 'Unassigned', sprintOf: 'Sprint of “{t}”', noSprint: 'No sprint',
  sprintCount: '{d} of {t} done', sEmptyTitle: 'No sprints yet', sEmptyText: 'A sprint is a time box: add one, then give it tasks from the board.', sNew: 'New sprint', sEdit: 'Edit sprint', sNeed: 'Write a name and choose both dates',
  sNoTasks: 'No tasks in this sprint', sEnd2: 'The end cannot be before the start',
  dName: 'Name', dDesc: 'Description', dStatus: 'Status', dStart: 'Starts on', dEnd: 'Ends on', dColumns: 'Board columns (one per line, 2 to 8)',
  dColumnsHint: 'Cards of a column you remove or rename go back to the first column.', dNameHint: 'A new name is written again on the tasks you can change; the others stay with the old name.', needName: 'Write a name', saved: 'Saved',
  create: 'Create', save: 'Save', cancel: 'Cancel', close: 'Close', edit: 'Edit', remove: 'Remove', share: 'Share…', del: 'Delete project',
  newTitle: 'New project', removeConfirm: 'Remove “{n}”?', delConfirm: 'Delete the project “{n}”? Its tasks stay in Tasks.',
  failed: 'Could not start the UI of the plugin: ', loadFailed: 'Could not load the projects: ',
  tBurndown: 'Burndown', burnScope: 'Burndown of', burnProject: 'The whole project', burnNoDatesTitle: 'No dates to draw against', burnNoDatesText: 'A burndown needs a start and an end: give the project its dates in Details, or pick a sprint.',
  burnNoTasksTitle: 'No tasks to burn down', burnNoTasksText: 'Add tasks to the project (or to the sprint) and the chart draws itself.',
  burnSummary: '{r} of {t} tasks still open, {d} done', burnBehind: 'behind the ideal line by {n}', burnAhead: 'ahead of the ideal line by {n}', burnOnTrack: 'on the ideal line', burnIdeal: 'Ideal', burnActual: 'Open tasks',
  burnUndated: '{n} finished task(s) have no completion day (they were finished before Tasks 0.7.1 kept it): they count as done from the first day.', burnScopeNote: 'The tasks counted are the ones the project has today; the days come from the completion day kept by Tasks.',
}
export type Texts = typeof en
export type L = string

const it: Texts = {
  title: 'Progetti', newProject: '＋ Nuovo progetto', filter: 'Stato',
  all: 'Tutti', planned: 'Pianificati', active: 'Attivi', on_hold: 'In pausa', done: 'Conclusi',
  emptyTitle: 'Ancora nessun progetto', emptyText: 'Crea un progetto per dare a un insieme di attività una lavagna, tappe con date e sprint.', emptyFilter: 'Nessun progetto con questo stato.',
  tasksMissingTitle: 'Installa il plugin Attività', tasksMissingText: 'Progetti organizza le attività del plugin Attività. Installalo (versione 0.6 o successiva), accendilo e torna qui.',
  progressNeedsTasks: 'L’avanzamento richiede il plugin Attività.',
  back: '← Progetti', tBoard: 'Lavagna', tMilestones: 'Tappe', tSprints: 'Sprint', tDetails: 'Dettagli', view: 'Vista',
  tasksDone: '{done} attività su {total} fatte', noTasks: 'Ancora nessuna attività', percent: '{p}% completato', noProgress: 'Avanzamento non mostrato',
  next: 'Prossima: {n}, {d}', noMilestone: 'Nessuna tappa in vista', dates: '{a} – {b}', since: 'dal {a}', until: 'fino al {b}',
  readOnly: 'Puoi leggere questo progetto ma non modificarlo.',
  addTaskIn: 'Aggiungi un’attività a {c}', addPlaceholder: '＋ Aggiungi un’attività', add: 'Aggiungi', moveTo: 'Sposta in…', moveAria: 'Sposta “{t}”', moved: '“{t}” spostata in {c}',
  due: 'scade {d}', low: 'Bassa', medium: 'Media', high: 'Alta', doneMark: '✓ Fatta', inSprint: 'Sprint: {s}', colEmpty: 'Niente qui',
  attachExisting: 'Aggiungi attività esistenti…', attachTitle: 'Aggiungi attività esistenti', attachHint: 'Attività aperte che non appartengono a nessun progetto.', searchTasks: 'Cerca attività',
  attachNone: 'Nessuna attività senza progetto corrisponde.', attachGo: 'Aggiungi al progetto', attached: '{n} attività aggiunte', pickOne: 'Scegli almeno un’attività',
  mAdd: '＋ Aggiungi tappa', mName: 'Nome', mDate: 'Data', overdue: 'In ritardo', mDoneAria: 'Segna “{n}” come fatta', mEmptyTitle: 'Ancora nessuna tappa', mEmptyText: 'Una tappa è una data da raggiungere: un rilascio, un’approvazione, una scadenza.',
  mNew: 'Nuova tappa', mEdit: 'Modifica tappa', mNeed: 'Scrivi un nome e scegli una data',
  sAdd: '＋ Aggiungi sprint', sName: 'Nome', sStart: 'Inizia il', sEnd: 'Finisce il', current: 'In corso', unassigned: 'Non assegnate', sprintOf: 'Sprint di “{t}”', noSprint: 'Nessuno sprint',
  sprintCount: '{d} su {t} fatte', sEmptyTitle: 'Ancora nessuno sprint', sEmptyText: 'Uno sprint è una finestra di tempo: aggiungine uno, poi dagli attività dalla lavagna.', sNew: 'Nuovo sprint', sEdit: 'Modifica sprint', sNeed: 'Scrivi un nome e scegli entrambe le date',
  sNoTasks: 'Nessuna attività in questo sprint', sEnd2: 'La fine non può precedere l’inizio',
  dName: 'Nome', dDesc: 'Descrizione', dStatus: 'Stato', dStart: 'Inizia il', dEnd: 'Finisce il', dColumns: 'Colonne della lavagna (una per riga, da 2 a 8)',
  dColumnsHint: 'Le schede di una colonna rimossa o rinominata tornano nella prima colonna.', dNameHint: 'Un nuovo nome viene riscritto sulle attività che puoi modificare; le altre restano con il vecchio nome.', needName: 'Scrivi un nome', saved: 'Salvato',
  create: 'Crea', save: 'Salva', cancel: 'Annulla', close: 'Chiudi', edit: 'Modifica', remove: 'Rimuovi', share: 'Condividi…', del: 'Elimina progetto',
  newTitle: 'Nuovo progetto', removeConfirm: 'Rimuovere “{n}”?', delConfirm: 'Eliminare il progetto “{n}”? Le sue attività restano in Attività.',
  failed: 'Impossibile avviare la UI del plugin: ', loadFailed: 'Impossibile caricare i progetti: ',
  tBurndown: 'Burndown', burnScope: 'Burndown di', burnProject: 'Tutto il progetto', burnNoDatesTitle: 'Nessuna data su cui disegnare', burnNoDatesText: 'Un burndown ha bisogno di un inizio e di una fine: dai al progetto le sue date in Dettagli, oppure scegli uno sprint.',
  burnNoTasksTitle: 'Nessuna attività da smaltire', burnNoTasksText: 'Aggiungi attività al progetto (o allo sprint) e il grafico si disegna da solo.',
  burnSummary: '{r} attività su {t} ancora aperte, {d} completate', burnBehind: 'indietro rispetto alla linea ideale di {n}', burnAhead: 'avanti rispetto alla linea ideale di {n}', burnOnTrack: 'sulla linea ideale', burnIdeal: 'Ideale', burnActual: 'Attività aperte',
  burnUndated: '{n} attività completate non hanno il giorno di completamento (erano finite prima che Attività lo conservasse): contano come fatte dal primo giorno.', burnScopeNote: 'Le attività contate sono quelle che il progetto ha oggi; i giorni vengono dal giorno di completamento conservato da Attività.',
}
const es: Texts = {
  title: 'Proyectos', newProject: '＋ Nuevo proyecto', filter: 'Estado',
  all: 'Todos', planned: 'Planificados', active: 'Activos', on_hold: 'En pausa', done: 'Concluidos',
  emptyTitle: 'Todavía no hay proyectos', emptyText: 'Crea un proyecto para dar a un conjunto de tareas un tablero, hitos con fechas y sprints.', emptyFilter: 'Ningún proyecto con este estado.',
  tasksMissingTitle: 'Instala el plugin Tareas', tasksMissingText: 'Proyectos organiza las tareas del plugin Tareas. Instálalo (versión 0.6 o posterior), actívalo y vuelve aquí.',
  progressNeedsTasks: 'El avance necesita el plugin Tareas.',
  back: '← Proyectos', tBoard: 'Tablero', tMilestones: 'Hitos', tSprints: 'Sprints', tDetails: 'Detalles', view: 'Vista',
  tasksDone: '{done} de {total} tareas hechas', noTasks: 'Todavía no hay tareas', percent: '{p}% completado', noProgress: 'Avance no mostrado',
  next: 'Próximo: {n}, {d}', noMilestone: 'Ningún hito a la vista', dates: '{a} – {b}', since: 'desde el {a}', until: 'hasta el {b}',
  readOnly: 'Puedes leer este proyecto pero no cambiarlo.',
  addTaskIn: 'Añadir una tarea a {c}', addPlaceholder: '＋ Añadir una tarea', add: 'Añadir', moveTo: 'Mover a…', moveAria: 'Mover “{t}”', moved: '“{t}” movida a {c}',
  due: 'vence {d}', low: 'Baja', medium: 'Media', high: 'Alta', doneMark: '✓ Hecha', inSprint: 'Sprint: {s}', colEmpty: 'Nada aquí',
  attachExisting: 'Añadir tareas existentes…', attachTitle: 'Añadir tareas existentes', attachHint: 'Tareas abiertas que no pertenecen a ningún proyecto.', searchTasks: 'Buscar tareas',
  attachNone: 'Ninguna tarea sin proyecto coincide.', attachGo: 'Añadir al proyecto', attached: '{n} tarea(s) añadidas', pickOne: 'Elige al menos una tarea',
  mAdd: '＋ Añadir hito', mName: 'Nombre', mDate: 'Fecha', overdue: 'Vencido', mDoneAria: 'Marcar “{n}” como hecho', mEmptyTitle: 'Todavía no hay hitos', mEmptyText: 'Un hito es una fecha que alcanzar: una versión, una aprobación, un plazo.',
  mNew: 'Nuevo hito', mEdit: 'Editar hito', mNeed: 'Escribe un nombre y elige una fecha',
  sAdd: '＋ Añadir sprint', sName: 'Nombre', sStart: 'Empieza el', sEnd: 'Termina el', current: 'En curso', unassigned: 'Sin asignar', sprintOf: 'Sprint de “{t}”', noSprint: 'Sin sprint',
  sprintCount: '{d} de {t} hechas', sEmptyTitle: 'Todavía no hay sprints', sEmptyText: 'Un sprint es una ventana de tiempo: añade uno y dale tareas desde el tablero.', sNew: 'Nuevo sprint', sEdit: 'Editar sprint', sNeed: 'Escribe un nombre y elige las dos fechas',
  sNoTasks: 'No hay tareas en este sprint', sEnd2: 'El final no puede ser anterior al inicio',
  dName: 'Nombre', dDesc: 'Descripción', dStatus: 'Estado', dStart: 'Empieza el', dEnd: 'Termina el', dColumns: 'Columnas del tablero (una por línea, de 2 a 8)',
  dColumnsHint: 'Las tarjetas de una columna eliminada o renombrada vuelven a la primera columna.', dNameHint: 'Un nombre nuevo se vuelve a escribir en las tareas que puedes cambiar; las demás se quedan con el nombre anterior.', needName: 'Escribe un nombre', saved: 'Guardado',
  create: 'Crear', save: 'Guardar', cancel: 'Cancelar', close: 'Cerrar', edit: 'Editar', remove: 'Quitar', share: 'Compartir…', del: 'Eliminar proyecto',
  newTitle: 'Nuevo proyecto', removeConfirm: '¿Quitar “{n}”?', delConfirm: '¿Eliminar el proyecto “{n}”? Sus tareas siguen en Tareas.',
  failed: 'No se pudo iniciar la interfaz del plugin: ', loadFailed: 'No se pudieron cargar los proyectos: ',
  tBurndown: 'Burndown', burnScope: 'Burndown de', burnProject: 'Todo el proyecto', burnNoDatesTitle: 'No hay fechas sobre las que dibujar', burnNoDatesText: 'Un burndown necesita un inicio y un final: da al proyecto sus fechas en Detalles, o elige un sprint.',
  burnNoTasksTitle: 'No hay tareas que quemar', burnNoTasksText: 'Añade tareas al proyecto (o al sprint) y el gráfico se dibuja solo.',
  burnSummary: '{r} de {t} tareas aún abiertas, {d} hechas', burnBehind: 'por detrás de la línea ideal en {n}', burnAhead: 'por delante de la línea ideal en {n}', burnOnTrack: 'sobre la línea ideal', burnIdeal: 'Ideal', burnActual: 'Tareas abiertas',
  burnUndated: '{n} tarea(s) terminadas no tienen día de finalización (se terminaron antes de que Tareas lo guardara): cuentan como hechas desde el primer día.', burnScopeNote: 'Las tareas contadas son las que el proyecto tiene hoy; los días vienen del día de finalización que guarda Tareas.',
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
