// UI of the Forms plugin: the list of forms (state, number of answers, public link), the builder of the fields, the detail with
// the tabs «Fill in» and «Answers» (a table, the counts per option and the export to CSV). Every text is a DOM text node.
import '@mosaikit/plugin-api/style.css'
import './forms.css'
import {
  confirmDialog,
  connect,
  dateField,
  dialog,
  el,
  emptyState,
  errText,
  segmented,
  skeleton,
  toast,
  type Msk,
  type Row,
} from '@mosaikit/plugin-api'
import { fillForm } from './fill.ts'
import {
  KINDS,
  MAX_FIELDS,
  MAX_OPTIONS,
  MIN_OPTIONS,
  branchSources,
  buildCsv,
  cleanFields,
  firstProblem,
  hasOptions,
  isOpen,
  moveItem,
  removeField,
  newField,
  parseFields,
  pct,
  slug,
  todayLocal,
  validMaxAnswers,
  valueText,
  type AnswerRow,
  type Field,
  type Kind,
  type Value,
} from './logic.ts'
import { bindTexts, TEXTS, langOf, sub, type Texts } from './texts.ts'

const app = document.getElementById('app')!

interface Form {
  id: string
  row: Row
  title: string
  intro: string
  fields: Field[]
  open: boolean
  closesOn: string
  max: string
  thanks: string
  anonymous: boolean
}
interface Overview {
  mine: string[]
  counts: Record<string, number>
}
interface Results {
  anonymous?: boolean
  total: number
  truncated: boolean
  fields: { id: string; kind: Kind; answered: number; counts?: number[] }[]
  answers: { id: string | null; name: string | null; at: string | null; values: Record<string, Value | undefined> }[]
}

type View = { kind: 'list' } | { kind: 'detail'; f: Form; tab: 'fill' | 'answers'; done?: string }

