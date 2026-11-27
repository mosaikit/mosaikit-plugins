import { describe, expect, it } from 'vitest'
import { formatValue, humanize, rowsOf, verbOf } from './preview.ts'

const tool = { name: 'notes__create_note', description: 'Creates a note', input_schema: { properties: { title: { description: 'Title' }, due: { description: 'Due (YYYY-MM-DD)' }, done: { description: 'Done' } } } }

describe('a change said in words', () => {
  it('writes the values for a person', () => {
    expect(formatValue(true, 'en', 'Yes', 'No')).toBe('Yes')
    expect(formatValue(['a', 'b'], 'en', 'Yes', 'No')).toBe('a, b')
    expect(formatValue('2026-11-27', 'en', 'Yes', 'No')).toContain('2026')
    expect(formatValue('  hi ', 'en', 'Yes', 'No')).toBe('hi')
    expect(formatValue(null, 'en', 'Yes', 'No')).toBe('')
  })
  it('uses the labels of the schema, in its order, without the id or the empty fields', () => {
    const rows = rowsOf(tool, { done: false, id: 'x', extra_field: 'v', title: 'Minutes', due: '2026-11-27', empty: '' }, 'en', 'Yes', 'No')
    expect(rows.map((r) => r.label)).toEqual(['Title', 'Due', 'Done', 'Extra field'])
    expect(rows[2]!.value).toBe('No')
    expect(rowsOf(undefined, 'x', 'en', 'Yes', 'No')).toEqual([])
  })
  it('uses the labels and the order of the platform, in the language of the person', () => {
    const it = { ...tool, fields: [{ key: 'title', label: 'Titolo' }, { key: 'body', label: 'Testo' }] }
    // the model sent the text first (a JSON object has no order that counts): the title comes first
    const rows = rowsOf(it, { body: 'riunione di prova', title: 'Verbale' }, 'it', 'Sì', 'No')
    expect(rows.map((r) => [r.label, r.value])).toEqual([['Titolo', 'Verbale'], ['Testo', 'riunione di prova']])
  })
  it('marks a long text', () => {
    expect(rowsOf(tool, { title: 'a\nb' }, 'en', 'Yes', 'No')[0]!.long).toBe(true)
    expect(rowsOf(tool, { title: 'short' }, 'en', 'Yes', 'No')[0]!.long).toBe(false)
  })
  it('says what kind of change it is', () => {
    expect(verbOf('notes__create_note')).toBe('create')
    expect(verbOf('tasks__update_task')).toBe('update')
    expect(verbOf('kernel__search')).toBe('run')
    expect(humanize('open_mode')).toBe('Open mode')
  })
})
