// The dialogs of the chats: the people picker («To:» with names that complete as you type), New chat, Add people, the people
// of a chat, and the picker of files of Documents. They call the host (`msk`) for the directory and for the files, and give
// back what was chosen; what to do with it is the page's business.
import { avatar, dialog, el, errText, type Msk } from '@mosaikit/plugin-api'
import { fileSize, type Attachment, type Chat, type Member, type Person } from './chats-logic.ts'
import { sub, type Texts } from './texts.ts'

export const DOCS = 'com.mosaikit.files'

export interface PeoplePicker {
  el: HTMLElement
  get(): Person[]
  focus(): void
}

/** The «To:» field: chosen people as chips, a box that searches the directory as the person types. Without the right to
 *  search it offers the people picker of the platform instead. */
export function peoplePicker(msk: Msk, tr: () => Texts, opts: { exclude: string[]; onChange: (p: Person[]) => void }): PeoplePicker {
  let chosen: Person[] = []
  let token = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let denied = false
  const chips = el('div', { class: 'np-chips' })
  const input = el('input', { type: 'search', class: 'np-input', autocomplete: 'off', 'aria-label': tr().to, placeholder: tr().toPlaceholder })
  const list = el('ul', { class: 'np-list', role: 'listbox', 'aria-label': tr().to })
  list.hidden = true
  const fallback = el('button', { type: 'button', class: 'msk-btn ghost mini' }, tr().pickPeople)
  fallback.hidden = true
  const root = el('div', { class: 'np' }, el('div', { class: 'np-field' }, chips, input), list, fallback)

  const draw = () => {
    chips.replaceChildren()
    for (const p of chosen) {
      const x = el('button', { type: 'button', class: 'np-x', 'aria-label': sub(tr().removePerson, { n: p.name }) }, '×')
      x.addEventListener('click', () => {
        chosen = chosen.filter((c) => c.id !== p.id)
        draw()
        opts.onChange(chosen)
        input.focus()
      })
      chips.append(el('span', { class: 'np-chip' }, avatar(p.name), el('span', {}, p.name), x))
    }
  }
  const add = (p: Person) => {
    if (!chosen.some((c) => c.id === p.id) && !opts.exclude.includes(p.id)) chosen.push(p)
    input.value = ''
    list.hidden = true
    draw()
    opts.onChange(chosen)
    input.focus()
  }
  input.addEventListener('input', () => {
    clearTimeout(timer)
    const q = input.value.trim()
    if (!q) {
      list.hidden = true
      return
    }
    timer = setTimeout(async () => {
      const mine = ++token
      let found: Person[] = []
      try {
        found = (await msk.directory.search({ kind: 'user', q: q.slice(0, 64), limit: 8 })) as Person[]
      } catch (e) {
        const code = (e as { code?: string })?.code
        if (code === 'permission_denied') {
          denied = true
          fallback.hidden = false
          input.disabled = true
          input.placeholder = ''
        }
      }
      if (mine !== token || denied) return
      list.replaceChildren()
      for (const u of found.filter((u) => !opts.exclude.includes(u.id) && !chosen.some((c) => c.id === u.id))) {
        const b = el('button', { type: 'button', role: 'option', class: 'np-opt' }, avatar(u.name), el('span', {}, u.name))
        b.addEventListener('click', () => add({ id: u.id, name: u.name }))
        list.append(el('li', {}, b))
      }
      if (!list.childElementCount) list.append(el('li', { class: 'np-none' }, tr().noPeople))
      list.hidden = false
    }, 180)
  })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') list.hidden = true
    if (e.key === 'Backspace' && !input.value && chosen.length) {
      chosen.pop()
      draw()
      opts.onChange(chosen)
    }
  })
  fallback.addEventListener('click', async () => {
    try {
      const picked = await msk.pickPrincipals({ kind: 'user', title: tr().to, exclude: opts.exclude.map((id) => ({ type: 'user' as const, id })) })
      for (const p of picked) if (p.type === 'user') add({ id: p.id!, name: p.name ?? '?' })
    } catch {
      // cancelled or refused: nothing is chosen
    }
  })
  return { el: root, get: () => chosen, focus: () => input.focus() }
}

