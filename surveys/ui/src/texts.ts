import type { Msk } from '@mosaikit/plugin-api'
// The texts of the Surveys UI (English by default; Italian and Spanish follow the language of the host).
const en = {
  title: 'Surveys', newSurvey: '＋ New survey', filter: 'Show', open: 'Open', closed: 'Closed', all: 'All',
  emptyTitle: 'No surveys yet', emptyText: 'Build a survey, share it with the people who should answer and read the results per question. Switch on quiz mode to score the answers.',
  emptyFilter: 'No surveys here. Try another filter.',
  stateOpen: 'Open', stateClosed: 'Closed', quizChip: 'Quiz', questionsN: '{n} questions', questionsOne: '1 question', noQuestions: 'No questions yet', answered: 'Answered',
  responsesN: '{n} responses', responsesOne: '1 response', closesOn: 'closes on {d}', by: 'by {n}',
  take: 'Answer', results: 'Results', myResult: 'My result', edit: 'Edit', share: 'Share…', remove: 'Delete', removeConfirm: 'Delete the survey “{n}” and all its answers?',
  back: '← Surveys', cancel: 'Cancel', close: 'Close', save: 'Save', create: 'Create', failed: 'Could not start the UI of the plugin: ', loadFailed: 'Could not load the surveys: ',
  // the builder
  newTitle: 'New survey', editTitle: 'Edit survey', fTitle: 'Title', fIntro: 'Introduction', fQuiz: 'Quiz: score the answers', fPass: 'Pass mark (%)', fCloses: 'Closes on', fClosed: 'Closed (no more answers)',
  fQuestions: 'Questions', addQuestion: '＋ Add question', questionN: 'Question {n}', fQuestionText: 'Question {n}: text', fKind: 'Question {n}: type', fRequired: 'Required', fPoints: 'Points',
  kChoice: 'One answer', kMulti: 'Several answers', kText: 'Free text', kScale: 'Scale 1 to 5',
  optionN: 'Question {n}, option {o}', addOption: 'Add option', removeOption: 'Remove option {o} of question {n}', correctOption: 'Option {o} of question {n} is correct',
  moveUp: 'Move question {n} up', moveDown: 'Move question {n} down', removeQuestion: 'Remove question {n}', correctHint: 'Tick the correct answer', correctHintMulti: 'Tick all the correct answers',
  needTitle: 'Write a title', needText: 'Question {n} needs a text', needOptions: 'Question {n} needs from 2 to 10 options', needOptionText: 'Question {n}: every option needs a text',
  needCorrect: 'Question {n} gives points: mark the correct answer', oneCorrect: 'Question {n} has one answer, so only one can be correct', tooMany: 'A survey has at most 40 questions', badPoints: 'Question {n}: the points are from 0 to 100',
  noQuestionsBuilder: 'No questions yet. Add the first one.',
  noKeyWarn: 'This quiz has no correct answers marked: every answer will score 0. Tick the correct options.',
  // taking
  of: 'Question {n} of {t}', progress: 'Answered {d} of {t}', requiredMark: 'required', optionalMark: 'optional', scaleLow: '1 = lowest', scaleHigh: '5 = highest', scaleN: '{n} of 5',
  textAnswer: 'Your answer', submit: 'Submit', needAnswer: 'Question {n} needs an answer', closedNotice: 'This survey is closed.', answeredNotice: 'You have already answered this survey.',
  // outcome
  thanks: 'Thank you', thanksText: 'Your answers were sent.', yourScore: 'Your score', scoreOf: '{s} of {m} points ({p}%)', passed: 'Passed', notPassed: 'Not passed', passMark: 'Pass mark: {p}%',
  right: 'Correct', wrong: 'Wrong', correctWas: 'Correct answer: {a}', review: 'Your answers', backToList: 'Back to the surveys', noMine: 'You have not answered this survey yet.', mineAt: 'Answered on {d}',
  // results
  resultsOf: 'Results', responsesTotal: 'Responses', noResponses: 'Nobody has answered yet.', answeredBy: '{a} of {t} answered', average: 'Average', noTextAnswers: 'No text answers.', respondents: 'Respondents',
  colName: 'Name', colWhen: 'Submitted', colScore: 'Score', exportCsv: 'Export CSV', csvName: 'Respondent', csvWhen: 'Submitted at', csvScore: 'Score', csvMax: 'Max score', csvPercent: 'Percent', correctMark: '(correct)',
  exported: 'CSV downloaded',
  fAnonymous: 'Anonymous', anonNote: 'Nothing links an answer to a person, not even for you. It cannot be turned off later.', anonResults: 'This survey is anonymous: the results show answers, never people.', colResponse: 'Response', responseN: 'Response {n}',
  fShowIf: 'Question {n}: when to show it', showAlways: 'Always shown', showIfQ: 'Only if question {n} is answered', showIfLabel: 'Show this question', showIfValues: 'Question {n}: show it for these answers', badBranch: 'Question {n}: choose an earlier question with options or a scale, and at least one answer, for the condition',
}
export type Texts = typeof en
export type L = string

