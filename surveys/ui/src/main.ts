// UI of the Surveys plugin: the list of surveys, the builder of the questions, answering a survey (with the score of a quiz),
// the results with a bar per option and the export to CSV. Every text is drawn as a DOM text node (never HTML).
import '@mosaikit/plugin-api/style.css'
import './surveys.css'
import {
  confirmDialog,
  connect,
  dateField,
  dialog,
  el,
  emptyState,
  errText,
  progress,
  segmented,
  skeleton,
  toast,
  type Msk,
  type Row,
} from '@mosaikit/plugin-api'
import {
  KINDS,
  MAX_OPTIONS,
  MAX_QUESTIONS,
  MIN_OPTIONS,
  MAX_TEXT_ANSWER,
  answersToSend,
  buildCsv,
  cleanQuestions,
  firstProblem,
  hasOptions,
  isOpen,
  keyOf,
  mergeKey,
  stripKey,
  moveQuestion,
  newQuestion,
  parseQuestions,
  pct,
  progressOf,
  removeOption,
  todayLocal,
  type Answer,
  type Kind,
  type Question,
  type Respondent,
} from './logic.ts'
import { TEXTS, langOf, sub, type Texts } from './texts.ts'

const app = document.getElementById('app')!

interface Survey {
  id: string
  row: Row
  title: string
  intro: string
  questions: Question[]
  quiz: boolean
  pass: string
  closesOn: string
  closed: boolean
}
interface Overview {
  mine: string[]
  counts: Record<string, number>
}
interface Outcome {
  at?: string
  score?: number
  max_score?: number
  percent?: number
  passed?: boolean | null
}
interface Submitted extends Outcome {
  quiz: boolean
  review?: { id: string; right: boolean | null; correct: number[] | null }[]
}
interface Aggregate {
  id: string
  kind: Kind
  answered: number
  counts?: number[]
  average?: number | null
  texts?: string[]
}
interface Results {
  full: boolean
  responded: boolean
  mine: Outcome | null
  total?: number
  key?: Record<string, number[]>
  questions?: Aggregate[]
  respondents?: { id: string; name: string; at: string; score: number | null; max_score: number | null; percent: number | null; passed: boolean | null; answers: Record<string, Answer> }[]
}

type View = { kind: 'list' } | { kind: 'take'; s: Survey } | { kind: 'results'; s: Survey } | { kind: 'done'; s: Survey; out: Submitted }

