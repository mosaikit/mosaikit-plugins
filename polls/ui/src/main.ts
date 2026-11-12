// UI of the Polls plugin: the list of polls, one poll with its options and its results as live bars, and the form.
// Results come from the command `polls.results` (it decides what this person may see); a small frame on the realtime
// channel `results` tells the others to ask again, so the bars move without reloading.
import '@mosaikit/plugin-api/style.css'
import './polls.css'
import {
  avatar,
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
  type RealtimeChannel,
  type Row,
} from '@mosaikit/plugin-api'
import {
  MAX_OPTIONS,
  MIN_OPTIONS,
  applyFilter,
  checkOptions,
  debounce,
  isClosed,
  parseOptions,
  resultsOf,
  toggleChoice,
  todayLocal,
  winners,
  type Filter,
  type Results,
} from './logic.ts'
import { TEXTS, langOf, sub } from './texts.ts'

const app = document.getElementById('app')!

interface Poll {
  id: string
  row: Row
  question: string
  details: string
  options: string[]
  multiple: boolean
  hideVoters: boolean
  results: Results
  closesOn: string
  closed: boolean
  createdAt: string
}
interface Overview {
  mine: string[]
  counts: Record<string, number>
}
interface Outcome {
  options: { label: string; votes: number; percent: number; voters: { id: string; name: string }[] }[]
  total_voters: number
  visitors?: number
  mine: number[]
  closed: boolean
  visible: boolean
  hide_voters: boolean
}

