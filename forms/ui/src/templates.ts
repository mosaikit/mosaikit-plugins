// Templates of the builder: a title, an introduction, a thank-you text and fields, so a new form starts from something real.
// Pure functions: the texts come from the language tables (`Texts`), the ids are made when a template is applied.
import { freshId, hasOptions, type Field, type Kind } from './logic.ts'
import type { Texts } from './texts.ts'

export type TemplateId = 'event' | 'feedback' | 'contact' | 'timeoff' | 'bug'

interface FieldSpec {
  label: string
  kind: Kind
  options?: string[]
  required?: boolean
  help?: string
  /** show this field only when the field at `field` (an index of the template) has one of the options `any` (indexes) */
  showIf?: { field: number; any: number[] }
}

export interface Template {
  id: TemplateId
  name: string
  desc: string
  title: string
  intro: string
  thanks: string
  fields: FieldSpec[]
}

export function templates(t: Texts): Template[] {
  return [
    {
      id: 'event',
      name: t.tpEventName,
      desc: t.tpEventDesc,
      title: t.tpEventName,
      intro: t.tpEventIntro,
      thanks: t.tpEventThanks,
      fields: [
        { label: t.tpName, kind: 'text', required: true },
        { label: t.tpEmail, kind: 'email', required: true },
        { label: t.tpAttending, kind: 'choice', options: [t.tpYes, t.tpNo, t.tpMaybe], required: true },
        { label: t.tpGuests, kind: 'number', help: t.tpGuestsHelp },
        { label: t.tpDiet, kind: 'text' },
        { label: t.tpComments, kind: 'longtext' },
      ],
    },
    {
      id: 'feedback',
      name: t.tpFeedbackName,
      desc: t.tpFeedbackDesc,
      title: t.tpFeedbackName,
      intro: t.tpFeedbackIntro,
      thanks: t.tpFeedbackThanks,
      fields: [
        { label: t.tpRating, kind: 'choice', options: [t.tpExcellent, t.tpGood, t.tpFair, t.tpPoor], required: true },
        { label: t.tpWell, kind: 'longtext' },
        { label: t.tpBetter, kind: 'longtext' },
        { label: t.tpContactMe, kind: 'choice', options: [t.tpYes, t.tpNo] },
        { label: t.tpEmail, kind: 'email', required: true, showIf: { field: 3, any: [0] } },
      ],
    },
    {
      id: 'contact',
      name: t.tpContactName,
      desc: t.tpContactDesc,
      title: t.tpContactName,
      intro: t.tpContactIntro,
      thanks: t.tpContactThanks,
      fields: [
        { label: t.tpName, kind: 'text', required: true },
        { label: t.tpEmail, kind: 'email', required: true },
        { label: t.tpTopic, kind: 'choice', options: [t.tpQuestion, t.tpQuote, t.tpSupport, t.tpOther] },
        { label: t.tpMessage, kind: 'longtext', required: true },
      ],
    },
    {
      id: 'timeoff',
      name: t.tpTimeoffName,
      desc: t.tpTimeoffDesc,
      title: t.tpTimeoffName,
      intro: t.tpTimeoffIntro,
      thanks: t.tpTimeoffThanks,
      fields: [
        { label: t.tpName, kind: 'text', required: true },
        { label: t.tpFrom, kind: 'date', required: true },
        { label: t.tpTo, kind: 'date', required: true },
        { label: t.tpLeaveType, kind: 'choice', options: [t.tpVacation, t.tpSick, t.tpPersonal, t.tpOther], required: true },
        { label: t.tpNotes, kind: 'longtext' },
      ],
    },
    {
      id: 'bug',
      name: t.tpBugName,
      desc: t.tpBugDesc,
      title: t.tpBugName,
      intro: t.tpBugIntro,
      thanks: t.tpBugThanks,
      fields: [
        { label: t.tpSummary, kind: 'text', required: true },
        { label: t.tpSteps, kind: 'longtext', required: true },
        { label: t.tpSeverity, kind: 'choice', options: [t.tpLow, t.tpMedium, t.tpHigh, t.tpCritical] },
        { label: t.tpWhere, kind: 'text' },
        { label: t.tpEmail, kind: 'email' },
      ],
    },
  ]
}

/** The fields of a template with fresh ids (a condition points at the id of the field it names). Labels are cut to the limit of a field. */
export function fieldsOf(tpl: Template, mk: () => string = freshId): Field[] {
  const ids = tpl.fields.map(() => mk())
  return tpl.fields.map((s, i): Field => {
    const options = hasOptions(s.kind) ? (s.options ?? []).map((o) => o.slice(0, 100)) : []
    const f: Field = { id: ids[i]!, label: s.label.slice(0, 120), kind: s.kind, options, required: s.required === true, help: (s.help ?? '').slice(0, 200) }
    if (s.showIf) {
      const src = tpl.fields[s.showIf.field]
      const any_of = s.showIf.any.map((k) => src?.options?.[k]).filter((o): o is string => typeof o === 'string' && o !== '')
      if (src && any_of.length) f.show_if = { field: ids[s.showIf.field]!, any_of }
    }
    return f
  })
}
