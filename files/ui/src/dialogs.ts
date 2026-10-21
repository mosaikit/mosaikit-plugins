// Dialoghi interni (niente prompt()): nome, scelta multipla, selettore di cartella.
import type { Listing, Msk } from '@mosaikit/plugin-api'
import { fileIcon, h, spinner, svg, type IconName } from './dom.ts'
import { atLeast, errMsg, validName } from './util.ts'

let current: { layer: HTMLElement; close: () => void } | null = null

export function dialogOpen(): boolean {
  return !!current
}

export function closeDialog() {
  current?.close()
}

function layer(box: HTMLElement, onClose: () => void): HTMLElement {
  closeDialog()
  const prev = document.activeElement as HTMLElement | null
  const el = h('div', { class: 'fm-layer', role: 'presentation' }, box)
  const close = () => {
    if (current?.layer !== el) return
    current = null
    el.remove()
    onClose()
    prev?.focus?.()
  }
  el.addEventListener('mousedown', (ev) => {
    if (ev.target === el) close()
  })
  el.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault()
      close()
    }
    ev.stopPropagation()
  })
  current = { layer: el, close }
  document.body.append(el)
  return el
}

function title(text: string, icon: IconName, danger = false) {
  return h('h3', { class: danger ? 'danger' : '', id: 'fm-dlg-title' }, svg(icon), text)
}

export interface PromptOpts {
  title: string
  icon: IconName
  label: string
  value: string
  ok: string
  /** seleziona il nome senza estensione */
  selectBase?: boolean
  validate?: (v: string) => string
  run: (v: string) => Promise<void>
}

/** Chiede un nome; resta aperto e mostra l'errore se `run` fallisce. */
export function promptDialog(o: PromptOpts) {
  const input = h('input', { type: 'text', class: 'tx', spellcheck: 'false', autocomplete: 'off', 'aria-label': o.label })
  input.value = o.value
  const ferr = h('div', { class: 'ferr', role: 'alert' })
  const ok = h('button', { type: 'submit', class: 'msk-btn' }, o.ok)
  const cancel = h('button', { type: 'button', class: 'msk-btn ghost' }, 'Annulla')
  const form = h(
    'form',
    { class: 'fm-dlg', novalidate: true, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'fm-dlg-title' },
    title(o.title, o.icon),
    h('div', { class: 'bd' }, h('label', null, o.label, input), ferr),
    h('div', { class: 'ft' }, cancel, ok),
  )
  layer(form, () => {})
  cancel.onclick = closeDialog
  input.oninput = () => (ferr.textContent = '')
  setTimeout(() => {
    input.focus()
    const dot = o.selectBase ? o.value.lastIndexOf('.') : -1
    input.setSelectionRange(0, dot > 0 ? dot : o.value.length)
  }, 20)
  form.onsubmit = (ev) => {
    ev.preventDefault()
    const v = input.value.trim()
    const bad = validName(v) || (o.validate ? o.validate(v) : '')
    if (bad) {
      ferr.textContent = bad
      input.focus()
      return
    }
    ok.disabled = true
    ok.textContent = '…'
    o.run(v).then(closeDialog, (e) => {
      ok.disabled = false
      ok.textContent = o.ok
      ferr.textContent = errMsg(e)
      input.focus()
    })
  }
}

export interface Choice {
  id: string
  label: string
  cls?: string
}

/** Dialogo a scelta multipla: risolve con l'id scelto, `null` se annullato. */
export function choiceDialog(o: { title: string; icon: IconName; body: (Node | string)[]; choices: Choice[] }): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false
    const finish = (v: string | null) => {
      if (done) return
      done = true
      resolve(v)
    }
    const buttons = o.choices.map((c) =>
      h('button', { type: 'button', class: 'msk-btn ' + (c.cls ?? 'ghost') }, c.label),
    )
    const cancel = h('button', { type: 'button', class: 'msk-btn ghost' }, 'Annulla')
    const box = h(
      'div',
      { class: 'fm-dlg', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'fm-dlg-title' },
      title(o.title, o.icon),
      h('div', { class: 'bd' }, ...o.body),
      h('div', { class: 'ft' }, cancel, h('div', { class: 'grow' }), ...buttons),
    )
    layer(box, () => finish(null))
    cancel.onclick = closeDialog
    buttons.forEach((b, i) => {
      b.onclick = () => {
        finish(o.choices[i].id)
        closeDialog()
      }
    })
    setTimeout(() => buttons[buttons.length - 1]?.focus(), 20)
  })
}

/** Elenco di nomi con icona, per i dialoghi. */
export function nameList(items: { name: string; is_dir: boolean }[], max = 50): HTMLElement {
  const ul = h('ul', { class: 'names' }, ...items.slice(0, max).map((e) => h('li', null, fileIcon(e), h('span', null, e.name))))
  if (items.length > max) ul.append(h('li', { class: 'more' }, `… e altri ${items.length - max}`))
  return ul
}

export interface PickOpts {
  title: string
  icon: IconName
  ok: string
  start: string | null
  /** cartelle che non si possono scegliere ne' attraversare (es. quelle da spostare) */
  blocked: Set<string>
  /** cartella di partenza degli elementi: non selezionabile se `sameOk` e' falso */
  source: string | null
  sameOk: boolean
  run: (dest: string | null, destName: string) => Promise<void>
  /** cartella creata dal selettore (per aggiornare la vista se serve) */
  onCreated?: (parent: string | null) => void
}

