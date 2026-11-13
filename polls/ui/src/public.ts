// Public page of a poll: the question, the options, one vote for each browser and, when the poll shows them to a
// visitor, the results as bars. No session: everything goes through the public commands `public_poll` and
// `public_vote`. A visitor never sees names. The browser keeps a random id in localStorage ("one vote per browser":
// a hint, not a proof).
import '@mosaikit/plugin-api/style.css'
import './polls.css'
import { connect, el, errText, progress, type Msk } from '@mosaikit/plugin-api'
import { isUuid, newBrowserId, publicProblem, toggleChoice, winners } from './logic.ts'
import { TEXTS, langOf, sub } from './texts.ts'

const app = document.getElementById('app')!

interface PublicPoll {
  question: string
  details: string
  options: { label: string; votes: number; percent: number }[]
  multiple: boolean
  closed: boolean
  results: 'always' | 'after_vote' | 'after_close'
  visible: boolean
  total_voters: number
  mine: number[]
  voted: boolean
}

const KEY = 'mosaikit.polls.browser'

/** The id of this browser: kept in localStorage, made up the first time (in memory only when storage is blocked). */
function browserId(): string {
  try {
    const old = localStorage.getItem(KEY)
    if (isUuid(old)) return old
    const id = newBrowserId()
    localStorage.setItem(KEY, id)
    return id
  } catch {
    return newBrowserId()
  }
}

function mount(msk: Msk) {
  const tr = TEXTS[langOf(undefined)]
  const browser = browserId()
  let poll: PublicPoll | null = null
  let chosen: number[] = []
  // what the page says about the last vote: a message and whether it is an error
  let note: { text: string; err: boolean } | null = null

  app.classList.add('po', 'po-public')
  const say = (text: string, err = false) => (note = { text, err })

  const problemText = (e: unknown): string => {
    switch (publicProblem(e)) {
      case 'already':
        return tr.pAlready
      case 'closed':
        return tr.pClosedVote
      case 'rate':
        return tr.pRate
      case 'off':
        return tr.pOff
      case 'cap':
        return tr.pCap
      default:
        return sub(tr.pSendFailed, { error: errText(e) })
    }
  }

  const results = (p: PublicPoll) => {
    const panel = el('section', { class: 'po-panel', 'aria-label': tr.results }, el('h2', {}, tr.results))
    if (!p.visible) {
      panel.append(el('p', { class: 'po-note', role: 'status' }, p.results === 'after_close' ? tr.hiddenAfterClose : tr.hiddenAfterVote))
      return panel
    }
    const lead = winners(p.options.map((x) => x.votes))
    p.options.forEach((x, i) => {
      const win = lead.includes(i)
      const line = el('div', { class: 'po-optline' }, el('strong', {}, x.label))
      if (win) line.append(el('span', { class: 'po-win' }, tr.winner))
      line.append(el('span', { class: 'po-num' }, sub(tr.percentOf, { p: x.percent, v: x.votes })))
      panel.append(el('div', { class: `po-opt${win ? ' win' : ''}`, 'data-testid': 'result' }, line, progress({ value: x.percent, max: 100, label: `${x.label}: ${x.percent}%` })))
    })
    panel.append(el('p', { class: 'po-note', role: 'status', 'data-testid': 'total' }, p.total_voters === 1 ? tr.onePersonVoted : sub(tr.peopleVoted, { n: p.total_voters })))
    return panel
  }

  const voteBox = (p: PublicPoll) => {
    const locked = p.closed || p.voted
    const group = el('fieldset', { class: 'po-choices' }, el('legend', {}, p.multiple ? tr.chooseMany : tr.chooseOne))
    const act = el('button', { type: 'button', class: 'msk-btn' }, tr.vote)
    const sync = () => {
      act.disabled = locked || chosen.length === 0
      act.title = act.disabled && !locked ? tr.pickOne : ''
    }
    p.options.forEach((o, i) => {
      const input = el('input', { type: p.multiple ? 'checkbox' : 'radio', name: 'po-choice', value: String(i) })
      input.checked = chosen.includes(i) || (p.voted && p.mine.includes(i))
      input.disabled = locked
      input.addEventListener('change', () => {
        chosen = toggleChoice(chosen, i, p.multiple)
        sync()
      })
      group.append(el('label', { class: 'po-choice' }, input, el('span', {}, o.label)))
    })
    // the hidden field a person never fills: a bot that fills every field is refused by the poll
    const honey = el('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-label': tr.pHoney })
    const trap = el('div', { class: 'po-trap', 'aria-hidden': 'true' }, honey)
    sync()
    act.addEventListener('click', () => {
      act.disabled = true
      void (async () => {
        try {
          poll = await msk.publicCall<PublicPoll>('public_vote', { browser, choices: chosen, website: honey.value })
          say(tr.voteSaved, false)
        } catch (e) {
          say(problemText(e), true)
          // a second vote or a closed poll: ask the poll again to show what it is now
          if (publicProblem(e) === 'already' || publicProblem(e) === 'closed') await refresh()
        }
        draw()
      })()
    })
    const panel = el('section', { class: 'po-panel' }, group, trap)
    if (p.closed) panel.append(el('p', { class: 'po-note', role: 'status' }, tr.closedNote))
    else if (p.voted && !note) panel.append(el('p', { class: 'po-note', role: 'status' }, tr.pAlready))
    else if (!p.voted) panel.append(el('div', { class: 'po-acts' }, act), el('p', { class: 'po-note' }, tr.pOnce))
    if (note) panel.append(el('p', { class: `po-note${note.err ? ' warn' : ''}`, role: note.err ? 'alert' : 'status', 'data-testid': 'public-note' }, note.text))
    return panel
  }

  const draw = () => {
    const p = poll
    if (!p) return
    document.title = p.question
    const chips = el('div', { class: 'po-chips' }, el('span', { class: `po-state${p.closed ? ' closed' : ''}` }, p.closed ? tr.stateClosed : tr.stateOpen))
    const wrap = el('main', { class: 'po-poll' }, el('h1', { class: 'po-ptitle' }, p.question), chips)
    if (p.details.trim()) wrap.append(el('p', { class: 'po-details' }, p.details))
    wrap.append(voteBox(p), results(p))
    app.replaceChildren(wrap)
  }

  const refresh = async () => {
    try {
      poll = await msk.publicCall<PublicPoll>('public_poll', { browser })
    } catch (e) {
      const off = publicProblem(e) === 'off'
      app.replaceChildren(el('p', { class: 'po-note warn', role: 'alert' }, off ? tr.pOff : publicProblem(e) === 'rate' ? tr.pRate : sub(tr.pOpenFailed, { error: errText(e) })))
    }
  }

  void msk.loading(refresh()).then(draw)
}

connect()
  .then(mount)
  .catch((e) => {
    app.textContent = sub(TEXTS[langOf(undefined)].pOpenFailed, { error: errText(e) })
  })