function mount(msk: Msk) {
  document.documentElement.classList.add('msk-fill')
  let lang = langOf(msk.context?.lang)
  const tr = (): Texts => TEXTS[lang]
  const api = msk.crud('surveys')
  let surveys: Survey[] = []
  let over: Overview = { mine: [], counts: {} }
  let filter: 'open' | 'closed' | 'all' = 'open'
  let view: View = { kind: 'list' }

  const fail = (e: unknown) => toast(errText(e, msk.context?.lang), { tone: 'err', ms: 6000 })
  const head = el('header', { class: 'sv-head' })
  // focusable so a keyboard user can scroll it even when a page (the results) has nothing else to focus
  const body = el('div', { class: 'sv-body', tabindex: '0', role: 'region', 'aria-label': tr().title })
  app.replaceChildren(el('div', { class: 'sv' }, head, body))

  const day = (d: string) => (d ? new Date(d + 'T00:00:00').toLocaleDateString(msk.context?.lang || undefined, { dateStyle: 'medium' }) : '')
  const btn = (label: string, cls = 'msk-btn', onClick?: () => void) => {
    const b = el('button', { type: 'button', class: cls }, label)
    if (onClick) b.addEventListener('click', onClick)
    return b
  }
  const isWriter = (s: Survey) => s.row.my_level === 'write' || s.row.my_level === 'manage'
  const qCount = (s: Survey) => (s.questions.length === 0 ? tr().noQuestions : s.questions.length === 1 ? tr().questionsOne : sub(tr().questionsN, { n: s.questions.length }))

  const toSurvey = (r: Row): Survey => ({
    id: r.id,
    row: r,
    title: String(r.values.title ?? ''),
    intro: String(r.values.intro ?? ''),
    questions: parseQuestions(r.values.questions),
    quiz: r.values.quiz === true,
    pass: String(r.values.pass_percent ?? ''),
    closesOn: String(r.values.closes_on ?? ''),
    closed: r.values.closed === true,
  })

  // ------------------------------------------------------------------------------------------------------ the builder
  // the answer key is not in the questions: a writer opening the builder asks for it apart
  const editSurvey = async (s: Survey) => {
    try {
      const k = await msk.call<{ correct: Record<string, number[]> }>('surveys.get_key', { id: s.id })
      builder({ ...s, questions: mergeKey(s.questions, k.correct) })
    } catch (e) {
      fail(e)
    }
  }

  const builder = (existing?: Survey) => {
    let qs: Question[] = existing ? existing.questions.map((q) => ({ ...q, options: [...q.options], correct: [...q.correct] })) : []
    let closes = existing?.closesOn ?? ''
    const title = el('input', { type: 'text', maxlength: '160', 'aria-label': tr().fTitle, placeholder: tr().fTitle })
    const intro = el('textarea', { rows: '3', 'aria-label': tr().fIntro, placeholder: tr().fIntro })
    const quiz = el('input', { type: 'checkbox', id: 'sv-quiz' })
    const pass = el('input', { type: 'number', min: '0', max: '100', step: '1', 'aria-label': tr().fPass })
    const closed = el('input', { type: 'checkbox', id: 'sv-closed' })
    title.value = existing?.title ?? ''
    intro.value = existing?.intro ?? ''
    quiz.checked = existing?.quiz ?? false
    pass.value = existing?.pass ?? ''
    closed.checked = existing?.closed ?? false
    const closesField = dateField({ label: tr().fCloses, value: closes, onChange: (v) => (closes = v) })
    const field = (label: string, input: HTMLElement) => el('div', { class: 'msk-field' }, el('label', {}, label), input)
    const check = (input: HTMLInputElement, label: string) => el('label', { class: 'sv-check' }, input, el('span', {}, label))
    const passField = field(tr().fPass, pass)
    const qbox = el('div', { class: 'sv-qlist' })

    const choose = (q: Question, i: number, on: boolean) => {
      if (q.kind === 'choice') q.correct = on ? [i] : []
      else q.correct = on ? [...new Set([...q.correct, i])].sort((a, b) => a - b) : q.correct.filter((x) => x !== i)
    }

    const drawQs = (focus?: string) => {
      passField.hidden = !quiz.checked
      qbox.replaceChildren()
      if (quiz.checked && qs.length && !Object.keys(keyOf(qs, true)).length) qbox.append(el('p', { class: 'sv-warn', role: 'note' }, tr().noKeyWarn))
      if (!qs.length) qbox.append(el('p', { class: 'sv-dim' }, tr().noQuestionsBuilder))
      qs.forEach((q, qi) => {
        const n = qi + 1
        const block = el('section', { class: 'sv-qb', 'data-testid': 'question-block', 'aria-label': sub(tr().questionN, { n }) })
        const up = btn('↑', 'msk-btn ghost mini', () => {
          qs = moveQuestion(qs, qi, -1)
          drawQs(`up-${q.id}`)
        })
        const down = btn('↓', 'msk-btn ghost mini', () => {
          qs = moveQuestion(qs, qi, 1)
          drawQs(`down-${q.id}`)
        })
        const del = btn('✕', 'msk-btn ghost mini danger-text', () => {
          qs = qs.filter((x) => x.id !== q.id)
          drawQs('add')
        })
        up.setAttribute('aria-label', sub(tr().moveUp, { n }))
        down.setAttribute('aria-label', sub(tr().moveDown, { n }))
        del.setAttribute('aria-label', sub(tr().removeQuestion, { n }))
        up.dataset.act = `up-${q.id}`
        down.dataset.act = `down-${q.id}`
        up.disabled = qi === 0
        down.disabled = qi === qs.length - 1
        block.append(el('div', { class: 'sv-qhead' }, el('h4', {}, sub(tr().questionN, { n })), el('span', { class: 'sv-tools' }, up, down, del)))

        const text = el('input', { type: 'text', maxlength: '300', 'aria-label': sub(tr().fQuestionText, { n }), placeholder: sub(tr().fQuestionText, { n }) })
        text.value = q.text
        text.dataset.act = `text-${q.id}`
        text.addEventListener('input', () => (q.text = text.value))
        const kind = el('select', { 'aria-label': sub(tr().fKind, { n }) })
        const kindLabel: Record<Kind, string> = { choice: tr().kChoice, multi: tr().kMulti, text: tr().kText, scale: tr().kScale }
        for (const k of KINDS) kind.append(el('option', { value: k }, kindLabel[k]))
        kind.value = q.kind
        kind.addEventListener('change', () => {
          const k = kind.value as Kind
          q.kind = k
          if (hasOptions(k) && q.options.length < MIN_OPTIONS) q.options = [...q.options, ...Array(MIN_OPTIONS - q.options.length).fill('')]
          if (k === 'choice') q.correct = q.correct.slice(0, 1)
          drawQs(`kind-${q.id}`)
        })
        kind.dataset.act = `kind-${q.id}`
        const required = el('input', { type: 'checkbox', 'aria-label': `${sub(tr().questionN, { n })}: ${tr().fRequired}` })
        required.checked = q.required
        required.addEventListener('change', () => (q.required = required.checked))
        const row = el('div', { class: 'sv-qrow' }, kind, el('label', { class: 'sv-check' }, required, el('span', {}, tr().fRequired)))
        if (quiz.checked && hasOptions(q.kind)) {
          const pts = el('input', { type: 'number', min: '0', max: '100', step: '1', class: 'sv-points', 'aria-label': `${sub(tr().questionN, { n })}: ${tr().fPoints}` })
          pts.value = String(q.points)
          pts.addEventListener('input', () => (q.points = pts.value === '' ? 0 : Number(pts.value)))
          row.append(el('label', { class: 'sv-check' }, el('span', {}, tr().fPoints), pts))
        }
        block.append(text, row)

        if (hasOptions(q.kind)) {
          const opts = el('div', { class: 'sv-opts' })
          if (quiz.checked) opts.append(el('p', { class: 'sv-dim' }, q.kind === 'choice' ? tr().correctHint : tr().correctHintMulti))
          q.options.forEach((o, oi) => {
            const on = o
            const line = el('div', { class: 'sv-optline' })
            if (quiz.checked) {
              const c = el('input', { type: 'checkbox', 'aria-label': sub(tr().correctOption, { n, o: oi + 1 }) })
              c.checked = q.correct.includes(oi)
              c.addEventListener('change', () => {
                choose(q, oi, c.checked)
                drawQs(`correct-${q.id}-${oi}`)
              })
              c.dataset.act = `correct-${q.id}-${oi}`
              line.append(c)
            }
            const t = el('input', { type: 'text', maxlength: '200', 'aria-label': sub(tr().optionN, { n, o: oi + 1 }) })
            t.value = on
            t.dataset.act = `opt-${q.id}-${oi}`
            t.addEventListener('input', () => (q.options[oi] = t.value))
            line.append(t)
            if (q.options.length > MIN_OPTIONS) {
              const rm = btn('✕', 'msk-btn ghost mini', () => {
                qs[qi] = removeOption(q, oi)
                drawQs(`add-${q.id}`)
              })
              rm.setAttribute('aria-label', sub(tr().removeOption, { n, o: oi + 1 }))
              line.append(rm)
            }
            opts.append(line)
          })
          if (q.options.length < MAX_OPTIONS) {
            const add = btn(tr().addOption, 'msk-btn ghost mini', () => {
              q.options.push('')
              drawQs(`opt-${q.id}-${q.options.length - 1}`)
            })
            add.dataset.act = `add-${q.id}`
            opts.append(add)
          }
          block.append(opts)
        }
        qbox.append(block)
      })
      if (qs.length < MAX_QUESTIONS) {
        const add = btn(tr().addQuestion, 'msk-btn ghost', () => {
          qs.push(newQuestion('choice'))
          drawQs(`text-${qs[qs.length - 1].id}`)
        })
        add.dataset.act = 'add'
        qbox.append(add)
      }
      if (focus) {
        let target = qbox.querySelector<HTMLElement>(`[data-act="${focus}"]`)
        if (!target || (target as HTMLButtonElement).disabled) {
          const other = focus.startsWith('up-') ? focus.replace('up-', 'down-') : focus.startsWith('down-') ? focus.replace('down-', 'up-') : ''
          target = (other && qbox.querySelector<HTMLElement>(`[data-act="${other}"]`)) || qbox.querySelector<HTMLElement>('[data-act="add"]')
        }
        target?.focus()
      }
    }
    quiz.addEventListener('change', () => drawQs())

    const ok = btn(existing ? tr().save : tr().create)
    const no = btn(tr().cancel, 'msk-btn ghost')
    const form = el(
      'div',
      { class: 'sv-form' },
      field(tr().fTitle, title),
      field(tr().fIntro, intro),
      el('div', { class: 'sv-row' }, field(tr().fCloses, closesField.el), passField),
      check(quiz, tr().fQuiz),
      ...(existing ? [check(closed, tr().fClosed)] : []),
      el('h3', { class: 'sv-sub' }, tr().fQuestions),
      qbox,
    )
    const d = dialog({ title: existing ? tr().editTitle : tr().newTitle, body: form, actions: [no, ok] })
    no.addEventListener('click', d.close)
    drawQs()
    const save = async () => {
      if (!title.value.trim()) {
        toast(tr().needTitle, { tone: 'err' })
        return title.focus()
      }
      const problem = firstProblem(qs, quiz.checked)
      if (problem) {
        toast(sub(tr()[problem.key], { n: problem.index + 1 }), { tone: 'err', ms: 6000 })
        const bad = qs[problem.index]
        if (bad) qbox.querySelector<HTMLElement>(`[data-act="text-${bad.id}"]`)?.focus()
        return
      }
      ok.disabled = true
      const values = {
        title: title.value.trim(),
        intro: intro.value,
        quiz: quiz.checked,
        pass_percent: quiz.checked ? pass.value.trim() : '',
        closes_on: closes,
        closed: closed.checked,
        // the questions are stored without the correct answers; those go to the key apart, after the survey is saved
        questions: JSON.stringify(stripKey(cleanQuestions(qs, quiz.checked))),
      }
      try {
        const row = existing ? await api.update(existing.id, values) : await api.create(values)
        const key = keyOf(qs, quiz.checked)
        let unkeyed = quiz.checked && !Object.keys(key).length
        if (quiz.checked || existing) {
          try {
            await msk.call('surveys.set_key', { id: row.id, correct: key })
          } catch (e) {
            fail(e)
            unkeyed = false
          }
        }
        d.close()
        if (unkeyed) toast(tr().noKeyWarn, { tone: 'err', ms: 7000 })
        await load()
      } catch (e) {
        fail(e)
        ok.disabled = false
      }
    }
    ok.addEventListener('click', () => void save())
    title.focus()
  }

  // ----------------------------------------------------------------------------------------------------------- the list
  const remove = async (s: Survey) => {
    if (!(await confirmDialog({ title: tr().remove, text: sub(tr().removeConfirm, { n: s.title }), ok: tr().remove, cancel: tr().cancel, danger: true }))) return
    try {
      await api.remove(s.id)
      await load()
    } catch (e) {
      fail(e)
    }
  }

  const go = (v: View) => {
    view = v
    draw()
    body.scrollTop = 0
  }

  const card = (s: Survey, today: string) => {
    const open = isOpen(s, today)
    const answered = over.mine.includes(s.id)
    const c = el('article', { class: `sv-card${open ? '' : ' closed'}`, 'data-testid': 'survey' })
    const chips = el('div', { class: 'sv-chips' }, el('span', { class: `sv-state ${open ? 'open' : 'closed'}` }, open ? tr().stateOpen : tr().stateClosed))
    if (s.quiz) chips.append(el('span', { class: 'msk-badge acc' }, tr().quizChip))
    if (answered) chips.append(el('span', { class: 'sv-done' }, '✓ ' + tr().answered))
    const meta = [qCount(s), s.closesOn && open ? sub(tr().closesOn, { d: day(s.closesOn) }) : '', sub(tr().by, { n: s.row.owner_name })]
    if (isWriter(s)) {
      const n = over.counts[s.id] ?? 0
      meta.splice(1, 0, n === 1 ? tr().responsesOne : sub(tr().responsesN, { n }))
    }
    c.append(chips, el('h2', {}, s.title), el('p', { class: 'sv-meta' }, meta.filter(Boolean).join(' · ')))
    if (s.intro.trim()) c.append(el('p', { class: 'sv-intro' }, s.intro))
    const acts = el('div', { class: 'sv-acts' })
    if (open && !answered && s.questions.length) acts.append(btn(tr().take, 'msk-btn', () => go({ kind: 'take', s })))
    if (isWriter(s)) acts.append(btn(tr().results, 'msk-btn ghost mini', () => go({ kind: 'results', s })))
    else if (answered) acts.append(btn(tr().myResult, 'msk-btn ghost mini', () => go({ kind: 'results', s })))
    if (isWriter(s)) acts.append(btn(tr().edit, 'msk-btn ghost mini', () => void editSurvey(s)))
    if (s.row.my_level === 'manage') {
      acts.append(btn(tr().share, 'msk-btn ghost mini', () => void msk.share(s.id).catch(fail)), btn(tr().remove, 'msk-btn ghost mini danger-text', () => void remove(s)))
    }
    if (acts.childElementCount) c.append(acts)
    return c
  }

  const drawList = () => {
    head.replaceChildren(el('h1', {}, tr().title))
    const today = todayLocal()
    const seg = segmented({
      label: tr().filter,
      value: filter,
      options: [
        { key: 'open', label: tr().open },
        { key: 'closed', label: tr().closed },
        { key: 'all', label: tr().all },
      ],
      onChange: (k) => {
        filter = k as typeof filter
        draw()
      },
    })
    const add = btn(tr().newSurvey, 'msk-btn', () => builder())
    add.hidden = !msk.can('create')
    head.append(seg.el, add)
    body.replaceChildren()
    if (!surveys.length) {
      body.append(emptyState({ art: 'surveys', title: tr().emptyTitle, text: tr().emptyText, actions: msk.can('create') ? [btn(tr().newSurvey, 'msk-btn', () => builder())] : [] }))
      return
    }
    const shown = surveys.filter((s) => filter === 'all' || (filter === 'open') === isOpen(s, today))
    if (!shown.length) {
      body.append(emptyState({ art: 'surveys', title: tr().emptyFilter, text: '' }))
      return
    }
    const feed = el('div', { class: 'sv-feed' })
    for (const s of shown) feed.append(card(s, today))
    body.append(feed)
  }

  // ---------------------------------------------------------------------------------------------- the header of a page
  const pageHead = (s: Survey, extra?: HTMLElement) => {
    head.replaceChildren(btn(tr().back, 'msk-btn ghost mini', () => go({ kind: 'list' })), el('h1', {}, s.title))
    if (extra) head.append(extra)
  }

  // ------------------------------------------------------------------------------------------------- answering a survey
  const drawTake = (s: Survey) => {
    pageHead(s)
    const answers: Record<string, Answer> = {}
    const wrap = el('div', { class: 'sv-take', 'data-has-key': String(s.questions.some((q) => q.correct.length > 0)) })
    const bar = el('div', { class: 'sv-progress' })
    const sendBtn = btn(tr().submit)
    const drawBar = () => {
      const p = progressOf(s.questions, answers)
      bar.replaceChildren(
        progress({ value: p.done, max: p.total, label: sub(tr().progress, { d: p.done, t: p.total }) }),
        el('span', { class: 'sv-dim', 'aria-live': 'polite' }, sub(tr().progress, { d: p.done, t: p.total })),
      )
    }
    if (s.intro.trim()) wrap.append(el('p', { class: 'sv-intro' }, s.intro))
    wrap.append(bar)
    s.questions.forEach((q, i) => {
      const n = i + 1
      const set = fieldsetOf(q, n, answers, drawBar)
      wrap.append(set)
    })
    sendBtn.addEventListener('click', () => {
      const p = progressOf(s.questions, answers)
      if (p.firstMissing >= 0) {
        toast(sub(tr().needAnswer, { n: p.firstMissing + 1 }), { tone: 'err' })
        wrap.querySelectorAll<HTMLElement>('.sv-q')[p.firstMissing]?.querySelector<HTMLElement>('input, textarea')?.focus()
        return
      }
      sendBtn.disabled = true
      void msk
        .call<Submitted>('surveys.submit', { id: s.id, answers: answersToSend(s.questions, answers) })
        .then(async (out) => {
          if (!over.mine.includes(s.id)) over.mine.push(s.id)
          go({ kind: 'done', s, out })
          await refreshOverview()
        })
        .catch((e) => {
          fail(e)
          sendBtn.disabled = false
        })
    })
    wrap.append(el('div', { class: 'sv-acts' }, sendBtn))
    drawBar()
    body.replaceChildren(wrap)
  }

  const fieldsetOf = (q: Question, n: number, answers: Record<string, Answer>, changed: () => void) => {
    const legend = el('legend', {}, el('span', { class: 'sv-qn' }, `${n}. `), q.text, el('span', { class: 'sv-req' }, q.required ? tr().requiredMark : tr().optionalMark))
    const set = el('fieldset', { class: 'sv-q', 'data-testid': 'question' }, legend)
    const pick = (type: 'radio' | 'checkbox', label: string, value: number, name: string, extra = '') => {
      const input = el('input', { type, name, value: String(value) })
      input.addEventListener('change', () => {
        if (q.kind === 'multi') {
          const cur = new Set((answers[q.id] as number[] | undefined) ?? [])
          if (input.checked) cur.add(value)
          else cur.delete(value)
          answers[q.id] = [...cur].sort((a, b) => a - b)
        } else answers[q.id] = value
        changed()
      })
      return el('label', { class: `sv-pick ${extra}` }, input, el('span', {}, label))
    }
    if (q.kind === 'choice') q.options.forEach((o, i) => set.append(pick('radio', o, i, q.id)))
    else if (q.kind === 'multi') q.options.forEach((o, i) => set.append(pick('checkbox', o, i, q.id)))
    else if (q.kind === 'scale') {
      const row = el('div', { class: 'sv-scale' })
      for (let v = 1; v <= 5; v++) row.append(pick('radio', String(v), v, q.id, 'scale'))
      set.append(row, el('p', { class: 'sv-dim sv-scalehint' }, `${tr().scaleLow} · ${tr().scaleHigh}`))
    } else {
      const t = el('textarea', { rows: '3', maxlength: String(MAX_TEXT_ANSWER), 'aria-label': `${q.text} (${tr().textAnswer})`, placeholder: tr().textAnswer })
      t.addEventListener('input', () => {
        answers[q.id] = t.value
        changed()
      })
      set.append(t)
    }
    return set
  }

  // ------------------------------------------------------------------------------------------------------- the outcome
  const outcomeBox = (s: Survey, o: Outcome) => {
    const box = el('section', { class: 'sv-score', 'data-testid': 'score' })
    box.append(el('h2', {}, tr().yourScore), el('p', { class: 'sv-big' }, sub(tr().scoreOf, { s: o.score ?? 0, m: o.max_score ?? 0, p: o.percent ?? 0 })))
    if (o.passed !== null && o.passed !== undefined) box.append(el('p', { role: 'status', class: `sv-verdict ${o.passed ? 'pass' : 'fail'}` }, (o.passed ? '✓ ' : '✗ ') + (o.passed ? tr().passed : tr().notPassed)))
    if (s.pass) box.append(el('p', { class: 'sv-dim' }, sub(tr().passMark, { p: s.pass })))
    return box
  }

  const drawDone = (s: Survey, out: Submitted) => {
    pageHead(s)
    const wrap = el('div', { class: 'sv-take' })
    if (!out.quiz) {
      wrap.append(el('section', { class: 'sv-score', 'data-testid': 'thanks' }, el('h2', {}, tr().thanks), el('p', {}, tr().thanksText)))
    } else {
      wrap.append(outcomeBox(s, out))
      const list = el('ol', { class: 'sv-review' })
      for (const r of out.review ?? []) {
        const i = s.questions.findIndex((q) => q.id === r.id)
        const q = s.questions[i]
        if (!q || r.right === null) continue
        const li = el('li', { class: r.right ? 'right' : 'wrong', value: String(i + 1) }, el('strong', {}, q.text), el('span', {}, ' ' + (r.right ? '✓ ' + tr().right : '✗ ' + tr().wrong)))
        if (!r.right && r.correct) li.append(el('div', { class: 'sv-dim' }, sub(tr().correctWas, { a: r.correct.map((c) => q.options[c]).join('; ') })))
        list.append(li)
      }
      if (list.childElementCount) wrap.append(el('h3', { class: 'sv-sub' }, tr().review), list)
    }
    wrap.append(el('div', { class: 'sv-acts' }, btn(tr().backToList, 'msk-btn', () => go({ kind: 'list' }))))
    body.replaceChildren(wrap)
  }

  // -------------------------------------------------------------------------------------------------------- the results
  const download = (name: string, text: string) => {
    const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = el('a', { href: url, download: name })
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  const barRow = (label: string, n: number, total: number, mark = '') => {
    const p = pct(n, total)
    const fill = el('span', { class: 'sv-fill' })
    fill.style.setProperty('--w', `${p}%`)
    return el('div', { class: 'sv-barrow', 'data-testid': 'bar' }, el('span', { class: 'sv-barlabel' }, label + (mark ? ' ' + mark : '')), el('span', { class: 'sv-track', 'aria-hidden': 'true' }, fill), el('span', { class: 'sv-barn' }, `${n} (${p}%)`))
  }

  const drawResults = async (s: Survey) => {
    pageHead(s)
    body.replaceChildren(skeleton({ kind: 'cards', count: 2 }))
    let r: Results
    try {
      r = await msk.call<Results>('surveys.results', { id: s.id })
    } catch (e) {
      fail(e)
      return go({ kind: 'list' })
    }
    const wrap = el('div', { class: 'sv-take' })
    if (!r.full) {
      if (!r.responded) wrap.append(el('p', {}, tr().noMine))
      else {
        wrap.append(el('p', { class: 'sv-dim' }, sub(tr().mineAt, { d: r.mine?.at ? new Date(r.mine.at.replace(' ', 'T')).toLocaleDateString(msk.context?.lang || undefined, { dateStyle: 'medium' }) : '' })))
        if (r.mine && r.mine.score !== undefined) wrap.append(outcomeBox(s, r.mine))
        else wrap.append(el('section', { class: 'sv-score' }, el('h2', {}, tr().thanks), el('p', {}, tr().thanksText)))
      }
      body.replaceChildren(wrap)
      return
    }
    const total = r.total ?? 0
    const questions = mergeKey(s.questions, r.key)
    const people: Respondent[] = (r.respondents ?? []).map((p) => ({ name: p.name, at: p.at, score: p.score, max_score: p.max_score, percent: p.percent, answers: p.answers }))
    const exp = btn(tr().exportCsv, 'msk-btn ghost', () => {
      const csv = buildCsv(s.questions, people, s.quiz, { respondent: tr().csvName, submitted: tr().csvWhen, score: tr().csvScore, max: tr().csvMax, percent: tr().csvPercent })
      download((s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'survey') + '.csv', csv)
      toast(tr().exported, { tone: 'ok' })
    })
    exp.disabled = total === 0
    pageHead(s, exp)
    wrap.append(el('p', { class: 'sv-summary', 'data-testid': 'summary' }, `${tr().responsesTotal}: ${total}`))
    if (!total) wrap.append(el('p', { class: 'sv-dim' }, tr().noResponses))
    questions.forEach((q, i) => {
      const a = (r.questions ?? []).find((x) => x.id === q.id)
      if (!a) return
      const c = el('section', { class: 'sv-result', 'data-testid': 'result' }, el('h3', {}, `${i + 1}. ${q.text}`), el('p', { class: 'sv-dim' }, sub(tr().answeredBy, { a: a.answered, t: total })))
      if (hasOptions(q.kind)) q.options.forEach((o, k) => c.append(barRow(o, a.counts?.[k] ?? 0, a.answered || total, q.correct.includes(k) ? tr().correctMark : '')))
      else if (q.kind === 'scale') {
        c.append(el('p', { class: 'sv-avg' }, `${tr().average}: ${a.average ?? '–'}`))
        for (let v = 1; v <= 5; v++) c.append(barRow(String(v), a.counts?.[v - 1] ?? 0, a.answered))
      } else if (!a.texts?.length) c.append(el('p', { class: 'sv-dim' }, tr().noTextAnswers))
      else {
        const ul = el('ul', { class: 'sv-texts' })
        for (const t of a.texts) ul.append(el('li', {}, t))
        c.append(ul)
      }
      wrap.append(c)
    })
    if (total) {
      const table = el('table', { class: 'sv-table' })
      const hr = el('tr', {}, el('th', { scope: 'col' }, tr().colName), el('th', { scope: 'col' }, tr().colWhen))
      if (s.quiz) hr.append(el('th', { scope: 'col' }, tr().colScore))
      table.append(el('thead', {}, hr))
      const tb = el('tbody')
      for (const p of r.respondents ?? []) {
        const row = el('tr', { 'data-testid': 'respondent' }, el('td', {}, p.name), el('td', {}, new Date(p.at.replace(' ', 'T')).toLocaleString(msk.context?.lang || undefined, { dateStyle: 'medium', timeStyle: 'short' })))
        if (s.quiz) {
          const verdict = p.passed === null || p.passed === undefined ? '' : ` · ${p.passed ? tr().passed : tr().notPassed}`
          row.append(el('td', {}, p.score === null ? '' : `${p.score}/${p.max_score} (${p.percent}%)${verdict}`))
        }
        tb.append(row)
      }
      table.append(tb)
      wrap.append(el('h3', { class: 'sv-sub' }, tr().respondents), el('div', { class: 'sv-tablewrap' }, table))
    }
    body.replaceChildren(wrap)
  }

  // ------------------------------------------------------------------------------------------------------------ the page
  const draw = () => {
    if (view.kind === 'list') return drawList()
    if (view.kind === 'take') return drawTake(view.s)
    if (view.kind === 'done') return drawDone(view.s, view.out)
    void drawResults(view.s)
  }

  const refreshOverview = async () => {
    try {
      over = await msk.call<Overview>('surveys.overview')
    } catch {
      over = { mine: [], counts: {} }
    }
  }

  const load = async () => {
    view = { kind: 'list' }
    head.replaceChildren(el('h1', {}, tr().title))
    body.replaceChildren(skeleton({ kind: 'cards', count: 3 }))
    try {
      surveys = (await api.list({ sort: 'created_at', dir: 'desc', limit: 200 })).rows.map(toSurvey)
    } catch (e) {
      body.textContent = tr().loadFailed + errText(e, msk.context?.lang)
      return
    }
    await refreshOverview()
    draw()
  }

  msk.onContext((ctx) => {
    if (langOf(ctx.lang) === lang) return
    lang = langOf(ctx.lang)
    draw()
  })
  void load()
}

connect()
  .then(mount)
  .catch((e) => {
    app.textContent = TEXTS[langOf(undefined)].failed + errText(e)
  })