/** Selettore della cartella di destinazione (sposta / copia). */
export function pickFolder(msk: Msk, o: PickOpts) {
  let cur: string | null = o.start
  let listing: Listing | null = null
  let seq = 0
  const crumbs = h('nav', { class: 'pc', 'aria-label': 'Percorso della destinazione' })
  const list = h('div', { class: 'pl', role: 'list' })
  const ferr = h('div', { class: 'ferr', role: 'alert' })
  const ok = h('button', { type: 'button', class: 'msk-btn' }, o.ok)
  const cancel = h('button', { type: 'button', class: 'msk-btn ghost' }, 'Annulla')
  const mk = h('button', { type: 'button', class: 'msk-btn ghost' }, svg('folderPlus'), 'Nuova cartella')
  const box = h(
    'div',
    { class: 'fm-dlg wide', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'fm-dlg-title' },
    title(o.title, o.icon),
    h('div', { class: 'bd' }, 'Scegli la cartella di destinazione', h('div', { class: 'fm-pick' }, crumbs, list), ferr),
    h('div', { class: 'ft' }, mk, h('div', { class: 'grow' }), cancel, ok),
  )
  layer(box, () => {})
  cancel.onclick = closeDialog

  const curName = () => (listing && listing.path.length ? listing.path[listing.path.length - 1].name : 'I miei file')

  function crumb(id: string | null, name: string, isCur: boolean) {
    const b = h('button', { type: 'button', class: 'fm-crumb' + (isCur ? ' cur' : '') }, id ? null : svg('home'), name)
    b.onclick = () => load(id)
    return b
  }

  function load(id: string | null) {
    const my = ++seq
    cur = id
    ferr.textContent = ''
    ok.disabled = true
    mk.disabled = true
    list.replaceChildren(h('div', { class: 'pe' }, spinner()))
    msk.files.list(id).then(
      (l) => {
        if (my !== seq) return
        listing = l
        crumbs.replaceChildren(crumb(null, 'I miei file', !l.path.length))
        l.path.forEach((p, i) => crumbs.append(h('span', { class: 'fm-sep' }, '›'), crumb(p.id, p.name, i === l.path.length - 1)))
        const inside = l.path.some((p) => o.blocked.has(p.id))
        const same = id === o.source && !o.sameOk
        const canWrite = atLeast(l.my_level, 'write')
        ok.disabled = inside || same || !canWrite
        ok.title = inside
          ? 'Non puoi scegliere una cartella che stai spostando'
          : same
            ? 'Gli elementi sono già in questa cartella'
            : !canWrite
              ? 'Non hai il permesso di scrivere in questa cartella'
              : ''
        ok.textContent = `${o.ok} · ${curName()}`
        mk.disabled = inside || !canWrite
        const dirs = l.entries
          .filter((e) => e.is_dir)
          .sort((a, b) => a.name.localeCompare(b.name, 'it', { numeric: true, sensitivity: 'base' }))
        if (!dirs.length) {
          list.replaceChildren(h('div', { class: 'pe' }, 'Nessuna sottocartella'))
          return
        }
        list.replaceChildren(
          ...dirs.map((e) => {
            const bad = o.blocked.has(e.id)
            const b = h(
              'button',
              { type: 'button', class: 'pi', role: 'listitem', disabled: bad, title: bad ? 'Non puoi scegliere una cartella che stai spostando' : null },
              fileIcon(e),
              h('span', { class: 'pn' }, e.name),
              e.owner_id !== msk.user?.id ? h('span', { class: 'msk-badge' }, e.owner_name) : null,
              svg('right'),
            )
            b.onclick = () => load(e.id)
            return b
          }),
        )
      },
      (e) => {
        if (my !== seq) return
        list.replaceChildren(h('div', { class: 'pe err' }, errMsg(e)))
        if (id !== null) {
          crumbs.replaceChildren(crumb(null, 'I miei file', false))
        }
      },
    )
  }

  ok.onclick = () => {
    ok.disabled = true
    o.run(cur, curName()).then(closeDialog, (e) => {
      ok.disabled = false
      ferr.textContent = errMsg(e)
    })
  }

  mk.onclick = () => {
    const existing = list.querySelector<HTMLInputElement>('.pnew input')
    if (existing) return existing.focus()
    const inp = h('input', { type: 'text', class: 'tx', placeholder: 'Nome della nuova cartella', spellcheck: 'false', 'aria-label': 'Nome della nuova cartella' })
    const row = h('form', { class: 'pnew' }, inp, h('button', { type: 'submit', class: 'msk-btn mini' }, 'Crea'))
    list.prepend(row)
    inp.focus()
    row.onsubmit = (ev) => {
      ev.preventDefault()
      const name = inp.value.trim()
      const bad = validName(name)
      if (bad) {
        ferr.textContent = bad
        return
      }
      const parent = cur
      msk.files.mkdir(name, parent).then(
        (d) => {
          o.onCreated?.(parent)
          load(d.id)
        },
        (e) => (ferr.textContent = errMsg(e)),
      )
    }
  }

  load(cur)
}
