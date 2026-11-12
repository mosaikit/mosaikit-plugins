// The quick-add line: «Call Ana tomorrow !high #work @phone every week» becomes a task. Pure functions, no DOM.
// Words understood (English, Italian and Spanish): today, tomorrow, the days of the week, «in N days», an ISO date;
// !high !medium !low; #project; @label; every day / week / month.

export interface Parsed {
  title: string
  due?: string
  priority?: 'low' | 'medium' | 'high'
  project?: string
  labels: string[]
  repeat?: 'daily' | 'weekly' | 'monthly'
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const plus = (from: Date, n: number) => new Date(from.getFullYear(), from.getMonth(), from.getDate() + n)

const TODAY = ['today', 'oggi', 'hoy']
const TOMORROW = ['tomorrow', 'domani', 'mañana', 'manana']
// index = Date#getDay(): Sunday 0
const DAYS: string[][] = [
  ['sunday', 'sun', 'domenica', 'dom', 'domingo'],
  ['monday', 'mon', 'lunedì', 'lunedi', 'lun', 'lunes'],
  ['tuesday', 'tue', 'martedì', 'martedi', 'mar', 'martes'],
  ['wednesday', 'wed', 'mercoledì', 'mercoledi', 'mer', 'miércoles', 'miercoles'],
  ['thursday', 'thu', 'giovedì', 'giovedi', 'gio', 'jueves'],
  ['friday', 'fri', 'venerdì', 'venerdi', 'ven', 'viernes'],
  ['saturday', 'sat', 'sabato', 'sab', 'sábado', 'sabado'],
]
const PRIORITY: Record<string, 'low' | 'medium' | 'high'> = { high: 'high', h: 'high', alta: 'high', alto: 'high', medium: 'medium', med: 'medium', m: 'medium', media: 'medium', medio: 'medium', low: 'low', l: 'low', bassa: 'low', bajo: 'low', baja: 'low' }
const REPEAT: [RegExp, 'daily' | 'weekly' | 'monthly'][] = [
  [/\b(?:every day|daily|ogni giorno|ogni giornata|cada día|cada dia|diario)\b/i, 'daily'],
  [/\b(?:every week|weekly|ogni settimana|cada semana|semanal)\b/i, 'weekly'],
  [/\b(?:every month|monthly|ogni mese|cada mes|mensual)\b/i, 'monthly'],
]

/** The next date (after `from`, never `from` itself) that falls on `weekday` (0 = Sunday). */
export function nextWeekday(from: Date, weekday: number): Date {
  const diff = ((weekday - from.getDay() + 7) % 7) || 7
  return plus(from, diff)
}

export function parseQuickAdd(input: string, now: Date = new Date()): Parsed {
  let text = ` ${input.trim()} `
  const out: Parsed = { title: '', labels: [] }
  const take = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    const m = re.exec(text)
    if (!m) return false
    fn(m)
    text = text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)
    return true
  }
  for (const [re, kind] of REPEAT) if (!out.repeat && take(re, () => (out.repeat = kind))) break
  // only a known word after «!» is a priority; any other stays in the title
  const pm = [...text.matchAll(/\s!([\p{L}]+)(?=\s)/gu)].find((m) => PRIORITY[m[1]!.toLowerCase()])
  if (pm) {
    out.priority = PRIORITY[pm[1]!.toLowerCase()]
    text = text.slice(0, pm.index) + ' ' + text.slice((pm.index ?? 0) + pm[0].length)
  }
  while (take(/\s#([\p{L}\p{N}_-]+)(?=\s)/u, (m) => !out.project && (out.project = m[1]))) {
    /* only the first project counts */
  }
  while (take(/\s@([\p{L}\p{N}_-]+)(?=\s)/u, (m) => out.labels.push(m[1]!))) {
    /* every @word is a label */
  }
  const date = (d: Date) => (out.due = iso(d))
  take(/\s(\d{4}-\d{2}-\d{2})(?=\s)/, (m) => (out.due = m[1]))
  if (!out.due) {
    take(/\s(?:in|tra|fra|en)\s+(\d{1,3})\s+(?:days?|giorni|giorno|días|dias|día|dia)(?=\s)/i, (m) => date(plus(now, Number(m[1]))))
  }
  if (!out.due) {
    const words = text.toLowerCase()
    const hit = (list: string[]) => list.find((w) => new RegExp(`\\s${w}(?=\\s)`, 'i').test(words))
    const tom = hit(TOMORROW)
    const tod = hit(TODAY)
    if (tom) take(new RegExp(`\\s${tom}(?=\\s)`, 'i'), () => date(plus(now, 1)))
    else if (tod) take(new RegExp(`\\s${tod}(?=\\s)`, 'i'), () => date(now))
    else {
      for (let wd = 0; wd < 7 && !out.due; wd++) {
        const w = hit(DAYS[wd]!)
        if (w) take(new RegExp(`\\s${w}(?=\\s)`, 'i'), () => date(nextWeekday(now, wd)))
      }
    }
  }
  out.title = text.replace(/\s+/g, ' ').trim()
  return out
}

/** The values to create the task with (empty fields are left out). */
export function toValues(p: Parsed): Record<string, string | boolean> {
  const v: Record<string, string | boolean> = { title: p.title, done: false }
  if (p.due) v.due = p.due
  if (p.priority) v.priority = p.priority
  if (p.project) v.project = p.project
  if (p.labels.length) v.labels = p.labels.join(',')
  if (p.repeat) v.repeat = p.repeat
  return v
}
