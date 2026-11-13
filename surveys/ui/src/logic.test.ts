import { describe, expect, it } from 'vitest'
import { branchSources, branchValues, conditionProblem, removeQuestion, visibleIds, answersToSend, buildCsv, cleanQuestions, csvCell, firstProblem, isAnswered, keyOf, mergeKey, stripKey, isOpen, moveQuestion, newQuestion, parseQuestions, pct, progressOf, removeOption, todayLocal, type Question } from './logic.ts'

const q = (over: Partial<Question>): Question => ({ ...newQuestion('choice', 'a'), text: 'T', options: ['x', 'y'], ...over })

describe('parseQuestions', () => {
  it('reads the stored list and drops what is not a question', () => {
    const raw = JSON.stringify([{ id: 'a', text: 'One', kind: 'choice', options: ['x', 'y'], correct: [1], points: 2, required: true }, { id: 'b', kind: 'essay' }, 7])
    const list = parseQuestions(raw)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: 'a', correct: [1], points: 2, required: true })
  })
  it('is forgiving with empty or broken text', () => {
    expect(parseQuestions('')).toEqual([])
    expect(parseQuestions('{oops')).toEqual([])
    expect(parseQuestions('{}')).toEqual([])
    expect(parseQuestions(undefined)).toEqual([])
  })
})

describe('cleanQuestions and firstProblem', () => {
  it('trims and drops correct answers and points outside a quiz', () => {
    const c = cleanQuestions([q({ text: ' Hi ', options: [' x ', 'y'], correct: [1], points: 3 })], false)
    expect(c[0]).toMatchObject({ text: 'Hi', options: ['x', 'y'], correct: [], points: 0 })
    expect(cleanQuestions([q({ correct: [1, 1, 5], points: 3 })], true)[0].correct).toEqual([1])
  })
  it('finds the first problem, counting from zero', () => {
    expect(firstProblem([q({}), q({ text: '  ' })], false)).toEqual({ index: 1, key: 'needText' })
    expect(firstProblem([q({ options: ['x'] })], false)?.key).toBe('needOptions')
    expect(firstProblem([q({ options: ['x', ' '] })], false)?.key).toBe('needOptionText')
    expect(firstProblem([q({ points: 2 })], true)?.key).toBe('needCorrect')
    expect(firstProblem([q({ correct: [0, 1], points: 1 })], true)?.key).toBe('oneCorrect')
    expect(firstProblem([q({ kind: 'multi', correct: [0, 1], points: 1 })], true)).toBeNull()
    expect(firstProblem([q({ points: 101, correct: [0] })], true)?.key).toBe('badPoints')
    expect(firstProblem([newQuestion('text', 'a')], false)?.key).toBe('needText')
    expect(firstProblem(Array.from({ length: 41 }, (_, i) => q({ id: String(i) })), false)?.key).toBe('tooMany')
  })
})

describe('editing the list', () => {
  it('moves a question without touching the list it was given', () => {
    const list = ['a', 'b', 'c']
    expect(moveQuestion(list, 0, 1)).toEqual(['b', 'a', 'c'])
    expect(moveQuestion(list, 2, -1)).toEqual(['a', 'c', 'b'])
    expect(moveQuestion(list, 0, -1)).toBe(list)
    expect(moveQuestion(list, 2, 1)).toBe(list)
    expect(list).toEqual(['a', 'b', 'c'])
  })
  it('keeps the correct answers on the same options when one is removed', () => {
    const r = removeOption(q({ options: ['a', 'b', 'c', 'd'], correct: [1, 3] }), 1)
    expect(r.options).toEqual(['a', 'c', 'd'])
    expect(r.correct).toEqual([2])
  })
})

describe('answers and progress', () => {
  const list = [q({ id: 'a', required: true }), q({ id: 'b', kind: 'text', options: [] }), q({ id: 'c', kind: 'multi', required: true })]
  it('says what counts as an answer', () => {
    expect(isAnswered(0)).toBe(true)
    expect(isAnswered([])).toBe(false)
    expect(isAnswered('  ')).toBe(false)
    expect(isAnswered('x')).toBe(true)
    expect(isAnswered(undefined)).toBe(false)
  })
  it('counts the answered questions and finds the first required one missing', () => {
    expect(progressOf(list, {})).toEqual({ done: 0, total: 3, firstMissing: 0 })
    expect(progressOf(list, { a: 1, b: 'hi' })).toEqual({ done: 2, total: 3, firstMissing: 2 })
    expect(progressOf(list, { a: 1, c: [0] })).toEqual({ done: 2, total: 3, firstMissing: -1 })
  })
  it('sends only the given answers, trimmed', () => {
    expect(answersToSend(list, { a: 0, b: '  hi ', c: [] })).toEqual({ a: 0, b: 'hi' })
  })
})

