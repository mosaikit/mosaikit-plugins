// UI of the Approvals plugin: the requests (to decide, mine, all), the form of a request with its approvers, and the detail where an
// approver approves or rejects once. The state of a request is never computed here: it comes from the command `requests.overview`
// (and `requests.status`), which derive it from the decisions. A live channel `status` on the open request only says "ask again".
import '@mosaikit/plugin-api/style.css'
import './approvals.css'
import {
  avatar,
  confirmDialog,
  connect,
  dialog,
  el,
  emptyState,
  errText,
  personPicker,
  segmented,
  shortcuts,
  skeleton,
  toast,
  type Msk,
  type RealtimeChannel,
  type Row,
} from '@mosaikit/plugin-api'
import {
  addApprover,
  canChangeApprovers,
  canMove,
  removable,
  type ChangeEntry,
  approversJson,
  decisionKey,
  inTab,
  keepSelection,
  listOrder,
  progressOf,
  stepSelection,
  markOf,
  modeOf,
  moveApprover,
  removeApprover,
  stateOf,
  todoCount,
  waitingNames,
  type ApproverView,
  type ItemLike,
  type Mode,
  type Person,
  type State,
  type Tab,
} from './logic.ts'
import { bindTexts, TEXTS, langOf, sub } from './texts.ts'

const app = document.getElementById('app')!

interface Item extends ItemLike {
  row: Row
  title: string
  details: string
  amount: string
  mode: Mode
  approvers: ApproverView[]
}
interface OverviewRow {
  id: string
  state: string
  todo: boolean
  approvers: ApproverView[]
}

