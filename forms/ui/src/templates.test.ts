import { describe, expect, it } from 'vitest'
import { MAX_FIELDS, MAX_OPTIONS, MIN_OPTIONS, cleanFields, conditionProblem, firstProblem, hasOptions } from './logic.ts'
import { fieldsOf, templates } from './templates.ts'
import { TEXTS } from './texts.ts'

describe('templates', () => {
  for (const lang of ['en', 'it', 'es']) {
    const list = templates(TEXTS[lang]!)
    it(`${lang}: five templates, each a valid form that the builder accepts as it is`, () => {
      expect(list.map((t) => t.id)).toEqual(['event', 'feedback', 'contact', 'timeoff', 'bug'])
      for (const tpl of list) {
        expect(tpl.title.trim()).not.toBe('')
        expect(tpl.fields.length).toBeGreaterThan(0)
        expect(tpl.fields.length).toBeLessThanOrEqual(MAX_FIELDS)
        const fs = fieldsOf(tpl)
        expect(new Set(fs.map((f) => f.id)).size).toBe(fs.length)
        for (const f of fs) {
          expect(f.label.trim(), tpl.id).not.toBe('')
          if (hasOptions(f.kind)) {
            expect(f.options.length).toBeGreaterThanOrEqual(MIN_OPTIONS)
            expect(f.options.length).toBeLessThanOrEqual(MAX_OPTIONS)
            expect(new Set(f.options).size).toBe(f.options.length)
          }
        }
        expect(firstProblem(fs), tpl.id).toBeNull()
        expect(cleanFields(fs)).toHaveLength(fs.length)
      }
    })
  }

  it('a condition points at an earlier field with the options it names', () => {
    const fb = templates(TEXTS.en!).find((t) => t.id === 'feedback')!
    const fs = fieldsOf(fb)
    const email = fs[4]!
    expect(email.show_if).toEqual({ field: fs[3]!.id, any_of: ['Yes'] })
    expect(conditionProblem(fs, 4)).toBeNull()
  })

  it('every use makes new ids', () => {
    const t = templates(TEXTS.en!)[0]!
    const a = fieldsOf(t)
    const b = fieldsOf(t)
    expect(a[0]!.id).not.toBe(b[0]!.id)
  })
})