describe('small helpers', () => {
  it('computes percentages', () => {
    expect(pct(1, 3)).toBe(33)
    expect(pct(0, 0)).toBe(0)
  })
  it('knows when a survey is open', () => {
    expect(isOpen({ closed: false, closesOn: '' }, '2026-05-10')).toBe(true)
    expect(isOpen({ closed: false, closesOn: '2026-05-10' }, '2026-05-10')).toBe(true)
    expect(isOpen({ closed: false, closesOn: '2026-05-09' }, '2026-05-10')).toBe(false)
    expect(isOpen({ closed: true, closesOn: '' }, '2026-05-10')).toBe(false)
  })
  it('writes the local day', () => {
    expect(todayLocal(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('CSV', () => {
  it('quotes cells and neutralises formulas', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
    for (const f of ['=1+1', '+1', '-1', '@SUM(A1)']) expect(csvCell(f)).toBe("'" + f)
    expect(csvCell('=HYPERLINK("x","y")')).toBe('"\'=HYPERLINK(""x"",""y"")"')
    expect(csvCell(-3)).toBe('-3')
    expect(csvCell(null)).toBe('')
  })
  it('builds a header and a row per respondent, with the score of a quiz', () => {
    const qs = [q({ id: 'a', text: 'Pick', options: ['x', 'y'] }), q({ id: 'b', text: 'Many', kind: 'multi', options: ['p', 'q'] }), q({ id: 'c', text: 'Why', kind: 'text', options: [] })]
    const head = { respondent: 'Respondent', submitted: 'Submitted', score: 'Score', max: 'Max', percent: '%' }
    const people = [{ name: '=evil', at: '2026-05-01', score: 2, max_score: 4, percent: 50, answers: { a: 1, b: [0, 1], c: 'ok, fine' } }]
    const csv = buildCsv(qs, people, true, head)
    expect(csv.split('\r\n')).toEqual(['Respondent,Submitted,Score,Max,%,Pick,Many,Why', "'=evil,2026-05-01,2,4,50,y,p; q,\"ok, fine\"", ''])
    expect(buildCsv(qs, people, false, head).split('\r\n')[0]).toBe('Respondent,Submitted,Pick,Many,Why')
  })
})

describe('the answer key apart from the questions', () => {
  const list = [q({ id: 'a', correct: [1], points: 2 }), q({ id: 'b', kind: 'multi', options: ['x', 'y', 'z'], correct: [2, 0], points: 1 }), q({ id: 'c', kind: 'text', options: [] })]
  it('takes the key out of the builder state and none outside a quiz', () => {
    expect(keyOf(list, true)).toEqual({ a: [1], b: [0, 2] })
    expect(keyOf(list, false)).toEqual({})
  })
  it('stores questions that have no correct answers', () => {
    const stored = JSON.stringify(stripKey(cleanQuestions(list, true)))
    expect(stored).not.toContain('correct')
    expect(JSON.parse(stored)[0]).toMatchObject({ id: 'a', text: 'T', points: 2 })
  })
  it('round-trips questions and key', () => {
    const back = mergeKey(parseQuestions(JSON.stringify(stripKey(cleanQuestions(list, true)))), keyOf(list, true))
    expect(back.map((x) => x.correct)).toEqual([[1], [0, 2], []])
    expect(keyOf(back, true)).toEqual(keyOf(list, true))
    expect(mergeKey(back, null).every((x) => x.correct.length === 0)).toBe(true)
  })
})

describe('branching questions', () => {
  const q = (id: string, kind: Question['kind'], extra: Partial<Question> = {}): Question => ({
    id, text: id, kind, options: kind === 'choice' || kind === 'multi' ? ['x', 'y', 'z'] : [], correct: [], points: 0, required: false, ...extra,
  })
  const list = [
    q('a', 'choice'),
    q('b', 'text', { required: true, show_if: { question: 'a', any_of: [0] } }),
    q('c', 'scale', { show_if: { question: 'a', any_of: [1, 2] } }),
    q('d', 'text', { show_if: { question: 'c', any_of: [4, 5] } }),
  ]

  it('shows a question when the answer of an earlier one is in its list', () => {
    expect([...visibleIds(list, {})]).toEqual(['a'])
    expect([...visibleIds(list, { a: 0 })]).toEqual(['a', 'b'])
    expect([...visibleIds(list, { a: 1 })]).toEqual(['a', 'c'])
    expect([...visibleIds(list, { a: 2, c: 5 })]).toEqual(['a', 'c', 'd'])
    // the source of d is hidden: d is hidden, whatever was typed
    expect([...visibleIds(list, { a: 0, c: 5 })]).toEqual(['a', 'b'])
  })

  it('looks at any of the picks of a multiple choice question', () => {
    const m = [q('a', 'multi'), q('b', 'text', { show_if: { question: 'a', any_of: [2] } })]
    expect(visibleIds(m, { a: [0, 2] }).has('b')).toBe(true)
    expect(visibleIds(m, { a: [0, 1] }).has('b')).toBe(false)
    expect(visibleIds(m, { a: [] }).has('b')).toBe(false)
  })

  it('counts and sends only the questions that are shown', () => {
    expect(progressOf(list, {})).toEqual({ done: 0, total: 1, firstMissing: -1 })
    // yes: the required b is asked and missing
    expect(progressOf(list, { a: 0 })).toEqual({ done: 1, total: 2, firstMissing: 1 })
    expect(progressOf(list, { a: 0, b: 'Fiat' })).toEqual({ done: 2, total: 2, firstMissing: -1 })
    // the required question is hidden: nothing is missing
    expect(progressOf(list, { a: 1 }).firstMissing).toBe(-1)
    expect(answersToSend(list, { a: 1, b: 'stray', c: 3 })).toEqual({ a: 1, c: 3 })
  })

  it('offers only earlier questions with options or a scale as the source', () => {
    expect(branchSources(list, 0)).toEqual([])
    expect(branchSources(list, 2).map((x) => x.id)).toEqual(['a'])
    expect(branchSources(list, 3).map((x) => x.id)).toEqual(['a', 'c'])
    expect(branchValues(list[2]).map((v) => v.value)).toEqual([1, 2, 3, 4, 5])
    expect(branchValues(list[0]).map((v) => v.label)).toEqual(['x', 'y', 'z'])
  })

  it('finds a condition that cannot work', () => {
    expect(conditionProblem(list, 1)).toBeNull()
    expect(conditionProblem([list[1], list[0]], 0)).toBe('earlier')
    expect(conditionProblem([q('t', 'text'), q('b', 'text', { show_if: { question: 't', any_of: [0] } })], 1)).toBe('kind')
    expect(conditionProblem([list[0], q('b', 'text', { show_if: { question: 'a', any_of: [3] } })], 1)).toBe('values')
    expect(conditionProblem([list[0], q('b', 'text', { show_if: { question: 'a', any_of: [] } })], 1)).toBe('values')
    const bad = [list[0], q('b', 'text', { show_if: { question: 'a', any_of: [] } })]
    expect(firstProblem(bad, false)).toEqual({ index: 1, key: 'badBranch' })
    expect(firstProblem(list, false)).toBeNull()
  })

  it('removes the conditions that depended on a deleted question', () => {
    const out = removeQuestion(list, 'a')
    expect(out.map((x) => x.id)).toEqual(['b', 'c', 'd'])
    expect(out[0].show_if).toBeUndefined()
    expect(out[1].show_if).toBeUndefined()
    // d depended on c, which is still there
    expect(out[2].show_if).toEqual({ question: 'c', any_of: [4, 5] })
  })

  it('keeps a valid condition when saving and drops one that cannot work', () => {
    const clean = cleanQuestions([list[0], q('b', 'text', { show_if: { question: 'a', any_of: [2, 0, 2] } })], false)
    expect(clean[1].show_if).toEqual({ question: 'a', any_of: [0, 2] })
    expect(cleanQuestions([list[1]], false)[0].show_if).toBeUndefined()
  })

  it('reads the conditions of a stored survey and ignores broken ones', () => {
    const raw = JSON.stringify([
      { id: 'a', text: 'A', kind: 'choice', options: ['x', 'y'] },
      { id: 'b', text: 'B', kind: 'text', show_if: { question: 'a', any_of: [1] } },
      { id: 'c', text: 'C', kind: 'text', show_if: { question: 'a', any_of: 'no' } },
    ])
    const p = parseQuestions(raw)
    expect(p[1].show_if).toEqual({ question: 'a', any_of: [1] })
    expect(p[2].show_if).toBeUndefined()
  })
})

describe('anonymous results', () => {
  const qs: Question[] = [{ id: 'a', text: 'A', kind: 'text', options: [], correct: [], points: 0, required: false }]
  const people = [{ name: null, at: null, score: null, max_score: null, percent: null, answers: { a: 'hi' } }]
  const head = { respondent: 'Respondent', submitted: 'Submitted', score: 'Score', max: 'Max', percent: '%' }

  it('writes no name and no date in the CSV', () => {
    expect(buildCsv(qs, people, false, head, true)).toBe('A\r\nhi\r\n')
    expect(buildCsv(qs, people, false, head)).toBe('Respondent,Submitted,A\r\n,,hi\r\n')
  })
})