function mount(msk: Msk) {
  document.documentElement.classList.add('msk-fill')
  bindTexts(msk)
  let lang = langOf(msk.context?.lang)
  const tr = () => TEXTS[lang]
  const api = msk.crud('requests')
  const me = msk.user?.id ?? ''
  let items: Item[] = []
  let tab: Tab = 'todo'
  let selected: string | null = null
  let chan: RealtimeChannel | null = null
  let decideFromKey: ((v: 'approved' | 'rejected') => void) | null = null
  const wide = () => !window.matchMedia('(max-width: 820px)').matches

  const fail = (e: unknown) => toast(errText(e, msk.context?.lang), { tone: 'err', ms: 6000 })
  const head = el('header', { class: 'apr-head' })
  const body = el('div', { class: 'apr-body' })
  app.replaceChildren(el('div', { class: 'apr' }, head, body))

  const stamp = (iso: string) => new Date(iso).toLocaleString(msk.context?.lang || undefined, { dateStyle: 'medium', timeStyle: 'short' })

  const fallbackApprovers = (raw: unknown): ApproverView[] => {
    try {
      const list = JSON.parse(String(raw ?? '[]')) as Person[]
      return list.map((p) => ({ id: p.id, name: p.name, verdict: null, comment: '', decided_at: null, waiting: false }))
    } catch {
      return []
    }
  }

  const toItem = (r: Row, o: OverviewRow | undefined): Item => ({
    id: r.id,
    row: r,
    ownerId: r.owner_id,
    title: String(r.values.title ?? ''),
    details: String(r.values.details ?? ''),
    amount: String(r.values.amount ?? ''),
    mode: modeOf(r.values.mode),
    state: stateOf(o?.state),
    todo: o?.todo === true,
    approvers: o?.approvers ?? fallbackApprovers(r.values.approvers),
    createdAt: r.created_at,
  })

  const stateChip = (s: State) => el('span', { class: `msk-chip ${s === 'approved' ? 'ok' : s === 'rejected' ? 'err' : s === 'pending' ? 'acc' : ''}`.trim() }, tr()[s])

  const verdictText = (it: Item, a: ApproverView) =>
    a.verdict === 'approved' ? tr().approved : a.verdict === 'rejected' ? tr().rejected : it.state === 'pending' ? (a.waiting ? tr().vWaiting : tr().vLater) : tr().vNone

  const metaOf = (it: Item) =>
    [sub(tr().by, { n: it.row.owner_name }), stamp(it.createdAt), it.amount ? sub(tr().amountIs, { a: it.amount }) : '', it.state === 'pending' ? sub(tr().waitingFor, { n: waitingNames(it.approvers).join(', ') }) : '']
      .filter(Boolean)
      .join(' · ')

  // ----------------------------------------------------------------------------------------------- the form of a request
  const newRequest = () => {
    let approvers: Person[] = []
    const title = el('input', { type: 'text', maxlength: '160', 'aria-label': tr().fTitle, placeholder: tr().fTitle })
    const details = el('textarea', { rows: '5', maxlength: '4000', 'aria-label': tr().fDetails, placeholder: tr().fDetails })
    const amount = el('input', { type: 'text', maxlength: '80', 'aria-label': tr().fAmount, placeholder: tr().fAmount })
    const mode = el('select', { 'aria-label': tr().fMode })
    for (const [k, label] of [['all', tr().modeAll], ['any', tr().modeAny], ['sequence', tr().modeSeq]]) mode.append(el('option', { value: k }, label))
    mode.value = 'all'
    const list = el('ol', { class: 'apr-list', 'aria-label': tr().fApprovers })
    const note = el('p', { class: 'apr-dim' })
    const field = (label: string, input: HTMLElement) => el('div', { class: 'msk-field' }, el('label', {}, label), input)
    const picker = personPicker({
      label: tr().addApprover,
      placeholder: tr().addApprover,
      noneLabel: tr().noneFound,
      clearLabel: tr().removeApprover,
      value: null,
      search: (q) => msk.directory.search({ kind: 'user', q }),
      onChange: (u) => {
        if (!u) return
        approvers = addApprover(approvers, { id: u.id, name: u.name })
        drawList()
        // ready for the next person
        setTimeout(() => {
          picker.set(null)
          const input = picker.el.querySelector('input')
          if (input) {
            input.value = ''
            input.focus()
          }
          const results = picker.el.querySelector<HTMLElement>('.msk-person-list')
          if (results) {
            results.replaceChildren()
            results.hidden = true
          }
        }, 0)
      },
    })
    const mini = (label: string, fn: () => void, disabled = false) => {
      const b = el('button', { type: 'button', class: 'msk-btn ghost mini' }, label)
      b.disabled = disabled
      b.addEventListener('click', fn)
      return b
    }
    const drawList = () => {
      list.replaceChildren()
      const seq = mode.value === 'sequence'
      if (!approvers.length) list.append(el('li', { class: 'apr-dim' }, tr().noApprovers))
      approvers.forEach((p, i) => {
        const li = el('li', { class: `apr-item${seq ? ' seq' : ''}` }, avatar(p.name), el('strong', {}, p.name))
        if (seq) {
          li.append(
            mini('↑', () => ((approvers = moveApprover(approvers, p.id, -1)), drawList()), i === 0),
            mini('↓', () => ((approvers = moveApprover(approvers, p.id, 1)), drawList()), i === approvers.length - 1),
          )
          li.querySelectorAll('button')[0].setAttribute('aria-label', `${tr().moveUp}: ${p.name}`)
          li.querySelectorAll('button')[1].setAttribute('aria-label', `${tr().moveDown}: ${p.name}`)
        }
        const rm = mini('×', () => ((approvers = removeApprover(approvers, p.id)), drawList()))
        rm.setAttribute('aria-label', `${tr().removeApprover}: ${p.name}`)
        li.append(rm)
        list.append(li)
      })
      note.textContent = (seq ? tr().orderNote + ' ' : '') + tr().shareNote
    }
    mode.addEventListener('change', drawList)
    drawList()
    const ok = el('button', { type: 'button', class: 'msk-btn' }, tr().send)
    const no = el('button', { type: 'button', class: 'msk-btn ghost' }, tr().cancel)
    const d = dialog({
      title: tr().newTitle,
      body: el(
        'div',
        { class: 'apr-form' },
        field(tr().fTitle, title),
        field(tr().fDetails, details),
        field(tr().fAmount, amount),
        field(tr().fMode, mode),
        el('div', { class: 'apr-pick' }, el('strong', {}, tr().fApprovers), picker.el, list, note),
      ),
      actions: [no, ok],
    })
    no.addEventListener('click', d.close)
    const go = async () => {
      if (!title.value.trim()) {
        toast(tr().needTitle, { tone: 'err' })
        return title.focus()
      }
      if (!approvers.length) return void toast(tr().needApprover, { tone: 'err' })
      ok.disabled = true
      try {
        const made = await api.create({
          title: title.value.trim(),
          details: details.value,
          amount: amount.value.trim(),
          mode: mode.value,
          approvers: approversJson(approvers),
          cancelled: false,
        })
        d.close()
        tab = 'mine'
        await load()
        offerShare(made.id)
      } catch (e) {
        fail(e)
        ok.disabled = false
      }
    }
    ok.addEventListener('click', () => void go())
    title.focus()
  }

  /** The approvers need read access to decide: right after creating, offer the sharing dialog. */
  const offerShare = (id: string) => {
    const share = el('button', { type: 'button', class: 'msk-btn' }, tr().shareNow)
    const later = el('button', { type: 'button', class: 'msk-btn ghost' }, tr().later)
    const d = dialog({ title: tr().createdTitle, body: el('p', {}, tr().createdText), actions: [later, share] })
    later.addEventListener('click', d.close)
    share.addEventListener('click', () => {
      d.close()
      void msk.share(id).catch(fail)
    })
  }

  const editRequest = (it: Item) => {
    const title = el('input', { type: 'text', maxlength: '160', 'aria-label': tr().fTitle })
    const details = el('textarea', { rows: '5', maxlength: '4000', 'aria-label': tr().fDetails })
    const amount = el('input', { type: 'text', maxlength: '80', 'aria-label': tr().fAmount })
    title.value = it.title
    details.value = it.details
    amount.value = it.amount
    const field = (label: string, input: HTMLElement) => el('div', { class: 'msk-field' }, el('label', {}, label), input)
    const ok = el('button', { type: 'button', class: 'msk-btn' }, tr().save)
    const no = el('button', { type: 'button', class: 'msk-btn ghost' }, tr().cancel)
    const d = dialog({
      title: tr().editTitle,
      body: el('div', { class: 'apr-form' }, field(tr().fTitle, title), field(tr().fDetails, details), field(tr().fAmount, amount)),
      actions: [no, ok],
    })
    no.addEventListener('click', d.close)
    ok.addEventListener('click', async () => {
      if (!title.value.trim()) {
        toast(tr().needTitle, { tone: 'err' })
        return title.focus()
      }
      ok.disabled = true
      try {
        // the approvers and the mode stay as they are (the rules refuse a change)
        await api.update(it.id, { ...it.row.values, title: title.value.trim(), details: details.value, amount: amount.value.trim() })
        d.close()
        await load()
      } catch (e) {
        fail(e)
        ok.disabled = false
      }
    })
    title.focus()
  }

  // -------------------------------------------------------------------------------------------------------- the actions
  const cancelRequest = async (it: Item) => {
    if (!(await confirmDialog({ title: tr().cancelRequest, text: sub(tr().cancelConfirm, { n: it.title }), ok: tr().cancelRequest, cancel: tr().keepIt, danger: true }))) return
    try {
      await api.update(it.id, { ...it.row.values, cancelled: true })
      await load()
    } catch (e) {
      fail(e)
    }
  }

  const remove = async (it: Item, then?: () => void) => {
    if (!(await confirmDialog({ title: tr().remove, text: sub(tr().removeConfirm, { n: it.title }), ok: tr().remove, cancel: tr().cancel, danger: true }))) return
    try {
      await api.remove(it.id)
      then?.()
      await load()
    } catch (e) {
      fail(e)
    }
  }

  /** The buttons that depend on who I am for a request: the owner cancels, the people who write edit, the managers share and delete. */
  const ownerActions = (it: Item, then?: () => void) => {
    const out: HTMLElement[] = []
    const btn = (label: string, fn: () => void, cls = '') => {
      const b = el('button', { type: 'button', class: `msk-btn ghost mini ${cls}`.trim() }, label)
      b.addEventListener('click', fn)
      out.push(b)
    }
    if (it.ownerId === me && it.state === 'pending') btn(tr().cancelRequest, () => void cancelRequest(it))
    if (canChangeApprovers(it.state, it.row.my_level)) btn(tr().changeApprovers, () => changeApprovers(it))
    if (it.row.my_level === 'write' || it.row.my_level === 'manage') btn(tr().edit, () => editRequest(it))
    if (it.row.my_level === 'manage') {
      btn(tr().share, () => void msk.share(it.id).catch(fail))
      btn(tr().remove, () => void remove(it, then), 'danger-text')
    }
    return out
  }

  const decide = async (it: Item, verdict: 'approved' | 'rejected', comment: string, chan: RealtimeChannel | null) => {
    if (verdict === 'rejected' && !comment.trim()) {
      toast(tr().needReason, { tone: 'err' })
      return false
    }
    try {
      await msk.call('requests.decide', { id: it.id, verdict, comment: comment.trim() })
      toast(verdict === 'approved' ? tr().doneApproved : tr().doneRejected, { tone: 'ok' })
      // tell the others to ask again: a frame carries no data to trust
      void chan?.send({ t: 'decided' }).catch(() => undefined)
      await load()
      return true
    } catch (e) {
      fail(e)
      await load()
      return false
    }
  }

  // ------------------------------------------------------------------------------ change the approvers of an open request
  const changeApprovers = (it: Item) => {
    let list: ApproverView[] = it.approvers.map((a) => ({ ...a }))
    const ul = el('ol', { class: 'apr-list', 'aria-label': tr().fApprovers })
    const mini = (label: string, fn: () => void, disabled = false) => {
      const b = el('button', { type: 'button', class: 'msk-btn ghost mini' }, label)
      b.disabled = disabled
      b.addEventListener('click', fn)
      return b
    }
    const seq = it.mode === 'sequence'
    const drawList = () => {
      ul.replaceChildren()
      for (const p of list) {
        const li = el('li', { class: `apr-item${seq ? ' seq' : ''}` }, avatar(p.name), el('strong', {}, p.name))
        if (seq) {
          const up = mini('↑', () => ((list = moveItem(list, p.id, -1)), drawList()), !canMove(list, p.id, -1))
          const down = mini('↓', () => ((list = moveItem(list, p.id, 1)), drawList()), !canMove(list, p.id, 1))
          up.setAttribute('aria-label', `${tr().moveUp}: ${p.name}`)
          down.setAttribute('aria-label', `${tr().moveDown}: ${p.name}`)
          li.append(up, down)
        }
        const rm = mini('×', () => ((list = list.filter((x) => x.id !== p.id)), drawList()), !removable(list, p.id))
        rm.setAttribute('aria-label', `${tr().removeApprover}: ${p.name}`)
        li.append(rm)
        ul.append(li)
      }
    }
    const moveItem = (l: ApproverView[], id: string, by: -1 | 1) => {
      const moved = moveApprover(l, id, by) as ApproverView[]
      return moved
    }
    const picker = personPicker({
      label: tr().addApprover,
      placeholder: tr().addApprover,
      noneLabel: tr().noneFound,
      clearLabel: tr().removeApprover,
      value: null,
      search: (q) => msk.directory.search({ kind: 'user', q }),
      onChange: (u) => {
        if (!u) return
        const next = addApprover(list, { id: u.id, name: u.name }) as ApproverView[]
        if (next.length !== list.length) list = [...list, { id: u.id, name: u.name, verdict: null, comment: '', decided_at: null, waiting: false }]
        drawList()
        setTimeout(() => {
          picker.set(null)
          const input = picker.el.querySelector('input')
          if (input) input.value = ''
        }, 0)
      },
    })
    drawList()
    const ok = el('button', { type: 'button', class: 'msk-btn' }, tr().save)
    const no = el('button', { type: 'button', class: 'msk-btn ghost' }, tr().cancel)
    const d = dialog({
      title: tr().changeTitle,
      body: el('div', { class: 'apr-form' }, el('div', { class: 'apr-pick' }, el('strong', {}, tr().fApprovers), picker.el, ul, el('p', { class: 'apr-dim' }, tr().lockedNote + (seq ? ' ' + tr().orderNote : '')))),
      actions: [no, ok],
    })
    no.addEventListener('click', d.close)
    ok.addEventListener('click', async () => {
      if (!list.length) return void toast(tr().needApprover, { tone: 'err' })
      ok.disabled = true
      try {
        await msk.call('requests.set_approvers', { id: it.id, approvers: approversJson(list) })
        toast(tr().changedDone, { tone: 'ok' })
        d.close()
        await load()
      } catch (e) {
        fail(e)
        ok.disabled = false
      }
    })
  }

  const changeLog = async (id: string, into: HTMLElement) => {
    try {
      const rows = await msk.call<ChangeEntry[]>('requests.approver_log', { id })
      if (!rows.length) return
      const ul = el('ul', { class: 'apr-hist', 'data-testid': 'approver-log' })
      for (const r of rows) {
        const what = [r.added.length ? sub(tr().logAdded, { n: r.added.join(', ') }) : '', r.removed.length ? sub(tr().logRemoved, { n: r.removed.join(', ') }) : ''].filter(Boolean).join('; ')
        ul.append(el('li', {}, el('div', {}, el('p', {}, sub(tr().logLine, { who: r.by, what })), el('p', { class: 'apr-dim' }, stamp(r.at)))))
      }
      into.append(el('h4', {}, tr().logTitle), ul)
    } catch {
      // the log is a nicety: the detail works without it
    }
  }

  // --------------------------------------------------------------------------------------------------- the pane (detail)
  const select = (id: string | null) => {
    if (id === selected) return
    chan?.close()
    chan = null
    selected = id
    if (id) {
      try {
        chan = msk.realtime.open({ resource: id, name: 'status', state: {} })
        chan.onMessage(() => void load())
      } catch {
        chan = null
      }
    }
    draw()
    if (id && !wide()) body.querySelector<HTMLElement>('.apr-pane')?.focus()
  }

  const renderPane = (pane: HTMLElement) => {
    decideFromKey = null
    const it = items.find((x) => x.id === selected)
    if (!it) {
      pane.append(emptyState({ art: 'approvals', title: tr().pickOne, text: tr().pickOneText }))
      return
    }
    // on a wide screen the inbox always shows a request; the back button is for the narrow screen, where the pane replaces the list
    const close = el('button', { type: 'button', class: 'msk-btn ghost mini apr-close' }, tr().back)
    close.addEventListener('click', () => select(null))
    close.hidden = wide()
    const p = progressOf(it.approvers)
    pane.append(
      el('div', { class: 'apr-pane-top' }, close, el('h2', {}, it.title)),
      el(
        'div',
        { class: 'apr-chips' },
        stateChip(it.state),
        el('span', { class: 'msk-badge' }, it.mode === 'any' ? tr().modeAny : it.mode === 'sequence' ? tr().modeSeq : tr().modeAll),
        p.total ? el('span', { class: 'apr-prog' }, sub(tr().progress, { d: p.done, n: p.total })) : '',
      ),
      el('p', { class: 'apr-meta' }, metaOf(it)),
      el('h4', {}, tr().detailsTitle),
      it.details.trim() ? el('p', { class: 'apr-text' }, it.details) : el('p', { class: 'apr-dim' }, tr().noDetails),
    )
    const mine = it.approvers.find((a) => a.id === me)
    if (mine?.waiting && it.state === 'pending') {
      const label = el('label', { for: 'apr-comment' }, tr().comment)
      const comment = el('textarea', { id: 'apr-comment', rows: '3', maxlength: '1000' })
      const yes = el('button', { type: 'button', class: 'msk-btn' }, tr().approve)
      const no = el('button', { type: 'button', class: 'msk-btn ghost danger-text' }, tr().reject)
      const go = async (v: 'approved' | 'rejected') => {
        yes.disabled = no.disabled = true
        const done = await decide(it, v, comment.value, chan)
        if (!done) yes.disabled = no.disabled = false
        if (!done && v === 'rejected' && !comment.value.trim()) comment.focus()
      }
      yes.addEventListener('click', () => void go('approved'))
      no.addEventListener('click', () => void go('rejected'))
      // the keys: `a` approves; `r` rejects, and asks for the reason first when the comment is empty
      decideFromKey = (v) => {
        if (v === 'approved') yes.click()
        else if (comment.value.trim()) no.click()
        else {
          comment.focus()
          toast(tr().needReason, { tone: 'err' })
        }
      }
      pane.append(
        el(
          'div',
          { class: 'apr-decision' },
          el('strong', {}, tr().yourTurn),
          label,
          comment,
          el('p', { class: 'apr-dim' }, tr().commentHint + ' ' + tr().decisionFinal),
          el('div', { class: 'apr-acts' }, yes, no),
        ),
      )
    }
    pane.append(el('h4', {}, tr().history))
    const hist = el('ul', { class: 'apr-hist' })
    it.approvers.forEach((a, i) => {
      const m = markOf(a)
      hist.append(
        el(
          'li',
          {},
          el('span', { class: 'apr-avwrap' }, avatar(a.name), el('span', { class: `apr-mark ${m.kind}`, 'aria-hidden': 'true' }, m.mark)),
          el(
            'div',
            {},
            el('p', {}, el('strong', {}, `${it.mode === 'sequence' ? `${i + 1}. ` : ''}${a.name}`), ` · ${verdictText(it, a)}`),
            a.decided_at ? el('p', { class: 'apr-dim' }, stamp(a.decided_at)) : '',
            a.comment ? el('p', {}, a.comment) : '',
          ),
        ),
      )
    })
    pane.append(hist)
    const log = el('div', {})
    pane.append(log)
    void changeLog(it.id, log)
    const acts = ownerActions(it, () => select(null))
    if (acts.length) pane.append(el('div', { class: 'apr-acts' }, ...acts))
  }

  // -------------------------------------------------------------------------------------------------------------- list
  /** One request in the list: the state and whose turn it is, the title, who and when, and the approvers as avatars. */
  const row = (it: Item) => {
    const open = el('button', { type: 'button', class: 'apr-rowbtn', 'aria-current': it.id === selected ? 'true' : 'false' }, it.title)
    open.addEventListener('click', () => select(it.id))
    const strip = el('ul', { class: 'apr-strip', 'aria-label': tr().approversTitle })
    for (const a of it.approvers) {
      const m = markOf(a)
      strip.append(
        el(
          'li',
          { class: 'apr-ap', title: a.name },
          el('span', { class: 'apr-avwrap' }, avatar(a.name), el('span', { class: `apr-mark ${m.kind}`, 'aria-hidden': 'true' }, m.mark)),
          el('span', { class: 'apr-sr' }, `${a.name}: ${verdictText(it, a)}`),
        ),
      )
    }
    const top = el('div', { class: 'apr-rowtop' }, stateChip(it.state))
    if (it.todo) top.append(el('span', { class: 'apr-turn' }, tr().yourTurn))
    const r = el('article', { class: `apr-row s-${it.state}${it.id === selected ? ' sel' : ''}${it.todo ? ' todo' : ''}`, 'data-testid': 'request', 'data-id': it.id }, top, el('h3', {}, open), el('p', { class: 'apr-meta' }, metaOf(it)), strip)
    r.addEventListener('click', (ev) => {
      if (!(ev.target as HTMLElement).closest('button')) select(it.id)
    })
    return r
  }

  const draw = () => {
    head.replaceChildren(el('h1', {}, tr().title))
    const n = todoCount(items)
    if (n) head.append(el('span', { class: 'apr-badge', 'data-testid': 'todo-badge' }, sub(tr().badge, { n })))
    const seg = segmented({
      label: tr().filter,
      value: tab,
      options: [
        { key: 'todo', label: tr().toDecide },
        { key: 'mine', label: tr().mine },
        { key: 'all', label: tr().all },
      ],
      onChange: (k) => {
        tab = k as Tab
        draw()
      },
    })
    const add = el('button', { type: 'button', class: 'msk-btn' }, tr().newRequest)
    add.addEventListener('click', newRequest)
    add.hidden = !msk.can('create')
    head.append(el('span', { class: 'apr-spacer' }), seg.el, add)
    body.replaceChildren()
    decideFromKey = null
    const action = () => (msk.can('create') ? [Object.assign(el('button', { type: 'button', class: 'msk-btn' }, tr().newRequest), { onclick: newRequest })] : [])
    if (!items.length) {
      body.append(emptyState({ art: 'approvals', title: tr().emptyTitle, text: tr().emptyText, actions: action() }))
      return
    }
    const shown = listOrder(inTab(items, tab, me))
    if (!shown.length) {
      body.append(
        tab === 'todo'
          ? emptyState({ art: 'approvals', title: tr().emptyTodoTitle, text: tr().emptyTodoText })
          : emptyState({ art: 'approvals', title: tr().emptyMineTitle, text: tr().emptyMineText, actions: action() }),
      )
      return
    }
    // the open request stays open while it is in the list; on a wide screen there is always one
    const keep = keepSelection(
      shown.map((x) => x.id),
      selected,
      wide(),
    )
    if (keep !== selected) {
      chan?.close()
      chan = null
      selected = keep
      if (keep) {
        try {
          chan = msk.realtime.open({ resource: keep, name: 'status', state: {} })
          chan.onMessage(() => void load())
        } catch {
          chan = null
        }
      }
    }
    const feed = el('div', { class: 'apr-feed', role: 'list', 'aria-label': tr().list })
    for (const it of shown) feed.append(row(it))
    const pane = el('section', { class: 'apr-pane', 'data-testid': 'detail', tabindex: '-1', 'aria-label': tr().detailsTitle })
    renderPane(pane)
    body.append(el('div', { class: `apr-split${selected ? ' has-sel' : ''}` }, feed, pane))
  }

  const load = async () => {
    if (!items.length) body.replaceChildren(skeleton({ kind: 'cards', count: 3 }))
    try {
      const rows = (await api.list({ sort: 'created_at', dir: 'desc', limit: 200 })).rows
      let over: OverviewRow[] = []
      try {
        over = (await msk.call<{ requests: OverviewRow[] }>('requests.overview')).requests
      } catch (e) {
        fail(e)
      }
      const byId = new Map(over.map((o) => [o.id, o]))
      items = rows.map((r) => toItem(r, byId.get(r.id)))
    } catch (e) {
      body.textContent = tr().loadFailed + errText(e, msk.context?.lang)
      return
    }
    draw()
  }

  msk.onContext((ctx) => {
    if (langOf(ctx.lang) === lang) return
    lang = langOf(ctx.lang)
    draw()
  })
  // keyboard: j/k (or the arrows) walk the list, a approves and r rejects when it is your turn, n starts a request
  const visibleIds = () => listOrder(inTab(items, tab, me)).map((x) => x.id)
  const walk = (dir: -1 | 1) => {
    const next = stepSelection(visibleIds(), selected, dir)
    if (next) {
      select(next)
      body.querySelector<HTMLElement>('.apr-row.sel .apr-rowbtn')?.focus()
    }
  }
  shortcuts(
    [
      { keys: 'n', label: tr().shNew, group: tr().shGroup, run: () => msk.can('create') && newRequest() },
      { keys: 'j', label: tr().shNext, group: tr().shGroup, run: () => walk(1) },
      { keys: 'k', label: tr().shPrev, group: tr().shGroup, run: () => walk(-1) },
      { keys: 'a', label: tr().shApprove, group: tr().shGroup, run: () => decisionKey('a', !!decideFromKey) && decideFromKey?.('approved'), when: () => !!decideFromKey },
      { keys: 'r', label: tr().shReject, group: tr().shGroup, run: () => decisionKey('r', !!decideFromKey) && decideFromKey?.('rejected'), when: () => !!decideFromKey },
      { keys: 'escape', label: tr().closePane, group: tr().shGroup, run: () => select(null), when: () => !!selected && !wide() },
    ],
    { labels: { title: tr().shHelp, close: tr().shClose } },
  )

  void msk.loading(load())
}

connect()
  .then(mount)
  .catch((e) => {
    app.textContent = TEXTS[langOf(undefined)].failed + errText(e)
  })
