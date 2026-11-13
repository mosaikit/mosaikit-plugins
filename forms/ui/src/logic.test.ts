import { describe, expect, it } from 'vitest'
import { branchSources, conditionProblem, removeField, visibleIds, buildCsv, checkValues, cleanFields, csvCell, firstProblem, isDate, isEmail, isNumber, isOpen, isUuid, moveItem, newBrowserId, newField, parseFields, pct, publicProblem, slug, validMaxAnswers, valuesToSend, type Field } from './logic.ts'

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

describe('branching fields', () => {
  const f = (id: string, kind: Field['kind'], extra: Partial<Field> = {}): Field => ({
    id, label: id, kind, options: kind === 'choice' || kind === 'multi' ? ['Yes', 'No', 'Maybe'] : [], required: false, help: '', ...extra,
  })
  const list = [
    f('a', 'choice'),
    f('b', 'text', { required: true, show_if: { field: 'a', any_of: ['Yes'] } }),
    f('c', 'text', { show_if: { field: 'a', any_of: ['No', 'Maybe'] } }),
    f('d', 'text', { show_if: { field: 'c', any_of: ['x'] } }),
  ]

  it('shows a field when the answer of an earlier one is in its list', () => {
    expect([...visibleIds(list, {})]).toEqual(['a'])
    expect([...visibleIds(list, { a: 'Yes' })]).toEqual(['a', 'b'])
    expect([...visibleIds(list, { a: 'Maybe' })]).toEqual(['a', 'c'])
  })

  it('looks at any of the picks of a multiple choice field', () => {
    const m = [f('a', 'multi'), f('b', 'text', { show_if: { field: 'a', any_of: ['Maybe'] } })]
    expect(visibleIds(m, { a: ['Yes', 'Maybe'] }).has('b')).toBe(true)
    expect(visibleIds(m, { a: ['Yes', 'No'] }).has('b')).toBe(false)
    expect(visibleIds(m, { a: [] }).has('b')).toBe(false)
  })

  it('checks and sends only the fields that are shown', () => {
    expect(checkValues(list, { a: 'No' })).toEqual([])
    expect(checkValues(list, { a: 'Yes' }).map((e) => e.id)).toEqual(['b'])
    expect(checkValues(list, { a: 'Yes', b: 'Fiat' })).toEqual([])
    expect(valuesToSend(list, { a: 'No', b: 'stray', c: 'bike', d: 'hidden' })).toEqual({ a: 'No', c: 'bike' })
  })

  it('offers only earlier fields with options as the source', () => {
    expect(branchSources(list, 0)).toEqual([])
    expect(branchSources(list, 3).map((x) => x.id)).toEqual(['a'])
  })

  it('finds a condition that cannot work', () => {
    expect(conditionProblem(list, 1)).toBeNull()
    expect(conditionProblem([list[1], list[0]], 0)).toBe('earlier')
    expect(conditionProblem([list[0], f('t', 'text'), f('b', 'text', { show_if: { field: 't', any_of: ['x'] } })], 2)).toBe('kind')
    expect(conditionProblem([list[0], f('b', 'text', { show_if: { field: 'a', any_of: ['Nope'] } })], 1)).toBe('values')
    expect(conditionProblem([list[0], f('b', 'text', { show_if: { field: 'a', any_of: [] } })], 1)).toBe('values')
    expect(firstProblem([list[0], f('b', 'text', { show_if: { field: 'a', any_of: [] } })])).toEqual({ index: 1, key: 'badBranch' })
    expect(firstProblem(list.slice(0, 3))).toBeNull()
  })

  it('removes the conditions that depended on a deleted field', () => {
    const out = removeField(list, 'a')
    expect(out.map((x) => x.id)).toEqual(['b', 'c', 'd'])
    expect(out[0].show_if).toBeUndefined()
    expect(out[1].show_if).toBeUndefined()
    expect(out[2].show_if).toEqual({ field: 'c', any_of: ['x'] })
  })

  it('keeps a valid condition when saving, in the order of the options, and drops one that cannot work', () => {
    const clean = cleanFields([list[0], f('b', 'text', { show_if: { field: 'a', any_of: ['Maybe', 'Yes', 'Yes'] } })])
    expect(clean[1].show_if).toEqual({ field: 'a', any_of: ['Yes', 'Maybe'] })
    expect(cleanFields([list[1]])[0].show_if).toBeUndefined()
  })

  it('reads the conditions of a stored form and ignores broken ones', () => {
    const raw = JSON.stringify([
      { id: 'a', label: 'A', kind: 'choice', options: ['x', 'y'] },
      { id: 'b', label: 'B', kind: 'text', show_if: { field: 'a', any_of: ['y'] } },
      { id: 'c', label: 'C', kind: 'text', show_if: { field: 'a', any_of: 'no' } },
    ])
    const p = parseFields(raw)
    expect(p[1].show_if).toEqual({ field: 'a', any_of: ['y'] })
    expect(p[2].show_if).toBeUndefined()
  })
})

describe('anonymous answers', () => {
  const fields: Field[] = [{ id: 'a', label: 'A', kind: 'text', options: [], required: false, help: '' }]
  const rows = [{ id: null, name: null, at: null, values: { a: 'hi' } }]

  it('writes no name and no date in the CSV', () => {
    expect(buildCsv(fields, rows, { name: 'Name', submitted: 'Submitted' }, true)).toBe('A\r\nhi\r\n')
    expect(buildCsv(fields, rows, { name: 'Name', submitted: 'Submitted' })).toBe('Name,Submitted,A\r\n,,hi\r\n')
  })
})