function mount(msk: Msk) {
  document.documentElement.classList.add('msk-fill')
  bindTexts(msk)
  let lang = langOf(msk.context?.lang)
  const tr = (): Texts => TEXTS[lang]
  const api = msk.crud('forms')
  let forms: Form[] = []
  let over: Overview = { mine: [], counts: {} }
  let filter: 'open' | 'closed' | 'all' = 'all'
  let view: View = { kind: 'list' }

  const fail = (e: unknown) => toast(errText(e, msk.context?.lang), { tone: 'err', ms: 6000 })
  const head = el('header', { class: 'fm-head' })
  // focusable so a keyboard user can scroll it even when a page has nothing else to focus
  const body = el('div', { class: 'fm-body', tabindex: '0', role: 'region', 'aria-label': tr().title })
  app.replaceChildren(el('div', { class: 'fm' }, head, body))

  const day = (d: string) => (d ? new Date(d + 'T00:00:00').toLocaleDateString(msk.context?.lang || undefined, { dateStyle: 'medium' }) : '')
  const btn = (label: string, cls = 'msk-btn', onClick?: () => void) => {
    const b = el('button', { type: 'button', class: cls }, label)
    if (onClick) b.addEventListener('click', onClick)
    return b
  }
  const isWriter = (f: Form) => f.row.my_level === 'write' || f.row.my_level === 'manage'
  const isManager = (f: Form) => f.row.my_level === 'manage'
  const fCount = (f: Form) => (f.fields.length === 0 ? tr().noFields : f.fields.length === 1 ? tr().fieldsOne : sub(tr().fieldsN, { n: f.fields.length }))

  const toForm = (r: Row): Form => ({
    id: r.id,
    row: r,
    title: String(r.values.title ?? ''),
    intro: String(r.values.intro ?? ''),
    fields: parseFields(r.values.fields),
    open: r.values.open === true,
    closesOn: String(r.values.closes_on ?? ''),
    max: String(r.values.max_answers ?? ''),
    thanks: String(r.values.thanks ?? ''),
    anonymous: r.values.anonymous === true,
  })

  // ------------------------------------------------------------------------------------------------------ the builder
  const builder = (existing?: Form) => {
    let fs: Field[] = existing ? existing.fields.map((f) => ({ ...f, options: [...f.options] })) : []
    let closes = existing?.closesOn ?? ''
    const title = el('input', { type: 'text', maxlength: '160', 'aria-label': tr().fTitle, placeholder: tr().fTitle })
    const intro = el('textarea', { rows: '3', 'aria-label': tr().fIntro, placeholder: tr().fIntro })
    const open = el('input', { type: 'checkbox', id: 'fm-open' })
    const anon = el('input', { type: 'checkbox', id: 'fm-anon', 'data-testid': 'anonymous' })
    anon.checked = existing?.anonymous ?? false
    // an anonymous form stays anonymous (the people who answered were promised it)
    anon.disabled = existing?.anonymous === true
    const max = el('input', { type: 'number', min: '1', max: '5000', step: '1', 'aria-label': tr().fMax, placeholder: '1000' })
    const thanks = el('textarea', { rows: '2', maxlength: '500', 'aria-label': tr().fThanks, placeholder: tr().fThanks })
    title.value = existing?.title ?? ''
    intro.value = existing?.intro ?? ''
    open.checked = existing?.open ?? true
    max.value = existing?.max ?? ''
    thanks.value = existing?.thanks ?? ''
    const closesField = dateField({ label: tr().fCloses, value: closes, onChange: (v) => (closes = v) })
    const field = (label: string, input: HTMLElement) => el('div', { class: 'msk-field' }, el('label', {}, label), input)
    const check = (input: HTMLInputElement, label: string) => el('label', { class: 'fm-check' }, input, el('span', {}, label))
    const fbox = el('div', { class: 'fm-flist' })
    const kindLabel: Record<Kind, string> = { text: tr().kText, longtext: tr().kLong, choice: tr().kChoice, multi: tr().kMulti, number: tr().kNumber, date: tr().kDate, email: tr().kEmail }

    const drawFields = (focus?: string) => {
      fbox.replaceChildren()
      if (!fs.length) fbox.append(el('p', { class: 'fm-dim' }, tr().noFieldsBuilder))
      fs.forEach((f, fi) => {
        const n = fi + 1
        const block = el('section', { class: 'fm-fb', 'data-testid': 'field-block', 'aria-label': sub(tr().fieldN, { n }) })
        const up = btn('↑', 'msk-btn ghost mini', () => {
          fs = moveItem(fs, fi, -1)
          drawFields(`up-${f.id}`)
        })
        const down = btn('↓', 'msk-btn ghost mini', () => {
          fs = moveItem(fs, fi, 1)
          drawFields(`down-${f.id}`)
        })
        const del = btn('✕', 'msk-btn ghost mini danger-text', () => {
          fs = removeField(fs, f.id)
          drawFields('add')
        })
        up.setAttribute('aria-label', sub(tr().moveUp, { n }))
        down.setAttribute('aria-label', sub(tr().moveDown, { n }))
        del.setAttribute('aria-label', sub(tr().removeField, { n }))
        up.dataset.act = `up-${f.id}`
        down.dataset.act = `down-${f.id}`
        up.disabled = fi === 0
        down.disabled = fi === fs.length - 1
        block.append(el('div', { class: 'fm-fhead' }, el('h4', {}, sub(tr().fieldN, { n })), el('span', { class: 'fm-tools' }, up, down, del)))

        const label = el('input', { type: 'text', maxlength: '120', 'aria-label': sub(tr().fFieldLabel, { n }), placeholder: sub(tr().fFieldLabel, { n }) })
        label.value = f.label
        label.dataset.act = `label-${f.id}`
        label.addEventListener('input', () => (f.label = label.value))
        const kind = el('select', { 'aria-label': sub(tr().fKind, { n }) })
        for (const k of KINDS) kind.append(el('option', { value: k }, kindLabel[k]))
        kind.value = f.kind
        kind.addEventListener('change', () => {
          const k = kind.value as Kind
          f.kind = k
          if (hasOptions(k) && f.options.length < MIN_OPTIONS) f.options = [...f.options, ...Array(MIN_OPTIONS - f.options.length).fill('')]
          drawFields(`kind-${f.id}`)
        })
        kind.dataset.act = `kind-${f.id}`
        const required = el('input', { type: 'checkbox', 'aria-label': `${sub(tr().fieldN, { n })}: ${tr().fRequired}` })
        required.checked = f.required
        required.addEventListener('change', () => (f.required = required.checked))
        const help = el('input', { type: 'text', maxlength: '200', 'aria-label': sub(tr().fHelp, { n }), placeholder: sub(tr().fHelp, { n }) })
        help.value = f.help
        help.addEventListener('input', () => (f.help = help.value))
        block.append(label, el('div', { class: 'fm-frow' }, kind, el('label', { class: 'fm-check' }, required, el('span', {}, tr().fRequired))), help)

        // show this field only when an earlier answer matches
        const sources = branchSources(fs, fi)
        if (sources.length) {
          const src = el('select', { 'aria-label': sub(tr().fShowIf, { n }), 'data-testid': 'show-if' })
          src.append(el('option', { value: '' }, tr().showAlways))
          sources.forEach((s2) => src.append(el('option', { value: s2.id }, sub(tr().showIfQ, { n: fs.indexOf(s2) + 1 }))))
          src.value = f.show_if && sources.some((s2) => s2.id === f.show_if!.field) ? f.show_if.field : ''
          src.addEventListener('change', () => {
            if (src.value) f.show_if = { field: src.value, any_of: [] }
            else delete f.show_if
            drawFields(`showif-${f.id}`)
          })
          src.dataset.act = `showif-${f.id}`
          const cond = el('div', { class: 'fm-cond' }, el('span', { class: 'fm-dim' }, tr().showIfLabel), src)
          const source = sources.find((s2) => s2.id === f.show_if?.field)
          if (f.show_if && source) {
            const vals = el('div', { class: 'fm-condvals', role: 'group', 'aria-label': sub(tr().showIfValues, { n }) })
            for (const o of source.options) {
              const c = el('input', { type: 'checkbox', 'aria-label': `${sub(tr().showIfValues, { n })}: ${o}` })
              c.checked = f.show_if.any_of.includes(o)
              c.addEventListener('change', () => {
                const cur = new Set(f.show_if!.any_of)
                if (c.checked) cur.add(o)
                else cur.delete(o)
                f.show_if!.any_of = [...cur]
              })
              vals.append(el('label', { class: 'fm-check' }, c, el('span', {}, o || '…')))
            }
            cond.append(vals)
          }
          block.append(cond)
        }

        if (hasOptions(f.kind)) {
          const opts = el('div', { class: 'fm-opts' })
          f.options.forEach((o, oi) => {
            const line = el('div', { class: 'fm-optline' })
            const t = el('input', { type: 'text', maxlength: '100', 'aria-label': sub(tr().optionN, { n, o: oi + 1 }) })
            t.value = o
            t.dataset.act = `opt-${f.id}-${oi}`
            t.addEventListener('input', () => (f.options[oi] = t.value))
            line.append(t)
            if (f.options.length > MIN_OPTIONS) {
              const rm = btn('✕', 'msk-btn ghost mini', () => {
                f.options = f.options.filter((_, i) => i !== oi)
                drawFields(`add-${f.id}`)
              })
              rm.setAttribute('aria-label', sub(tr().removeOption, { n, o: oi + 1 }))
              line.append(rm)
            }
            opts.append(line)
          })
          if (f.options.length < MAX_OPTIONS) {
            const add = btn(tr().addOption, 'msk-btn ghost mini', () => {
              f.options.push('')
              drawFields(`opt-${f.id}-${f.options.length - 1}`)
            })
            add.dataset.act = `add-${f.id}`
            opts.append(add)
          }
          block.append(opts)
        }
        fbox.append(block)
      })
      if (fs.length < MAX_FIELDS) {
        const add = btn(tr().addField, 'msk-btn ghost', () => {
          fs.push(newField('text'))
          drawFields(`label-${fs[fs.length - 1].id}`)
        })
        add.dataset.act = 'add'
        fbox.append(add)
      }
      if (focus) {
        let target = fbox.querySelector<HTMLElement>(`[data-act="${focus}"]`)
        if (!target || (target as HTMLButtonElement).disabled) {
          const other = focus.startsWith('up-') ? focus.replace('up-', 'down-') : focus.startsWith('down-') ? focus.replace('down-', 'up-') : ''
          target = (other && fbox.querySelector<HTMLElement>(`[data-act="${other}"]`)) || fbox.querySelector<HTMLElement>('[data-act="add"]')
        }
        target?.focus()
      }
    }

    const ok = btn(existing ? tr().save : tr().create)
    const no = btn(tr().cancel, 'msk-btn ghost')
    const form = el(
      'div',
      { class: 'fm-form' },
      field(tr().fTitle, title),
      field(tr().fIntro, intro),
      check(open, tr().fOpen),
      check(anon, tr().fAnonymous),
      el('p', { class: 'fm-dim' }, tr().anonNote),
      el('div', { class: 'fm-row' }, field(tr().fCloses, closesField.el), field(tr().fMax, max)),
      field(tr().fThanks, thanks),
      el('h3', { class: 'fm-sub' }, tr().fFields),
      fbox,
    )
    const d = dialog({ title: existing ? tr().editTitle : tr().newTitle, body: form, actions: [no, ok] })
    no.addEventListener('click', d.close)
    drawFields()
    const save = async () => {
      if (!title.value.trim()) {
        toast(tr().needTitle, { tone: 'err' })
        return title.focus()
      }
      if (!validMaxAnswers(max.value)) {
        toast(tr().badMax, { tone: 'err' })
        return max.focus()
      }
      const problem = firstProblem(fs)
      if (problem) {
        toast(sub(tr()[problem.key], { n: problem.index + 1 }), { tone: 'err', ms: 6000 })
        const bad = fs[problem.index]
        if (bad) fbox.querySelector<HTMLElement>(`[data-act="label-${bad.id}"]`)?.focus()
        return
      }
      ok.disabled = true
      const values = {
        title: title.value.trim(),
        intro: intro.value,
        open: open.checked,
        closes_on: closes,
        max_answers: max.value.trim(),
        thanks: thanks.value.trim(),
        anonymous: anon.checked,
        fields: JSON.stringify(cleanFields(fs)),
      }
      try {
        if (existing) await api.update(existing.id, values)
        else await api.create(values)
        d.close()
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
  const remove = async (f: Form) => {
    if (!(await confirmDialog({ title: tr().remove, text: sub(tr().removeConfirm, { n: f.title }), ok: tr().remove, cancel: tr().cancel, danger: true }))) return
    try {
      await api.remove(f.id)
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

  const card = (f: Form, today: string) => {
    const on = isOpen(f, today)
    const answered = over.mine.includes(f.id)
    const c = el('article', { class: 'fm-card', 'data-testid': 'form' })
    const chips = el('div', { class: 'fm-chips' }, el('span', { class: `fm-state ${on ? 'open' : 'closed'}` }, on ? tr().stateOpen : tr().stateClosed))
    if (answered) chips.append(el('span', { class: 'fm-done' }, '✓ ' + tr().answered))
    const meta = [fCount(f), f.closesOn && on ? sub(tr().closesOn, { d: day(f.closesOn) }) : '', sub(tr().by, { n: f.row.owner_name })]
    if (isWriter(f)) {
      const n = over.counts[f.id] ?? 0
      meta.splice(1, 0, n === 1 ? tr().answersOne : sub(tr().answersN, { n }))
    }
    const titleBtn = el('button', { type: 'button', class: 'fm-titlebtn' }, f.title)
    titleBtn.addEventListener('click', () => go({ kind: 'detail', f, tab: 'fill' }))
    c.append(chips, el('h2', {}, titleBtn), el('p', { class: 'fm-meta' }, meta.filter(Boolean).join(' · ')))
    if (f.intro.trim()) c.append(el('p', { class: 'fm-intro' }, f.intro))
    const acts = el('div', { class: 'fm-acts' })
    if (on && !answered && f.fields.length) acts.append(btn(tr().fillIn, 'msk-btn', () => go({ kind: 'detail', f, tab: 'fill' })))
    if (isWriter(f)) acts.append(btn(tr().answersTab, 'msk-btn ghost mini', () => go({ kind: 'detail', f, tab: 'answers' })))
    if (isManager(f)) acts.append(btn(tr().publicLink, 'msk-btn ghost mini', () => void msk.share(f.id).catch(fail)))
    if (isWriter(f)) acts.append(btn(tr().edit, 'msk-btn ghost mini', () => builder(f)))
    if (isManager(f)) {
      acts.append(btn(tr().share, 'msk-btn ghost mini', () => void msk.share(f.id).catch(fail)), btn(tr().remove, 'msk-btn ghost mini danger-text', () => void remove(f)))
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
    const add = btn(tr().newForm, 'msk-btn', () => builder())
    add.hidden = !msk.can('create')
    head.append(seg.el, add)
    body.replaceChildren()
    if (!forms.length) {
      body.append(emptyState({ art: 'forms', title: tr().emptyTitle, text: tr().emptyText, actions: msk.can('create') ? [btn(tr().newForm, 'msk-btn', () => builder())] : [] }))
      return
    }
    const shown = forms.filter((f) => filter === 'all' || (filter === 'open') === isOpen(f, today))
    if (!shown.length) {
      body.append(emptyState({ art: 'forms', title: tr().emptyFilter, text: '' }))
      return
    }
    const feed = el('div', { class: 'fm-feed' })
    for (const f of shown) feed.append(card(f, today))
    body.append(feed)
  }

  // --------------------------------------------------------------------------------------------------------- the detail
  const drawDetail = (v: Extract<View, { kind: 'detail' }>) => {
    const f = v.f
    head.replaceChildren(btn(tr().back, 'msk-btn ghost mini', () => go({ kind: 'list' })), el('h1', {}, f.title))
    if (isWriter(f)) {
      const seg = segmented({
        label: tr().tabs,
        value: v.tab,
        options: [
          { key: 'fill', label: tr().fillIn },
          { key: 'answers', label: tr().answersTab },
        ],
        onChange: (k) => go({ kind: 'detail', f, tab: k as 'fill' | 'answers' }),
      })
      head.append(seg.el)
    }
    if (v.tab === 'answers' && isWriter(f)) void drawAnswers(f)
    else drawFill(f, v.done)
  }

  const drawFill = (f: Form, done?: string) => {
    const wrap = el('div', { class: 'fm-page' })
    if (done !== undefined) {
      wrap.append(
        el('section', { class: 'fm-thanks', role: 'status', 'data-testid': 'thanks' }, el('h2', {}, tr().thanksTitle), el('p', {}, done || tr().thanksDefault)),
        el('div', { class: 'fm-acts' }, btn(tr().backToList, 'msk-btn', () => go({ kind: 'list' }))),
      )
    } else if (!isOpen(f, todayLocal())) wrap.append(el('p', { class: 'fm-notice', role: 'status' }, tr().closedNotice))
    else if (over.mine.includes(f.id)) wrap.append(el('p', { class: 'fm-notice', role: 'status' }, tr().answeredNotice))
    else if (!f.fields.length) wrap.append(el('p', { class: 'fm-notice', role: 'status' }, tr().noFieldsFill))
    else {
      if (f.intro.trim()) wrap.append(el('p', { class: 'fm-intro' }, f.intro))
      wrap.append(
        fillForm({
          fields: f.fields,
          t: tr(),
          prefix: 'fm',
          honeypot: false,
          errorText: (e) => errText(e, msk.context?.lang),
          onSubmit: async (values) => {
            const out = await msk.call<{ ok: boolean; thanks: string }>('forms.submit', { id: f.id, values })
            if (!over.mine.includes(f.id)) over.mine.push(f.id)
            go({ kind: 'detail', f, tab: 'fill', done: out.thanks })
            await refreshOverview()
          },
        }),
      )
    }
    body.replaceChildren(wrap)
  }

  const download = (name: string, text: string) => {
    const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = el('a', { href: url, download: name })
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  const barRow = (label: string, n: number, total: number) => {
    const p = pct(n, total)
    const fill = el('span', { class: 'fm-fill-bar' })
    fill.style.setProperty('--w', `${p}%`)
    return el('div', { class: 'fm-barrow', 'data-testid': 'bar' }, el('span', { class: 'fm-barlabel' }, label), el('span', { class: 'fm-track', 'aria-hidden': 'true' }, fill), el('span', { class: 'fm-barn' }, `${n} (${p}%)`))
  }

  const when = (at: string) => {
    const d = new Date(at.replace(' ', 'T'))
    return Number.isNaN(d.getTime()) ? at : d.toLocaleString(msk.context?.lang || undefined, { dateStyle: 'medium', timeStyle: 'short' })
  }

  const drawAnswers = async (f: Form) => {
    body.replaceChildren(skeleton({ kind: 'cards', count: 2 }))
    let r: Results
    try {
      r = await msk.call<Results>('forms.results', { id: f.id })
    } catch (e) {
      fail(e)
      return go({ kind: 'list' })
    }
    const wrap = el('div', { class: 'fm-page' })
    const anonymous = r.anonymous === true
    const rows: AnswerRow[] = r.answers.map((a) => ({ id: a.id, name: a.name, at: a.at, values: a.values }))
    const exp = btn(tr().exportCsv, 'msk-btn ghost mini', () => {
      download(slug(f.title) + '.csv', buildCsv(f.fields, rows, { name: tr().csvName, submitted: tr().csvWhen }, anonymous))
      toast(tr().exported, { tone: 'ok' })
    })
    exp.disabled = r.total === 0
    head.append(exp)
    wrap.append(el('p', { class: 'fm-summary', 'data-testid': 'summary' }, `${tr().total}: ${r.total}`))
    if (anonymous) wrap.append(el('p', { class: 'fm-dim', 'data-testid': 'anonymous-note' }, tr().anonResults))
    if (r.truncated) wrap.append(el('p', { class: 'fm-dim' }, tr().truncated))
    if (!r.total) {
      wrap.append(el('p', { class: 'fm-dim' }, tr().noAnswers))
      body.replaceChildren(wrap)
      return
    }
    const withCounts = f.fields.filter((x) => hasOptions(x.kind))
    if (withCounts.length) wrap.append(el('h3', { class: 'fm-sub' }, tr().counts))
    for (const x of withCounts) {
      const a = r.fields.find((y) => y.id === x.id)
      if (!a) continue
      const c = el('section', { class: 'fm-result', 'data-testid': 'result' }, el('h3', {}, x.label), el('p', { class: 'fm-dim' }, sub(tr().countOf, { a: a.answered, t: r.total })))
      x.options.forEach((o, k) => c.append(barRow(o, a.counts?.[k] ?? 0, a.answered || r.total)))
      wrap.append(c)
    }
    const table = el('table', { class: 'fm-table', 'data-testid': 'answers' })
    const hr = el('tr', {}, ...(anonymous ? [el('th', { scope: 'col' }, tr().colResponse)] : [el('th', { scope: 'col' }, tr().colName), el('th', { scope: 'col' }, tr().colWhen)]), ...f.fields.map((x) => el('th', { scope: 'col' }, x.label)))
    if (isManager(f) && !anonymous) hr.append(el('th', { scope: 'col' }, tr().colActions))
    table.append(el('thead', {}, hr))
    const tb = el('tbody')
    let nth = 0
    for (const a of r.answers) {
      nth += 1
      const row = el('tr', { 'data-testid': 'answer' }, ...(anonymous || !a.at ? [el('td', {}, sub(tr().responseN, { n: nth }))] : [el('td', {}, a.name ?? ''), el('td', {}, when(a.at))]), ...f.fields.map((x) => el('td', {}, valueText(a.values[x.id]))))
      if (isManager(f) && !anonymous && a.id) {
        const who = a.id
        row.append(
          el(
            'td',
            {},
            (() => {
              const b = btn(tr().deleteAnswer, 'msk-btn ghost mini danger-text', () => void removeAnswer(f, { id: who, name: a.name ?? '' }))
              b.setAttribute('aria-label', sub(tr().deleteLabel, { n: a.name ?? '' }))
              return b
            })(),
          ),
        )
      }
      tb.append(row)
    }
    table.append(tb)
    wrap.append(el('h3', { class: 'fm-sub' }, tr().total), el('div', { class: 'fm-tablewrap', tabindex: '0', role: 'region', 'aria-label': tr().total }, table))
    body.replaceChildren(wrap)
  }

  const removeAnswer = async (f: Form, a: { id: string; name: string }) => {
    if (!(await confirmDialog({ title: tr().deleteAnswer, text: sub(tr().deleteConfirm, { n: a.name }), ok: tr().deleteAnswer, cancel: tr().cancel, danger: true }))) return
    try {
      await msk.call('forms.delete_answer', { id: f.id, answer_user: a.id })
      toast(tr().deleted, { tone: 'ok' })
      await refreshOverview()
      go({ kind: 'detail', f, tab: 'answers' })
    } catch (e) {
      fail(e)
    }
  }

  // ------------------------------------------------------------------------------------------------------------ the page
  const draw = () => {
    if (view.kind === 'list') return drawList()
    drawDetail(view)
  }

  const refreshOverview = async () => {
    try {
      over = await msk.call<Overview>('forms.overview')
    } catch {
      over = { mine: [], counts: {} }
    }
  }

  const load = async () => {
    view = { kind: 'list' }
    head.replaceChildren(el('h1', {}, tr().title))
    body.replaceChildren(skeleton({ kind: 'cards', count: 3 }))
    try {
      forms = (await api.list({ sort: 'created_at', dir: 'desc', limit: 200 })).rows.map(toForm)
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
  void msk.loading(load())
}

connect()
  .then(mount)
  .catch((e) => {
    app.textContent = TEXTS[langOf(undefined)].failed + errText(e)
  })
