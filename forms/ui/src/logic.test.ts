import { describe, expect, it } from 'vitest'
import { buildCsv, checkValues, cleanFields, csvCell, firstProblem, isDate, isEmail, isNumber, isOpen, isUuid, moveItem, newBrowserId, newField, parseFields, pct, publicProblem, slug, validMaxAnswers, valuesToSend, type Field } from './logic.ts'

const f = (over: Partial<Field>): Field => ({ ...newField('text', 'a'), label: 'L', ...over })

describe('parseFields', () => {
  it('reads the stored list and drops what is not a field', () => {
    const raw = JSON.stringify([{ id: 'a', label: 'One', kind: 'choice', options: ['x', 'y'], required: true, help: 'h' }, { id: 'b', kind: 'rating' }, 7])
    const list = parseFields(raw)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: 'a', required: true, help: 'h' })
  })
  it('is forgiving with empty or broken text', () => {
    expect(parseFields('')).toEqual([])
    expect(parseFields('{oops')).toEqual([])
    expect(parseFields('{}')).toEqual([])
    expect(parseFields(undefined)).toEqual([])
  })
})

describe('cleanFields and firstProblem', () => {
  it('trims and drops options of the kinds without them', () => {
    const c = cleanFields([f({ label: ' Hi ', kind: 'date', options: ['x'] }), f({ kind: 'choice', options: [' x ', 'y'] })])
    expect(c[0]).toMatchObject({ label: 'Hi', options: [] })
    expect(c[1].options).toEqual(['x', 'y'])
  })
  it('finds the first problem, counting from zero', () => {
    expect(firstProblem([f({}), f({ label: '  ' })])).toEqual({ index: 1, key: 'needLabel' })
    expect(firstProblem([f({ kind: 'choice', options: ['x'] })])?.key).toBe('needOptions')
    expect(firstProblem([f({ kind: 'multi', options: ['x', ' '] })])?.key).toBe('needOptionText')
    expect(firstProblem([f({ kind: 'multi', options: ['x', 'x'] })])?.key).toBe('needDupOption')
    expect(firstProblem([f({ kind: 'choice', options: ['x', 'y'] })])).toBeNull()
    expect(firstProblem(Array.from({ length: 31 }, (_, i) => f({ id: 'i' + i })))?.key).toBe('tooMany')
  })
  it('checks the cap of answers', () => {
    for (const ok of ['', ' 1 ', '1000', '5000']) expect(validMaxAnswers(ok)).toBe(true)
    for (const no of ['0', '5001', '-1', '1.5', 'abc', '12345']) expect(validMaxAnswers(no)).toBe(false)
  })
})

describe('moveItem and isOpen', () => {
  it('moves and stops at the ends', () => {
    expect(moveItem([1, 2, 3], 1, -1)).toEqual([2, 1, 3])
    expect(moveItem([1, 2, 3], 2, 1)).toEqual([1, 2, 3])
  })
  it('is open when on and not past its day', () => {
    expect(isOpen({ open: true, closesOn: '' }, '2026-11-12')).toBe(true)
    expect(isOpen({ open: true, closesOn: '2026-11-12' }, '2026-11-12')).toBe(true)
    expect(isOpen({ open: true, closesOn: '2026-11-11' }, '2026-11-12')).toBe(false)
    expect(isOpen({ open: false, closesOn: '' }, '2026-11-12')).toBe(false)
  })
})

describe('the checks of an answer', () => {
  it('knows emails, dates and numbers', () => {
    expect(isEmail('a.b+c@sub.example.org')).toBe(true)
    for (const no of ['nope', 'a@b', 'a b@c.org', 'a@@c.org', 'a@c..org', '@c.org']) expect(isEmail(no)).toBe(false)
    expect(isDate('2028-02-29')).toBe(true)
    for (const no of ['2027-02-29', '2027-13-01', '12/05/2027', '2027-1-1']) expect(isDate(no)).toBe(false)
    expect(isNumber('-3.5')).toBe(true)
    for (const no of ['', '1e5', '+5', '.', '1.', '12a']) expect(isNumber(no)).toBe(false)
  })
  const fields: Field[] = [
    f({ id: 'n', label: 'Name', required: true }),
    f({ id: 'm', label: 'Mail', kind: 'email' }),
    f({ id: 's', label: 'Size', kind: 'choice', options: ['S', 'M'] }),
    f({ id: 'x', label: 'Extras', kind: 'multi', options: ['a', 'b'] }),
  ]
  it('asks for required fields and checks the kinds', () => {
    expect(checkValues(fields, {}).map((e) => [e.id, e.key])).toEqual([['n', 'eRequired']])
    expect(checkValues(fields, { n: '  ' }).map((e) => e.key)).toEqual(['eRequired'])
    expect(checkValues(fields, { n: 'A', m: 'bad' }).map((e) => e.key)).toEqual(['eEmail'])
    expect(checkValues(fields, { n: 'A', s: 'XL' }).map((e) => e.key)).toEqual(['eChoice'])
    expect(checkValues(fields, { n: 'A', x: ['a', 'z'] }).map((e) => e.key)).toEqual(['eChoice'])
    expect(checkValues(fields, { n: 'x'.repeat(201) })[0]).toMatchObject({ key: 'eLong', max: 200 })
    expect(checkValues(fields, { n: 'A', m: 'a@b.org', s: 'M', x: ['a'] })).toEqual([])
  })
  it('sends only what was given', () => {
    expect(valuesToSend(fields, { n: ' Ann ', m: '', x: [] , s: 'S' })).toEqual({ n: 'Ann', s: 'S' })
  })
})

describe('csv', () => {
  it('protects against formulas and quotes what needs it', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvCell('+1')).toBe("'+1")
    expect(csvCell('@x')).toBe("'@x")
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell(null)).toBe('')
  })
  it('builds a header and one row per answer with CRLF', () => {
    const fields = [f({ id: 'n', label: 'Name' }), f({ id: 'x', label: 'Extras', kind: 'multi', options: ['a', 'b'] })]
    const csv = buildCsv(fields, [{ id: 'u', name: 'visitor', at: '2026-11-12', values: { n: '=evil()', x: ['a', 'b'] } }], { name: 'Who', submitted: 'When' })
    expect(csv).toBe("Who,When,Name,Extras\r\nvisitor,2026-11-12,'=evil(),a; b\r\n")
  })
  it('makes a file name', () => {
    expect(slug('Summer Festival!')).toBe('summer-festival')
    expect(slug('???')).toBe('form')
  })
})

describe('the public page', () => {
  it('makes browser ids that the logic accepts', () => {
    const id = newBrowserId()
    expect(isUuid(id)).toBe(true)
    expect(isUuid('nope')).toBe(false)
    expect(isUuid(null)).toBe(false)
  })
  it('names the problems by their code', () => {
    const e = (code: string) => ({ code })
    expect(publicProblem(e('already_answered'))).toBe('already')
    expect(publicProblem(e('form_closed'))).toBe('closed')
    expect(publicProblem(e('form_full'))).toBe('full')
    expect(publicProblem(e('public_rate_limited'))).toBe('rate')
    expect(publicProblem(e('public_commands_off'))).toBe('off')
    expect(publicProblem(e('answer_rejected'))).toBe('rejected')
    expect(publicProblem(e('answer_required'))).toBe('invalid')
    expect(publicProblem(e('other_thing'))).toBe('other')
    expect(publicProblem(new Error('x'))).toBe('other')
  })
  it('rounds percentages', () => {
    expect(pct(1, 3)).toBe(33)
    expect(pct(1, 0)).toBe(0)
  })
})