/** New chat: one person opens (or makes) the chat with them, more people make a group (with an optional name). */
export function newChatDialog(msk: Msk, tr: () => Texts, me: string, go: (people: Person[], name: string) => Promise<void>) {
  let chosen: Person[] = []
  const name = el('input', { type: 'text', maxlength: '80', 'aria-label': tr().groupName, placeholder: tr().groupName })
  const nameField = el('div', { class: 'msk-field' }, name)
  nameField.hidden = true
  const ok = el('button', { type: 'button', class: 'msk-btn' }, tr().startChat)
  ok.disabled = true
  const no = el('button', { type: 'button', class: 'msk-btn ghost' }, tr().cancel)
  const hint = el('p', { class: 'np-hint' }, tr().groupHint)
  const picker = peoplePicker(msk, tr, {
    exclude: [me],
    onChange: (p) => {
      chosen = p
      ok.disabled = !p.length
      nameField.hidden = p.length < 2
    },
  })
  const d = dialog({ title: tr().newChatTitle, body: el('div', { class: 'np-form' }, picker.el, nameField, hint), actions: [no, ok] })
  no.addEventListener('click', d.close)
  ok.addEventListener('click', async () => {
    if (!chosen.length) return
    ok.disabled = true
    try {
      await go(chosen, name.value)
      d.close()
    } catch (e) {
      ok.disabled = false
      hint.textContent = errText(e, msk.context?.lang)
      hint.classList.add('err')
    }
  })
  picker.focus()
  return d
}

export type HistoryChoice = 'all' | 'week' | 'none'

/** Add people to a chat, with how much of the history they see. In a one-to-one chat the history question does not exist
 *  (it becomes a new group). */
export function addPeopleDialog(msk: Msk, tr: () => Texts, chat: Chat, me: string, go: (people: Person[], history: HistoryChoice) => Promise<void>) {
  let chosen: Person[] = []
  let history: HistoryChoice = 'all'
  const ok = el('button', { type: 'button', class: 'msk-btn' }, tr().add)
  ok.disabled = true
  const no = el('button', { type: 'button', class: 'msk-btn ghost' }, tr().cancel)
  const picker = peoplePicker(msk, tr, {
    exclude: [me, ...chat.members.map((m) => m.id)],
    onChange: (p) => {
      chosen = p
      ok.disabled = !p.length
    },
  })
  const choices = el('fieldset', { class: 'np-history' })
  if (chat.kind === 'group') {
    const opts: [HistoryChoice, string][] = [
      ['all', tr().historyAll],
      ['week', tr().historyWeek],
      ['none', tr().historyNone],
    ]
    for (const [v, label] of opts) {
      const r = el('input', { type: 'radio', name: 'history', value: v })
      if (v === history) r.checked = true
      r.addEventListener('change', () => (history = v))
      choices.append(el('label', { class: 'np-radio' }, r, el('span', {}, label)))
    }
  }
  const msg = el('p', { class: 'np-hint err' })
  const d = dialog({ title: tr().addPeopleTitle, body: el('div', { class: 'np-form' }, picker.el, choices, msg), actions: [no, ok] })
  no.addEventListener('click', d.close)
  ok.addEventListener('click', async () => {
    ok.disabled = true
    try {
      await go(chosen, history)
      d.close()
    } catch (e) {
      ok.disabled = false
      msg.textContent = errText(e, msk.context?.lang)
    }
  })
  picker.focus()
  return d
}

/** The people of a chat: who is online, who can be removed, the name of the group and leaving. */
export function peopleDialog(
  tr: () => Texts,
  chat: Chat,
  members: Member[],
  me: string,
  online: (id: string) => 'available' | 'away' | null,
  act: { remove: (m: Member) => Promise<void>; rename: (name: string) => Promise<void>; add: () => void },
) {
  const group = chat.kind === 'group'
  const list = el('ul', { class: 'pp-list' })
  const draw = (ms: Member[]) => {
    list.replaceChildren()
    for (const m of ms.filter((x) => !x.left)) {
      const state = online(m.id)
      const dot = el('span', { class: 'cl-dot ' + (state ?? 'off'), role: 'img', 'aria-label': state === 'available' ? tr().presenceAvailable : state === 'away' ? tr().presenceAway : '' })
      dot.hidden = !state
      const row = el('li', { class: 'pp-row' }, el('span', { class: 'pp-av' }, avatar(m.name), dot), el('span', { class: 'pp-name' }, m.id === me ? sub(tr().you2, { n: m.name }) : m.name))
      if (group && m.id !== me) {
        const x = el('button', { type: 'button', class: 'msk-btn ghost mini danger-text' }, tr().removeFromChat)
        x.addEventListener('click', async () => {
          x.disabled = true
          try {
            await act.remove(m)
            ms = ms.filter((y) => y.id !== m.id)
            draw(ms)
          } catch {
            x.disabled = false
          }
        })
        row.append(x)
      }
      list.append(row)
    }
  }
  draw(members)
  const body = el('div', { class: 'pp' })
  if (group) {
    const name = el('input', { type: 'text', maxlength: '80', 'aria-label': tr().chatNameLabel, placeholder: tr().chatNameLabel })
    name.value = chat.name
    const save = el('button', { type: 'button', class: 'msk-btn ghost mini' }, tr().save)
    save.addEventListener('click', () => void act.rename(name.value).then(() => (save.disabled = false)))
    body.append(el('div', { class: 'pp-name-row' }, name, save))
  }
  body.append(list)
  const close = el('button', { type: 'button', class: 'msk-btn ghost' }, tr().close)
  const actions: HTMLElement[] = [close]
  if (group) {
    const add = el('button', { type: 'button', class: 'msk-btn' }, tr().addPeople)
    add.addEventListener('click', () => {
      d.close()
      act.add()
    })
    actions.push(add)
  }
  const d = dialog({ title: tr().peopleHere, body, actions })
  close.addEventListener('click', d.close)
  return d
}