function mount(msk: Msk) {
  document.documentElement.classList.add('msk-fill')
  let lang = langOf(msk.context?.lang)
  const tr = () => TEXTS[lang]
  const api = msk.crud('polls')
  let polls: Poll[] = []
  let over: Overview = { mine: [], counts: {} }
  let filter: Filter = 'open'
  // the poll that is open, its results, the choices ticked and the live channel
  let current: Poll | null = null
  let outcome: Outcome | null = null
  let chosen: number[] = []
  let chan: RealtimeChannel | null = null

  const fail = (e: unknown) => toast(errText(e, msk.context?.lang), { tone: 'err', ms: 6000 })
  const head = el('header', { class: 'po-head' })
  const body = el('div', { class: 'po-body' })
  app.replaceChildren(el('div', { class: 'po' }, head, body))

  const day = (d: string) => (d ? new Date(d + 'T00:00:00').toLocaleDateString(msk.context?.lang || undefined, { dateStyle: 'medium' }) : '')
  const button = (label: string, cls = 'msk-btn ghost mini', on?: () => void) => {
    const b = el('button', { type: 'button', class: cls }, label)
    if (on) b.addEventListener('click', on)
    return b
  }

  const toPoll = (r: Row): Poll => ({
    id: r.id,
    row: r,
    question: String(r.values.question ?? ''),
    details: String(r.values.details ?? ''),
    options: parseOptions(r.values.options),
    multiple: r.values.multiple === true,
    hideVoters: r.values.hide_voters === true,
    results: resultsOf(r.values.results),
    closesOn: String(r.values.closes_on ?? ''),
    closed: r.values.closed === true,
    createdAt: r.created_at,
  })
  const closedNow = (p: Poll) => isClosed(p, todayLocal())
  const canEdit = (p: Poll) => p.row.my_level === 'write' || p.row.my_level === 'manage'
  const values = (p: Poll, patch: Record<string, unknown> = {}) => ({
    question: p.question,
    details: p.details,
    options: JSON.stringify(p.options),
    multiple: p.multiple,
    hide_voters: p.hideVoters,
    results: p.results,
    closes_on: p.closesOn,
    closed: p.closed,
    ...patch,
  })

  // ----------------------------------------------------------------------------------------------------------- the form
  const form = (existing?: Poll) => {
    const question = el('input', { type: 'text', maxlength: '200', 'aria-label': tr().fQuestion, placeholder: tr().fQuestion })
    const details = el('textarea', { rows: '3', maxlength: '2000', 'aria-label': tr().fDetails, placeholder: tr().fDetails })
    const results = el('select', { 'aria-label': tr().fResults })
    for (const [k, label] of [['always', tr().always], ['after_vote', tr().afterVote], ['after_close', tr().afterClose]] as const) results.append(el('option', { value: k }, label))
    let closes = existing?.closesOn ?? ''
    const closesField = dateField({ label: tr().fCloses, value: closes, onChange: (v) => (closes = v) })
    const multiple = el('input', { type: 'checkbox', id: 'po-multiple' })
    const hide = el('input', { type: 'checkbox', id: 'po-hide' })
    question.value = existing?.question ?? ''
    details.value = existing?.details ?? ''
    results.value = existing?.results ?? 'after_vote'
    multiple.checked = existing?.multiple ?? false
    hide.checked = existing?.hideVoters ?? false
    let opts = existing?.options.length ? [...existing.options] : ['', '']
    const list = el('div', { class: 'po-optlist', role: 'group', 'aria-label': tr().fOptions })
    const add = button(tr().addOption, 'msk-btn ghost mini')
    const drawOptions = (focus = -1) => {
      list.replaceChildren()
      opts.forEach((value, i) => {
        const input = el('input', { type: 'text', maxlength: '100', 'aria-label': sub(tr().fOption, { n: i + 1 }), placeholder: sub(tr().fOption, { n: i + 1 }) })
        input.value = value
        input.addEventListener('input', () => (opts[i] = input.value))
        const rm = button('✕', 'msk-btn ghost mini', () => {
          opts.splice(i, 1)
          drawOptions(Math.max(0, i - 1))
        })
        rm.setAttribute('aria-label', sub(tr().removeOption, { n: i + 1 }))
        rm.disabled = opts.length <= MIN_OPTIONS
        list.append(el('div', { class: 'po-optrow' }, input, rm))
        if (i === focus) queueMicrotask(() => input.focus())
      })
      add.disabled = opts.length >= MAX_OPTIONS
    }
    add.addEventListener('click', () => {
      opts.push('')
      drawOptions(opts.length - 1)
    })
    drawOptions()
    const field = (label: string, input: HTMLElement) => el('div', { class: 'msk-field' }, el('label', {}, label), input)
    const check = (input: HTMLInputElement, label: string) => el('label', { class: 'po-check' }, input, el('span', {}, label))
    const ok = el('button', { type: 'button', class: 'msk-btn' }, existing ? tr().save : tr().create)
    const no = el('button', { type: 'button', class: 'msk-btn ghost' }, tr().cancel)
    const warn = existing && (over.counts[existing.id] ?? 0) > 0 ? [el('p', { class: 'po-note warn', role: 'note' }, tr().editWarning)] : []
    const d = dialog({
      title: existing ? tr().editTitle : tr().newTitle,
      body: el(
        'div',
        { class: 'po-form' },
        ...warn,
        field(tr().fQuestion, question),
        field(tr().fDetails, details),
        el('div', { class: 'msk-field' }, el('span', { class: 'msk-label' }, tr().fOptions), list, add),
        check(multiple, tr().fMultiple),
        check(hide, tr().fHide),
        el('div', { class: 'po-row' }, field(tr().fResults, results), field(tr().fCloses, closesField.el)),
      ),
      actions: [no, ok],
    })
    no.addEventListener('click', d.close)
    const go = async () => {
      if (!question.value.trim()) {
        toast(tr().needQuestion, { tone: 'err' })
        return question.focus()
      }
      const checked = checkOptions(opts)
      if ('problem' in checked) return toast(tr()[`pOpt_${checked.problem}` as const], { tone: 'err' })
      ok.disabled = true
      const v = {
        question: question.value.trim(),
        details: details.value,
        options: JSON.stringify(checked.options),
        multiple: multiple.checked,
        hide_voters: hide.checked,
        results: results.value,
        closes_on: closes,
        closed: existing?.closed ?? false,
      }
      try {
        const saved = existing ? await api.update(existing.id, v) : await api.create(v)
        d.close()
        await load()
        if (existing && current?.id === existing.id) {
          current = toPoll(saved)
          void refreshDetail()
          sendFrame()
        }
      } catch (e) {
        fail(e)
        ok.disabled = false
      }
    }
    ok.addEventListener('click', () => void go())
    question.focus()
  }

  // ------------------------------------------------------------------------------------------------------- the list
  const stateChip = (p: Poll) => {
    const closed = closedNow(p)
    return el('span', { class: `po-state${closed ? ' closed' : ''}` }, closed ? tr().stateClosed : tr().stateOpen)
  }
  const whenText = (p: Poll) => (p.closesOn && !closedNow(p) ? sub(tr().closesOn, { d: day(p.closesOn) }) : '')
  const votersText = (n: number) => (n === 0 ? tr().noVoters : n === 1 ? tr().oneVoter : sub(tr().voters, { n }))

  const card = (p: Poll) => {
    const open = button(p.question, 'po-open', () => void show(p.id))
    const chips = el('div', { class: 'po-chips' }, stateChip(p))
    if (whenText(p)) chips.append(el('span', { class: 'po-meta' }, whenText(p)))
    if (over.mine.includes(p.id)) chips.append(el('span', { class: 'msk-badge' }, '✓ ' + tr().voted))
    const c = el(
      'article',
      { class: `po-card${closedNow(p) ? ' closed' : ''}`, 'data-testid': 'poll' },
      chips,
      el('h2', {}, open),
      el('p', { class: 'po-meta' }, [votersText(over.counts[p.id] ?? 0), sub(tr().by, { n: p.row.owner_name })].join(' · ')),
    )
    c.addEventListener('click', (e) => {
      if (e.target === c || (e.target as HTMLElement).tagName === 'H2' || (e.target as HTMLElement).tagName === 'P') void show(p.id)
    })
    return c
  }

  const drawList = () => {
    head.replaceChildren(el('h1', {}, tr().title))
    const seg = segmented({
      label: tr().filter,
      value: filter,
      options: [
        { key: 'open', label: tr().open },
        { key: 'closed', label: tr().closed },
        { key: 'all', label: tr().all },
      ],
      onChange: (k) => {
        filter = k as Filter
        drawList()
      },
    })
    const add = button(tr().newPoll, 'msk-btn', () => form())
    add.hidden = !msk.can('create')
    head.append(seg.el, add)
    body.replaceChildren()
    if (!polls.length) {
      body.append(emptyState({ art: 'polls', title: tr().emptyTitle, text: tr().emptyText, actions: msk.can('create') ? [button(tr().newPoll, 'msk-btn', () => form())] : [] }))
      return
    }
    const shown = applyFilter(polls, filter, todayLocal())
    if (!shown.length) {
      body.append(emptyState({ art: 'polls', title: tr().emptyFilter, text: '' }))
      return
    }
    const feed = el('div', { class: 'po-feed' })
    for (const p of shown) feed.append(card(p))
    body.append(feed)
  }

  // ------------------------------------------------------------------------------------------------------ one poll
  const sendFrame = () => {
    if (chan) void chan.send({ t: 'voted' }).catch(() => undefined)
  }
  const leave = () => {
    chan?.close()
    chan = null
    current = null
    outcome = null
    chosen = []
    void load()
  }

  const results = (p: Poll, o: Outcome) => {
    const panel = el('section', { class: 'po-panel', 'aria-label': tr().results })
    panel.append(el('h2', {}, tr().results))
    if (!o.visible) {
      panel.append(el('p', { class: 'po-note', role: 'status' }, p.results === 'after_close' ? tr().hiddenAfterClose : tr().hiddenAfterVote))
      return panel
    }
    const lead = winners(o.options.map((x) => x.votes))
    o.options.forEach((x, i) => {
      const win = lead.includes(i)
      const line = el('div', { class: 'po-optline' }, el('strong', {}, x.label))
      if (win) line.append(el('span', { class: 'po-win' }, tr().winner))
      line.append(el('span', { class: 'po-num' }, sub(tr().percentOf, { p: x.percent, v: x.votes })))
      const opt = el('div', { class: `po-opt${win ? ' win' : ''}`, 'data-testid': 'result' }, line, progress({ value: x.percent, max: 100, label: `${x.label}: ${x.percent}%` }))
      if (x.voters.length) opt.append(el('div', { class: 'po-voters' }, ...x.voters.map((v) => el('span', { class: 'po-voter' }, avatar(v.name), v.name))))
      panel.append(opt)
    })
    panel.append(el('p', { class: 'po-note', role: 'status', 'data-testid': 'total' }, o.total_voters === 1 ? tr().onePersonVoted : sub(tr().peopleVoted, { n: o.total_voters })))
    if (o.visitors) panel.append(el('p', { class: 'po-note', 'data-testid': 'visitors' }, sub(tr().visitors, { n: o.visitors })))
    if (o.hide_voters) panel.append(el('p', { class: 'po-note' }, tr().anonymous))
    return panel
  }

  const voteBox = (p: Poll, o: Outcome) => {
    const closed = o.closed
    const group = el('fieldset', { class: 'po-choices' }, el('legend', {}, p.multiple ? tr().chooseMany : tr().chooseOne))
    const act = el('button', { type: 'button', class: 'msk-btn' }, o.mine.length ? tr().changeVote : tr().vote)
    const sync = () => {
      act.disabled = closed || chosen.length === 0
      act.title = act.disabled && !closed ? tr().pickOne : ''
    }
    p.options.forEach((label, i) => {
      const input = el('input', { type: p.multiple ? 'checkbox' : 'radio', name: 'po-choice', value: String(i) })
      input.checked = chosen.includes(i)
      input.disabled = closed
      input.addEventListener('change', () => {
        chosen = toggleChoice(chosen, i, p.multiple)
        sync()
      })
      group.append(el('label', { class: 'po-choice' }, input, el('span', {}, label)))
    })
    sync()
    act.addEventListener('click', () => {
      act.disabled = true
      void (async () => {
        try {
          await msk.call('polls.vote', { id: p.id, choices: chosen })
          toast(tr().voteSaved, { tone: 'ok' })
          sendFrame()
          await refreshDetail(true)
        } catch (e) {
          fail(e)
          sync()
        }
      })()
    })
    const panel = el('section', { class: 'po-panel' }, group)
    if (closed) panel.append(el('p', { class: 'po-note', role: 'status' }, tr().closedNote))
    else panel.append(el('div', { class: 'po-acts' }, act))
    return panel
  }

  const drawDetail = () => {
    const p = current
    const o = outcome
    if (!p) return
    head.replaceChildren(button(tr().back, 'msk-btn ghost', leave), el('h1', {}, p.question))
    body.replaceChildren()
    if (!o) {
      body.append(skeleton({ kind: 'cards', count: 2 }))
      return
    }
    const wrap = el('div', { class: 'po-poll' })
    const chips = el('div', { class: 'po-chips' }, el('span', { class: `po-state${o.closed ? ' closed' : ''}` }, o.closed ? tr().stateClosed : tr().stateOpen))
    if (whenText(p)) chips.append(el('span', { class: 'po-meta' }, whenText(p)))
    chips.append(el('span', { class: 'po-meta' }, sub(tr().by, { n: p.row.owner_name })))
    wrap.append(chips)
    if (p.details.trim()) wrap.append(el('p', { class: 'po-details' }, p.details))
    wrap.append(voteBox(p, o), results(p, o))
    const acts = el('div', { class: 'po-acts' })
    if (canEdit(p)) {
      if (p.row.my_level === 'manage') acts.append(button(p.closed ? tr().reopen : tr().closePoll, 'msk-btn ghost mini', () => void setClosed(p, !p.closed)))
      acts.append(button(tr().edit, 'msk-btn ghost mini', () => form(p)))
    }
    if (p.row.my_level === 'manage') {
      acts.append(button(tr().share, 'msk-btn ghost mini', () => void msk.share(p.id).catch(fail)), button(tr().publicLink, 'msk-btn ghost mini', () => void msk.share(p.id).catch(fail)), button(tr().remove, 'msk-btn ghost mini danger-text', () => void remove(p)))
    }
    if (acts.childElementCount) wrap.append(acts)
    if (p.row.my_level === 'manage') wrap.append(el('p', { class: 'po-note' }, tr().publicHint))
    wrap.append(el('p', { class: 'po-note' }, tr().live))
    body.append(wrap)
  }

  /** Asks the data again (the poll and the results); `mine` ticks the choices of the person again after their own vote. */
  const refreshDetail = async (own = false) => {
    const id = current?.id
    if (!id) return
    try {
      const [row, o] = await Promise.all([api.get(id), msk.call<Outcome>('polls.results', { id })])
      if (current?.id !== id) return
      current = toPoll(row)
      if (own || !outcome) chosen = [...o.mine]
      outcome = o
      drawDetail()
    } catch (e) {
      if (!outcome) body.textContent = tr().loadFailed + errText(e, msk.context?.lang)
      else fail(e)
    }
  }
  const liveRefresh = debounce(() => void refreshDetail(), 250)

  const show = async (id: string) => {
    const p = polls.find((x) => x.id === id)
    if (!p) return
    current = p
    outcome = null
    chosen = []
    drawDetail()
    chan?.close()
    chan = msk.realtime.open({ resource: id, name: 'results' })
    chan.onMessage(() => liveRefresh())
    chan.onStatus((s) => {
      if (s === 'gap') liveRefresh()
    })
    await refreshDetail(true)
  }

  const setClosed = async (p: Poll, closed: boolean) => {
    try {
      current = toPoll(await api.update(p.id, values(p, { closed })))
      toast(closed ? tr().closedToast : tr().reopenedToast, { tone: 'ok' })
      sendFrame()
      await refreshDetail()
    } catch (e) {
      fail(e)
    }
  }

  const remove = async (p: Poll) => {
    if (!(await confirmDialog({ title: tr().remove, text: sub(tr().removeConfirm, { n: p.question }), ok: tr().remove, cancel: tr().cancel, danger: true }))) return
    try {
      await api.remove(p.id)
      leave()
    } catch (e) {
      fail(e)
    }
  }

  // ------------------------------------------------------------------------------------------------------------- data
  const load = async () => {
    if (!current) {
      head.replaceChildren(el('h1', {}, tr().title))
      body.replaceChildren(skeleton({ kind: 'cards', count: 3 }))
    }
    try {
      polls = (await api.list({ sort: 'created_at', dir: 'desc', limit: 200 })).rows.map(toPoll)
    } catch (e) {
      body.textContent = tr().loadFailed + errText(e, msk.context?.lang)
      return
    }
    try {
      over = await msk.call<Overview>('polls.overview')
    } catch {
      over = { mine: [], counts: {} }
    }
    if (!current) drawList()
  }

  msk.onContext((ctx) => {
    if (langOf(ctx.lang) === lang) return
    lang = langOf(ctx.lang)
    if (current) drawDetail()
    else drawList()
  })
  void load()
}

connect()
  .then(mount)
  .catch((e) => {
    app.textContent = TEXTS[langOf(undefined)].failed + errText(e)
  })
