// The form as a person fills it in, shared by the app («Fill in») and the public page: labels, a fieldset with a legend for
// the choices, help texts, the same checks as the logic of the plugin made before sending, an error summary with
// `role="alert"` and, for the public page, a honeypot a person never sees. Every text is a DOM text node (never HTML).
import { el } from '@mosaikit/plugin-api'
import { MAX_LONG, MAX_TEXT, checkValues, valuesToSend, type Field, type Values } from './logic.ts'
import { sub, type Texts } from './texts.ts'

export interface FillOptions {
  fields: Field[]
  t: Texts
  /** unique among the forms of a page: ids of the controls */
  prefix: string
  /** add the honeypot field (public page) */
  honeypot: boolean
  /** sends the values (already checked and trimmed) and the honeypot; a refusal is thrown and shown by `errorText` */
  onSubmit: (values: Values, honey: string) => Promise<void>
  errorText: (e: unknown) => string
}

export function fillForm(o: FillOptions): HTMLFormElement {
  const { t } = o
  const values: Values = {}
  const form = el('form', { class: 'fm-fill', novalidate: 'true', 'data-testid': 'fill' })
  const summary = el('div', { class: 'fm-errors', role: 'alert', 'data-testid': 'errors' })
  summary.hidden = true
  form.append(summary)
  const inputs = new Map<string, HTMLElement>()
  const inlines = new Map<string, HTMLElement>()

  o.fields.forEach((f, i) => {
    const base = `${o.prefix}-${i}`
    const describedBy = [f.help ? `${base}-help` : '', `${base}-err`].filter(Boolean).join(' ')
    const err = el('p', { class: 'fm-err', id: `${base}-err` })
    err.hidden = true
    inlines.set(f.id, err)
    const help = f.help ? el('p', { class: 'fm-help', id: `${base}-help` }, f.help) : null
    const mark = el('span', { class: 'fm-req' }, f.required ? t.requiredMark : '')
    let box: HTMLElement
    if (f.kind === 'choice' || f.kind === 'multi') {
      box = el('fieldset', { class: 'fm-field fm-group', 'aria-describedby': describedBy })
      box.append(el('legend', {}, f.label, f.required ? el('span', { class: 'fm-req' }, t.requiredMark) : ''))
      f.options.forEach((opt) => {
        const input = el('input', { type: f.kind === 'choice' ? 'radio' : 'checkbox', name: base, value: opt })
        input.addEventListener('change', () => {
          if (f.kind === 'multi') {
            const cur = new Set((values[f.id] as string[] | undefined) ?? [])
            if (input.checked) cur.add(opt)
            else cur.delete(opt)
            values[f.id] = f.options.filter((x) => cur.has(x))
          } else values[f.id] = opt
        })
        if (!inputs.has(f.id)) inputs.set(f.id, input)
        box.append(el('label', { class: 'fm-pick' }, input, el('span', {}, opt)))
      })
      if (help) box.append(help)
    } else {
      box = el('div', { class: 'fm-field' })
      const id = `${base}-in`
      let input: HTMLInputElement | HTMLTextAreaElement
      if (f.kind === 'longtext') input = el('textarea', { rows: '4', maxlength: String(MAX_LONG) })
      else {
        input = el('input', { type: f.kind === 'date' ? 'date' : 'text', maxlength: String(f.kind === 'date' ? 10 : MAX_TEXT) })
        if (f.kind === 'email') input.setAttribute('inputmode', 'email')
        if (f.kind === 'number') input.setAttribute('inputmode', 'decimal')
        if (f.kind === 'email') input.setAttribute('autocomplete', 'email')
      }
      input.id = id
      input.setAttribute('aria-describedby', describedBy)
      if (f.required) input.setAttribute('aria-required', 'true')
      input.addEventListener('input', () => (values[f.id] = input.value))
      inputs.set(f.id, input)
      box.append(el('label', { for: id }, f.label), mark, input)
      if (help) box.append(help)
    }
    box.append(err)
    form.append(box)
  })

  let honey = ''
  if (o.honeypot) {
    // a field no person sees or reaches: a program that fills every field is refused by the form
    const trap = el('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-label': t.honey })
    trap.addEventListener('input', () => (honey = trap.value))
    form.append(el('div', { class: 'fm-trap', 'aria-hidden': 'true' }, trap))
  }

  const send = el('button', { type: 'submit', class: 'msk-btn' }, t.send)
  form.append(el('div', { class: 'fm-acts' }, send))

  const showSummary = (lines: string[], titled = true) => {
    summary.replaceChildren()
    summary.hidden = lines.length === 0
    if (!lines.length) return
    if (titled) summary.append(el('strong', {}, t.fixTitle))
    const ul = el('ul', {})
    for (const l of lines) ul.append(el('li', {}, l))
    summary.append(ul)
  }

  form.addEventListener('submit', (ev) => {
    ev.preventDefault()
    const errors = checkValues(o.fields, values)
    inlines.forEach((p) => {
      p.hidden = true
      p.textContent = ''
    })
    inputs.forEach((c) => c.removeAttribute('aria-invalid'))
    if (errors.length) {
      const lines = errors.map((e) => sub(t[e.key], { label: e.label, max: e.max ?? 0 }))
      errors.forEach((e, k) => {
        const p = inlines.get(e.id)
        if (p) {
          p.textContent = lines[k]
          p.hidden = false
        }
        inputs.get(e.id)?.setAttribute('aria-invalid', 'true')
      })
      showSummary(lines)
      inputs.get(errors[0].id)?.focus()
      return
    }
    showSummary([])
    send.disabled = true
    void o
      .onSubmit(valuesToSend(o.fields, values), honey)
      .catch((e) => {
        showSummary([o.errorText(e)], false)
        send.disabled = false
      })
  })
  return form
}