interface DocEntry {
  id: string
  name: string
  is_dir: boolean
  size: number
  mime?: string
}

/** The picker of files of Documents: folders to walk through, files to tick. Resolves to the ones chosen (none on cancel). */
export function docsPicker(msk: Msk, tr: () => Texts): Promise<Attachment[]> {
  return new Promise((resolve) => {
    const chosen = new Map<string, Attachment>()
    const trail: { id: string | null; name: string }[] = [{ id: null, name: 'Documents' }]
    const list = el('ul', { class: 'dp-list' })
    const crumbs = el('div', { class: 'dp-crumbs' })
    const ok = el('button', { type: 'button', class: 'msk-btn' }, tr().attachSelected)
    ok.disabled = true
    const no = el('button', { type: 'button', class: 'msk-btn ghost' }, tr().cancel)
    let done = false
    const finish = (v: Attachment[]) => {
      if (done) return
      done = true
      resolve(v)
    }
    const d = dialog({ title: tr().docsTitle, body: el('div', { class: 'dp' }, crumbs, list), actions: [no, ok], onClose: () => finish([]) })
    no.addEventListener('click', d.close)
    ok.addEventListener('click', () => {
      finish([...chosen.values()])
      d.close()
    })
    const load = async () => {
      const here = trail[trail.length - 1]!
      crumbs.replaceChildren()
      if (trail.length > 1) {
        const up = el('button', { type: 'button', class: 'msk-btn ghost mini' }, '‹ ' + tr().docsUp)
        up.addEventListener('click', () => {
          trail.pop()
          void load()
        })
        crumbs.append(up)
      }
      crumbs.append(el('strong', {}, here.name))
      list.replaceChildren(el('li', { class: 'np-none' }, tr().loading))
      let entries: DocEntry[] = []
      try {
        const r = await msk.files.list(here.id, DOCS)
        entries = ((r as { entries?: DocEntry[]; items?: DocEntry[] }).entries ?? (r as { items?: DocEntry[] }).items ?? []) as DocEntry[]
      } catch (e) {
        list.replaceChildren(el('li', { class: 'np-none' }, errText(e, msk.context?.lang)))
        return
      }
      list.replaceChildren()
      if (!entries.length) list.append(el('li', { class: 'np-none' }, tr().docsEmpty))
      for (const f of entries.sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name))) {
        if (f.is_dir) {
          const b = el('button', { type: 'button', class: 'dp-row' }, '📁 ', el('span', { class: 'dp-name' }, f.name))
          b.addEventListener('click', () => {
            trail.push({ id: f.id, name: f.name })
            void load()
          })
          list.append(el('li', {}, b))
        } else {
          const box = el('input', { type: 'checkbox', 'aria-label': f.name })
          box.checked = chosen.has(f.id)
          box.addEventListener('change', () => {
            if (box.checked) chosen.set(f.id, { id: f.id, name: f.name, size: f.size ?? 0, mime: f.mime ?? '' })
            else chosen.delete(f.id)
            ok.disabled = !chosen.size
          })
          list.append(el('li', { class: 'dp-row' }, box, el('span', { class: 'dp-name' }, f.name), el('span', { class: 'dp-size' }, fileSize(f.size ?? 0))))
        }
      }
    }
    void load()
  })
}
