// What the Surveys UI decides, with no DOM: the questions of a survey, the checks of the builder, how far a person got,
// the bars of the results and the CSV of the answers.

export type Kind = 'choice' | 'multi' | 'text' | 'scale'
export const KINDS: Kind[] = ['choice', 'multi', 'text', 'scale']
export const MAX_QUESTIONS = 40
export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 10
export const MAX_TEXT_ANSWER = 1000

export interface Question {
  id: string
  text: string
  kind: Kind
  options: string[]
  correct: number[]
  points: number
  required: boolean
}

export type Answer = number | number[] | string

let counter = 0
/** An id for a question: unique in the survey, short, made of letters and digits. */
export function freshId(): string {
  counter += 1
  return 'q' + Date.now().toString(36) + counter.toString(36) + Math.random().toString(36).slice(2, 5)
}

export function hasOptions(k: Kind): boolean {
  return k === 'choice' || k === 'multi'
}

/** A new empty question of a kind (two empty options for the kinds that have options). */
export function newQuestion(kind: Kind = 'choice', id: string = freshId()): Question {
  return { id, text: '', kind, options: hasOptions(kind) ? ['', ''] : [], correct: [], points: 0, required: false }
}

/** The questions stored in a survey (a JSON text), forgiving: whatever is not a valid question is dropped. */
export function parseQuestions(raw: unknown): Question[] {
  let data: unknown
  try {
    data = typeof raw === 'string' && raw.trim() ? JSON.parse(raw) : []
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  const out: Question[] = []
  for (const q of data) {
    if (!q || typeof q !== 'object') continue
    const o = q as Record<string, unknown>
    const kind = KINDS.includes(o.kind as Kind) ? (o.kind as Kind) : null
    if (!kind || typeof o.id !== 'string') continue
    out.push({
      id: o.id,
      text: String(o.text ?? ''),
      kind,
      options: Array.isArray(o.options) ? o.options.map(String) : [],
      correct: Array.isArray(o.correct) ? o.correct.filter((x): x is number => Number.isInteger(x)) : [],
      points: Number.isInteger(o.points) ? (o.points as number) : 0,
      required: o.required === true,
    })
  }
  return out
}

/** What the builder sends: texts trimmed, no correct answers or points outside a quiz, options only where they belong. */
export function cleanQuestions(list: Question[], quiz: boolean): Question[] {
  return list.map((q) => {
    const options = hasOptions(q.kind) ? q.options.map((o) => o.trim()) : []
    const correct = quiz && hasOptions(q.kind) ? [...new Set(q.correct)].filter((i) => i < options.length).sort((a, b) => a - b) : []
    return { ...q, text: q.text.trim(), options, correct, points: quiz && hasOptions(q.kind) ? q.points : 0 }
  })
}

/** The answer key of the builder state: question id to correct option indexes, only for the questions that have some (none outside a quiz). */
export function keyOf(list: Question[], quiz: boolean): Record<string, number[]> {
  const key: Record<string, number[]> = {}
  for (const q of cleanQuestions(list, quiz)) if (q.correct.length) key[q.id] = q.correct
  return key
}

/** The questions as they are stored: the same, with no correct answers (those go to the key apart). */
export function stripKey(list: Question[]): Omit<Question, 'correct'>[] {
  return list.map(({ correct: _correct, ...rest }) => rest)
}

/** Puts a key (from `surveys.get_key`) back into the questions to edit. */
export function mergeKey(list: Question[], key: Record<string, number[]> | null | undefined): Question[] {
  return list.map((q) => ({ ...q, correct: hasOptions(q.kind) && key?.[q.id] ? [...key[q.id]] : [] }))
}

export type Problem = { index: number; key: 'needText' | 'needOptions' | 'needOptionText' | 'needCorrect' | 'oneCorrect' | 'tooMany' | 'badPoints' }

/** The first thing wrong with the questions (the hook of the plugin says the same), or null. `index` is 0-based. */
export function firstProblem(list: Question[], quiz: boolean): Problem | null {
  if (list.length > MAX_QUESTIONS) return { index: MAX_QUESTIONS, key: 'tooMany' }
  const clean = cleanQuestions(list, quiz)
  for (let i = 0; i < clean.length; i++) {
    const q = clean[i]
    if (!q.text) return { index: i, key: 'needText' }
    if (hasOptions(q.kind)) {
      if (q.options.length < MIN_OPTIONS || q.options.length > MAX_OPTIONS) return { index: i, key: 'needOptions' }
      if (q.options.some((o) => !o)) return { index: i, key: 'needOptionText' }
      if (quiz) {
        if (!Number.isInteger(q.points) || q.points < 0 || q.points > 100) return { index: i, key: 'badPoints' }
        if (q.kind === 'choice' && q.correct.length > 1) return { index: i, key: 'oneCorrect' }
        if (q.points > 0 && q.correct.length === 0) return { index: i, key: 'needCorrect' }
      }
    }
  }
  return null
}

/** Moves the question `i` by `dir` (-1 up, +1 down); a new list, the same one when it cannot move. */
export function moveQuestion<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return list
  const out = [...list]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

/** Removes the option `k` of a question and keeps `correct` pointing at the same options. */
export function removeOption(q: Question, k: number): Question {
  return {
    ...q,
    options: q.options.filter((_, i) => i !== k),
    correct: q.correct.filter((i) => i !== k).map((i) => (i > k ? i - 1 : i)),
  }
}

/** Whether an answer counts as given (an empty text, an empty selection or nothing is not an answer). */
export function isAnswered(a: Answer | undefined): boolean {
  if (a === undefined) return false
  if (typeof a === 'string') return a.trim().length > 0
  if (Array.isArray(a)) return a.length > 0
  return true
}

/** How many of the questions are answered, and the index of the first required one that is not (or -1). */
export function progressOf(list: Question[], answers: Record<string, Answer>): { done: number; total: number; firstMissing: number } {
  let done = 0
  let firstMissing = -1
  list.forEach((q, i) => {
    if (isAnswered(answers[q.id])) done += 1
    else if (q.required && firstMissing < 0) firstMissing = i
  })
  return { done, total: list.length, firstMissing }
}

/** The answers as the command wants them: only the given ones. */
export function answersToSend(list: Question[], answers: Record<string, Answer>): Record<string, Answer> {
  const out: Record<string, Answer> = {}
  for (const q of list) {
    const a = answers[q.id]
    if (isAnswered(a)) out[q.id] = typeof a === 'string' ? a.trim() : a
  }
  return out
}

/** A whole percentage of `n` out of `total` (0 when there is no total). */
export function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0
}