const it: Texts = {
  title: 'Sondaggi', newSurvey: '＋ Nuovo sondaggio', filter: 'Mostra', open: 'Aperti', closed: 'Chiusi', all: 'Tutti',
  emptyTitle: 'Ancora nessun sondaggio', emptyText: 'Costruisci un sondaggio, condividilo con chi deve rispondere e leggi i risultati per domanda. Attiva la modalità quiz per dare un punteggio alle risposte.',
  emptyFilter: 'Nessun sondaggio qui. Prova un altro filtro.',
  stateOpen: 'Aperto', stateClosed: 'Chiuso', quizChip: 'Quiz', questionsN: '{n} domande', questionsOne: '1 domanda', noQuestions: 'Ancora nessuna domanda', answered: 'Risposto',
  responsesN: '{n} risposte', responsesOne: '1 risposta', closesOn: 'si chiude il {d}', by: 'di {n}',
  take: 'Rispondi', results: 'Risultati', myResult: 'Il mio risultato', edit: 'Modifica', share: 'Condividi…', remove: 'Elimina', removeConfirm: 'Eliminare il sondaggio “{n}” e tutte le sue risposte?',
  back: '← Sondaggi', cancel: 'Annulla', close: 'Chiudi', save: 'Salva', create: 'Crea', failed: 'Impossibile avviare la UI del plugin: ', loadFailed: 'Impossibile caricare i sondaggi: ',
  newTitle: 'Nuovo sondaggio', editTitle: 'Modifica sondaggio', fTitle: 'Titolo', fIntro: 'Introduzione', fQuiz: 'Quiz: dai un punteggio alle risposte', fPass: 'Soglia di superamento (%)', fCloses: 'Si chiude il', fClosed: 'Chiuso (niente più risposte)',
  fQuestions: 'Domande', addQuestion: '＋ Aggiungi domanda', questionN: 'Domanda {n}', fQuestionText: 'Domanda {n}: testo', fKind: 'Domanda {n}: tipo', fRequired: 'Obbligatoria', fPoints: 'Punti',
  kChoice: 'Una risposta', kMulti: 'Più risposte', kText: 'Testo libero', kScale: 'Scala da 1 a 5',
  optionN: 'Domanda {n}, opzione {o}', addOption: 'Aggiungi opzione', removeOption: 'Rimuovi l’opzione {o} della domanda {n}', correctOption: 'L’opzione {o} della domanda {n} è corretta',
  moveUp: 'Sposta su la domanda {n}', moveDown: 'Sposta giù la domanda {n}', removeQuestion: 'Rimuovi la domanda {n}', correctHint: 'Spunta la risposta corretta', correctHintMulti: 'Spunta tutte le risposte corrette',
  needTitle: 'Scrivi un titolo', needText: 'La domanda {n} ha bisogno di un testo', needOptions: 'La domanda {n} ha bisogno da 2 a 10 opzioni', needOptionText: 'Domanda {n}: ogni opzione ha bisogno di un testo',
  needCorrect: 'La domanda {n} dà dei punti: segna la risposta corretta', oneCorrect: 'La domanda {n} ha una sola risposta, quindi può essere corretta una sola opzione', tooMany: 'Un sondaggio ha al massimo 40 domande', badPoints: 'Domanda {n}: i punti vanno da 0 a 100',
  noQuestionsBuilder: 'Ancora nessuna domanda. Aggiungi la prima.',
  noKeyWarn: 'Questo quiz non ha risposte corrette segnate: ogni risposta varrà 0. Spunta le opzioni corrette.',
  of: 'Domanda {n} di {t}', progress: 'Risposto a {d} di {t}', requiredMark: 'obbligatoria', optionalMark: 'facoltativa', scaleLow: '1 = minimo', scaleHigh: '5 = massimo', scaleN: '{n} su 5',
  textAnswer: 'La tua risposta', submit: 'Invia', needAnswer: 'La domanda {n} richiede una risposta', closedNotice: 'Questo sondaggio è chiuso.', answeredNotice: 'Hai già risposto a questo sondaggio.',
  thanks: 'Grazie', thanksText: 'Le tue risposte sono state inviate.', yourScore: 'Il tuo punteggio', scoreOf: '{s} punti su {m} ({p}%)', passed: 'Superato', notPassed: 'Non superato', passMark: 'Soglia: {p}%',
  right: 'Corretta', wrong: 'Sbagliata', correctWas: 'Risposta corretta: {a}', review: 'Le tue risposte', backToList: 'Torna ai sondaggi', noMine: 'Non hai ancora risposto a questo sondaggio.', mineAt: 'Risposto il {d}',
  resultsOf: 'Risultati', responsesTotal: 'Risposte', noResponses: 'Nessuno ha ancora risposto.', answeredBy: '{a} su {t} hanno risposto', average: 'Media', noTextAnswers: 'Nessuna risposta di testo.', respondents: 'Partecipanti',
  colName: 'Nome', colWhen: 'Inviato', colScore: 'Punteggio', exportCsv: 'Esporta CSV', csvName: 'Partecipante', csvWhen: 'Inviato il', csvScore: 'Punteggio', csvMax: 'Punteggio massimo', csvPercent: 'Percentuale', correctMark: '(corretta)',
  exported: 'CSV scaricato',
  fAnonymous: 'Anonimo', anonNote: 'Niente collega una risposta a una persona, nemmeno per te. Non si può disattivare dopo.', anonResults: 'Questo questionario è anonimo: i risultati mostrano le risposte, mai le persone.', colResponse: 'Risposta', responseN: 'Risposta {n}',
  fShowIf: 'Domanda {n}: quando mostrarla', showAlways: 'Sempre visibile', showIfQ: 'Solo se la domanda {n} ha risposta', showIfLabel: 'Mostra questa domanda', showIfValues: 'Domanda {n}: mostrala per queste risposte', badBranch: 'Domanda {n}: scegli per la condizione una domanda precedente con opzioni o una scala, e almeno una risposta',
}
const es: Texts = {
  title: 'Encuestas', newSurvey: '＋ Nueva encuesta', filter: 'Mostrar', open: 'Abiertas', closed: 'Cerradas', all: 'Todas',
  emptyTitle: 'Todavía no hay encuestas', emptyText: 'Crea una encuesta, compártela con quienes deban responder y lee los resultados por pregunta. Activa el modo cuestionario para puntuar las respuestas.',
  emptyFilter: 'No hay encuestas aquí. Prueba otro filtro.',
  stateOpen: 'Abierta', stateClosed: 'Cerrada', quizChip: 'Cuestionario', questionsN: '{n} preguntas', questionsOne: '1 pregunta', noQuestions: 'Todavía no hay preguntas', answered: 'Respondida',
  responsesN: '{n} respuestas', responsesOne: '1 respuesta', closesOn: 'se cierra el {d}', by: 'de {n}',
  take: 'Responder', results: 'Resultados', myResult: 'Mi resultado', edit: 'Editar', share: 'Compartir…', remove: 'Eliminar', removeConfirm: '¿Eliminar la encuesta “{n}” y todas sus respuestas?',
  back: '← Encuestas', cancel: 'Cancelar', close: 'Cerrar', save: 'Guardar', create: 'Crear', failed: 'No se pudo iniciar la interfaz del plugin: ', loadFailed: 'No se pudieron cargar las encuestas: ',
  newTitle: 'Nueva encuesta', editTitle: 'Editar encuesta', fTitle: 'Título', fIntro: 'Introducción', fQuiz: 'Cuestionario: puntuar las respuestas', fPass: 'Nota de aprobado (%)', fCloses: 'Se cierra el', fClosed: 'Cerrada (sin más respuestas)',
  fQuestions: 'Preguntas', addQuestion: '＋ Añadir pregunta', questionN: 'Pregunta {n}', fQuestionText: 'Pregunta {n}: texto', fKind: 'Pregunta {n}: tipo', fRequired: 'Obligatoria', fPoints: 'Puntos',
  kChoice: 'Una respuesta', kMulti: 'Varias respuestas', kText: 'Texto libre', kScale: 'Escala del 1 al 5',
  optionN: 'Pregunta {n}, opción {o}', addOption: 'Añadir opción', removeOption: 'Quitar la opción {o} de la pregunta {n}', correctOption: 'La opción {o} de la pregunta {n} es correcta',
  moveUp: 'Subir la pregunta {n}', moveDown: 'Bajar la pregunta {n}', removeQuestion: 'Quitar la pregunta {n}', correctHint: 'Marca la respuesta correcta', correctHintMulti: 'Marca todas las respuestas correctas',
  needTitle: 'Escribe un título', needText: 'La pregunta {n} necesita un texto', needOptions: 'La pregunta {n} necesita de 2 a 10 opciones', needOptionText: 'Pregunta {n}: cada opción necesita un texto',
  needCorrect: 'La pregunta {n} da puntos: marca la respuesta correcta', oneCorrect: 'La pregunta {n} tiene una sola respuesta, así que solo una opción puede ser correcta', tooMany: 'Una encuesta tiene como máximo 40 preguntas', badPoints: 'Pregunta {n}: los puntos van de 0 a 100',
  noQuestionsBuilder: 'Todavía no hay preguntas. Añade la primera.',
  noKeyWarn: 'Este cuestionario no tiene respuestas correctas marcadas: cada respuesta valdrá 0. Marca las opciones correctas.',
  of: 'Pregunta {n} de {t}', progress: 'Respondidas {d} de {t}', requiredMark: 'obligatoria', optionalMark: 'opcional', scaleLow: '1 = mínimo', scaleHigh: '5 = máximo', scaleN: '{n} de 5',
  textAnswer: 'Tu respuesta', submit: 'Enviar', needAnswer: 'La pregunta {n} necesita una respuesta', closedNotice: 'Esta encuesta está cerrada.', answeredNotice: 'Ya has respondido a esta encuesta.',
  thanks: 'Gracias', thanksText: 'Tus respuestas se han enviado.', yourScore: 'Tu puntuación', scoreOf: '{s} de {m} puntos ({p}%)', passed: 'Aprobado', notPassed: 'No aprobado', passMark: 'Nota de aprobado: {p}%',
  right: 'Correcta', wrong: 'Incorrecta', correctWas: 'Respuesta correcta: {a}', review: 'Tus respuestas', backToList: 'Volver a las encuestas', noMine: 'Todavía no has respondido a esta encuesta.', mineAt: 'Respondida el {d}',
  resultsOf: 'Resultados', responsesTotal: 'Respuestas', noResponses: 'Todavía nadie ha respondido.', answeredBy: '{a} de {t} han respondido', average: 'Media', noTextAnswers: 'No hay respuestas de texto.', respondents: 'Participantes',
  colName: 'Nombre', colWhen: 'Enviado', colScore: 'Puntuación', exportCsv: 'Exportar CSV', csvName: 'Participante', csvWhen: 'Enviado el', csvScore: 'Puntuación', csvMax: 'Puntuación máxima', csvPercent: 'Porcentaje', correctMark: '(correcta)',
  exported: 'CSV descargado',
  fAnonymous: 'Anónima', anonNote: 'Nada vincula una respuesta con una persona, ni siquiera para ti. No se puede desactivar después.', anonResults: 'Esta encuesta es anónima: los resultados muestran respuestas, nunca personas.', colResponse: 'Respuesta', responseN: 'Respuesta {n}',
  fShowIf: 'Pregunta {n}: cuándo mostrarla', showAlways: 'Siempre visible', showIfQ: 'Solo si la pregunta {n} tiene respuesta', showIfLabel: 'Mostrar esta pregunta', showIfValues: 'Pregunta {n}: mostrarla con estas respuestas', badBranch: 'Pregunta {n}: elige para la condición una pregunta anterior con opciones o una escala, y al menos una respuesta',
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