/** A survey is open when it is not closed by hand and its closing day (YYYY-MM-DD) is not past. */
export function isOpen(s: { closed: boolean; closesOn: string }, today: string): boolean {
  return !s.closed && !(s.closesOn && s.closesOn < today)
}

/** Today as YYYY-MM-DD in the local time of the person. */
export function todayLocal(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

// ---------------------------------------------------------------------------------------------------------------- CSV

/** One cell of a CSV: a text starting with = + - @ (or a tab or return) gets a leading quote so a spreadsheet never runs it
 * as a formula; a cell with a comma, a quote or a line break is quoted and its quotes doubled. */
export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  let s = String(v)
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export interface Respondent {
  name: string
  at: string
  score: number | null
  max_score: number | null
  percent: number | null
  answers: Record<string, Answer>
}

/** The text of an answer for a table or a CSV: the options by their words, joined by a semicolon. */
export function answerText(q: Question, a: Answer | undefined): string {
  if (a === undefined) return ''
  if (q.kind === 'choice') return typeof a === 'number' ? (q.options[a] ?? '') : ''
  if (q.kind === 'multi') return Array.isArray(a) ? a.map((i) => q.options[i] ?? '').join('; ') : ''
  return String(a)
}

/** The CSV of the results: a header (respondent, date, the score of a quiz, one column per question) and one row per respondent. */
export function buildCsv(
  questions: Question[],
  people: Respondent[],
  quiz: boolean,
  head: { respondent: string; submitted: string; score: string; max: string; percent: string },
): string {
  const header = [head.respondent, head.submitted, ...(quiz ? [head.score, head.max, head.percent] : []), ...questions.map((q) => q.text)]
  const rows = people.map((p) => [
    p.name,
    p.at,
    ...(quiz ? [p.score, p.max_score, p.percent] : []),
    ...questions.map((q) => answerText(q, p.answers[q.id])),
  ])
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
