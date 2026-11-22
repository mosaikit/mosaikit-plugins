// UI of the Contacts plugin: cards and an A–Z list with a filter by tag, a reading panel with quick actions, tags and notes in
// the editor, vCard and CSV in and out, a finder of duplicates, birthdays. English by default; Italian and Spanish follow the host.
import '@mosaikit/plugin-api/style.css'
import './contacts.css'
import {
  avatar,
  chip,
  confirmDialog,
  connect,
  dialog,
  downloadCsv,
  downloadFile,
  el,
  errText,
  menu,
  mountCrud,
  personPicker,
  renderMarkdown,
  richText,
  tagInput,
  toast,
  virtualList,
  type DirectoryUser,
  type CrudHandle,
  type CrudView,
  type CustomViewApi,
  type EditorCtx,
  type ItemCtx,
  type Msk,
  type Row,
} from '@mosaikit/plugin-api'
import { columnsFor, daysToBirthday, duplicates, groupByLetter, splitTags, virtualEntries, type Entry } from './logic.ts'
import { bindTexts, TEXTS, langOf, sub, type L } from './texts.ts'
import { CSV_COLUMNS, parseCsv, parseVcf, toVcf, type Person } from './vcard.ts'

const app = document.getElementById('app')!
const MAX_IMPORT = 500

const str = (r: Row, k: string) => (typeof r.values[k] === 'string' ? (r.values[k] as string) : '')
const nameOf = (r: Row) => str(r, 'name')
const person = (r: Row): Person => ({
  name: nameOf(r), org: str(r, 'org'), job_title: str(r, 'job_title'), email: str(r, 'email'), email2: str(r, 'email2'), phone: str(r, 'phone'), phone2: str(r, 'phone2'),
  address: str(r, 'address'), birthday: str(r, 'birthday'), notes: str(r, 'notes'), tags: str(r, 'tags'),
})
const entry = (r: Row): Entry => ({ id: r.id, name: nameOf(r), email: str(r, 'email'), email2: str(r, 'email2'), phone: str(r, 'phone'), phone2: str(r, 'phone2'), org: str(r, 'org') })

/** A link on a value: an address or a number. */
function link(kind: 'mail' | 'tel', value: string): HTMLElement {
  return el('a', { href: (kind === 'mail' ? 'mailto:' : 'tel:') + value.replace(/\s+/g, '') }, value)
}

function mount(msk: Msk) {
  bindTexts(msk)
  let lang = langOf(msk.context?.lang)
  const tr = () => TEXTS[lang]
  let handle: CrudHandle | null = null
  let all: Row[] = []
  let activeTag: string | null = null
  const tagsBar = el('div', { class: 'ctags', role: 'group', 'aria-label': tr().tagsLabel })

  const inTag = (r: Row) => !activeTag || splitTags(r.values.tags).some((t) => t.toLocaleLowerCase() === activeTag!.toLocaleLowerCase())
  const birthdayText = (r: Row) => {
    const n = daysToBirthday(str(r, 'birthday'), new Date())
    if (n === null || n > 14) return ''
    return '🎂 ' + (n === 0 ? tr().today : n === 1 ? tr().tomorrow : sub(tr().inDays, { n }))
  }
  const sublineOf = (r: Row) => [str(r, 'job_title'), str(r, 'org')].filter(Boolean).join(' · ')

  // --------------------------------------------------------------------------------------------- items
  const card = (c: ItemCtx) => {
    const r = c.row
    const name = nameOf(r) || tr().noName
    const kind = c.text('company')
    const who = el('div', { class: 'cwho' }, el('strong', {}, name))
    if (sublineOf(r)) who.append(el('span', { class: 'csub' }, sublineOf(r)))
    const tags = el('div', { class: 'ctagrow' })
    if (kind) tags.append(chip(kind))
    for (const t of splitTags(r.values.tags).slice(0, 3)) tags.append(el('span', { class: 'ctag' }, t))
    const bd = birthdayText(r)
    if (bd) tags.append(el('span', { class: 'cbday' }, bd))
    const lines = el('div', { class: 'clines' })
    if (str(r, 'email')) lines.append(el('div', { class: 'cline mail' }, link('mail', str(r, 'email'))))
    if (str(r, 'phone')) lines.append(el('div', { class: 'cline tel' }, link('tel', str(r, 'phone'))))
    return el('div', { class: 'contact' }, el('div', { class: 'chead' }, avatar(name, true), who), tags, lines)
  }
  const row = (c: ItemCtx) => {
    const r = c.row
    const name = nameOf(r) || tr().noName
    return el(
      'div',
      { class: 'crow' },
      avatar(name),
      el('strong', { class: 'crow-name' }, name),
      el('span', { class: 'crow-org' }, str(r, 'org')),
      el('span', { class: 'crow-mail' }, str(r, 'email')),
      el('span', { class: 'crow-tel' }, str(r, 'phone')),
    )
  }
  const boxOf = (api: CustomViewApi, r: Row, kind: 'cards' | 'list') => {
    const c = api.ctx(r)
    const box = el('div', { class: 'msk-item' + (c.selected ? ' sel' : ''), role: 'listitem', tabindex: '0', 'data-id': r.id }, (kind === 'cards' ? card : row)(c))
    box.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('a,button')) api.open(r.id)
    })
    box.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target === box) {
        e.preventDefault()
        api.open(r.id)
      }
    })
    return box
  }
  const heading = (letter: string, n: number) => el('h2', {}, letter, el('span', { class: 'msk-colcount' }, String(n)))
  /** From this many contacts the view draws only what is in sight. */
  const VIRTUAL_FROM = 80
  /** The long list: letters and rows (cards: rows of cards, as many as fit) in a box that scrolls. */
  const virtual = (api: CustomViewApi, kind: 'cards' | 'list', rows: { r: Row; name: string }[]) => {
    const groups = groupByLetter(rows)
    let cols = 1
    let entries = virtualEntries(groups, 1)
    const vl = virtualList({
      count: entries.length,
      estimateSize: (i) => ('head' in entries[i]! ? 34 : kind === 'cards' ? 150 : 56),
      getKey: (i) => {
        const e = entries[i]!
        return 'head' in e ? 'h-' + e.head : e.items[0]!.r.id
      },
      gap: kind === 'cards' ? 12 : 6,
      label: tr().title,
      render: (i) => {
        const e = entries[i]!
        if ('head' in e) return el('div', { class: 'cvhead cgroup' }, heading(e.head, e.n))
        const holder = el('div', { class: 'cvrow ' + kind, style: `--cols:${cols}` })
        for (const { r } of e.items) holder.append(boxOf(api, r, kind))
        return holder
      },
    })
    vl.el.classList.add('cvlist')
    if (kind === 'cards') {
      const fit = () => {
        const n = columnsFor(vl.el.clientWidth, 260, 12)
        if (n === cols) return
        cols = n
        entries = virtualEntries(groups, cols)
        vl.setCount(entries.length)
      }
      new ResizeObserver(fit).observe(vl.el)
    }
    return vl.el
  }
  const grouped = (api: CustomViewApi, kind: 'cards' | 'list') => {
    const rows = api.rows.filter(inTag).map((r) => ({ r, name: nameOf(r) || tr().noName }))
    if (rows.length >= VIRTUAL_FROM) return virtual(api, kind, rows)
    const root = el('div', { class: 'cgroups' })
    for (const [letter, group] of groupByLetter(rows)) {
      const holder = el('div', { class: kind === 'cards' ? 'msk-items cards' : 'msk-items list', role: 'list' })
      for (const { r } of group) holder.append(boxOf(api, r, kind))
      root.append(el('section', { class: 'cgroup', 'aria-label': letter }, heading(letter, group.length), holder))
    }
    return root
  }
  const views = (): CrudView[] => [
    { key: 'cards', label: tr().cards, kind: 'custom', item: card, render: (api) => grouped(api, 'cards') },
    { key: 'list', label: tr().list, kind: 'custom', item: row, render: (api) => grouped(api, 'list') },
  ]

  // --------------------------------------------------------------------------------------------- detail
  const reader = (c: ItemCtx) => {
    const r = c.row
    const name = nameOf(r) || tr().noName
    const kind = c.text('company')
    const head = el('div', { class: 'cread-head' }, avatar(name, true), el('div', {}, el('h2', {}, name), ...(sublineOf(r) ? [el('p', { class: 'csub' }, sublineOf(r))] : [])))
    const chips = el('div', { class: 'ctagrow' })
    if (kind) chips.append(chip(kind))
    for (const t of splitTags(r.values.tags)) chips.append(el('span', { class: 'ctag' }, t))
    const acts = el('div', { class: 'cacts' })
    const mail = str(r, 'email')
    const tel = str(r, 'phone')
    if (mail) acts.append(el('a', { class: 'msk-btn ghost', href: 'mailto:' + mail }, '✉ ' + tr().sendMail))
    if (tel) acts.append(el('a', { class: 'msk-btn ghost', href: 'tel:' + tel.replace(/\s+/g, '') }, '☎ ' + tr().call))
    const dl = el('dl', {})
    const add = (k: string, v: Node | string | null) => v && dl.append(el('dt', {}, k), el('dd', {}, v))
    add(tr().email, mail ? link('mail', mail) : null)
    add(tr().email, str(r, 'email2') ? link('mail', str(r, 'email2')) : null)
    add(tr().phone, tel ? link('tel', tel) : null)
    add(tr().phone, str(r, 'phone2') ? link('tel', str(r, 'phone2')) : null)
    add(tr().address, str(r, 'address') ? el('span', { class: 'caddr' }, str(r, 'address')) : null)
    const bd = str(r, 'birthday')
    add(tr().birthday, bd ? new Date(bd + 'T00:00:00').toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' }) + (birthdayText(r) ? ' ' + birthdayText(r) : '') : null)
    const notes = str(r, 'notes')
    return el('div', { class: 'contact-read' }, head, chips, acts, dl, ...(notes.trim() ? [el('h3', {}, tr().notes), renderMarkdown(notes)] : []))
  }
  const editor = (ctx: EditorCtx, box: HTMLElement) => {
    const L = tr()
    const known = [...new Set(all.flatMap((r) => splitTags(r.values.tags)))].sort()
    const tags = tagInput({ label: L.tags, values: splitTags(ctx.value('tags')), suggestions: known, placeholder: L.tagsPlaceholder, removeLabel: L.removeTag, onChange: (v) => ctx.set('tags', v.join(',')) })
    const rt = richText({
      label: L.notes,
      value: String(ctx.value('notes') ?? ''),
      rows: 5,
      labels: { write: L.write, preview: L.preview, bold: L.bold, italic: L.italic, heading: L.heading, list: L.bullets, checks: L.checks, quote: L.quote, code: L.code, link: L.link, nothing: L.nothingToPreview },
      onChange: (v) => ctx.set('notes', v),
    })
    box.append(el('div', { class: 'msk-field' }, el('label', {}, L.tags), tags.el), el('div', { class: 'msk-field' }, el('label', {}, L.notes), rt.el))
  }

  // --------------------------------------------------------------------------------- bar: tags, io, duplicates
  const drawTags = () => {
    const tags = [...new Set(all.flatMap((r) => splitTags(r.values.tags)))].sort((a, b) => a.localeCompare(b))
    if (activeTag && !tags.some((t) => t.toLocaleLowerCase() === activeTag!.toLocaleLowerCase())) activeTag = null
    tagsBar.replaceChildren()
    tagsBar.hidden = !tags.length
    for (const t of [null, ...tags]) {
      const b = el('button', { type: 'button', class: 'ctag pick', 'aria-pressed': String(t === activeTag) }, t ?? tr().allTags)
      b.addEventListener('click', () => {
        activeTag = t
        drawTags()
        void handle?.reload()
      })
      tagsBar.append(b)
    }
  }

  const doImport = async (file: File) => {
    const ext = file.name.toLowerCase().split('.').pop()
    if (ext !== 'vcf' && ext !== 'csv') return toast(tr().importWrong, { tone: 'err' })
    let people: Person[] = []
    try {
      const text = await file.text()
      people = (ext === 'vcf' ? parseVcf(text) : parseCsv(text)).slice(0, MAX_IMPORT)
    } catch (e) {
      return toast(tr().importFailed + errText(e, msk.context?.lang), { tone: 'err' })
    }
    if (!people.length) return toast(sub(tr().importNone, { f: file.name }), { tone: 'err' })
    if (!(await confirmDialog({ title: tr().importTitle, text: sub(tr().importAsk, { n: people.length, f: file.name }), ok: tr().import, cancel: tr().cancel }))) return
    let ok = 0
    let skipped = 0
    const api = msk.crud('contacts')
    for (const p of people) {
      const values: Record<string, string> = {}
      for (const [k, v] of Object.entries(p)) if (v) values[k] = v
      if (values.birthday && !/^\d{4}-\d{2}-\d{2}$/.test(values.birthday)) delete values.birthday
      try {
        await api.create(values)
        ok++
      } catch {
        skipped++
      }
    }
    toast(skipped ? sub(tr().importPartial, { n: ok, m: skipped }) : sub(tr().importOk, { n: ok }), { tone: skipped ? '' : 'ok' })
    await handle?.reload()
  }

  const doExport = (kind: 'vcf' | 'csv') => {
    const people = all.filter(inTag).map(person)
    if (!people.length) return toast(tr().exportNone)
    if (kind === 'vcf') downloadFile('contacts.vcf', toVcf(people), 'text/vcard;charset=utf-8')
    else downloadCsv('contacts.csv', people.map((p) => CSV_COLUMNS.map((k) => p[k] ?? '')), { header: [...CSV_COLUMNS] })
    toast(sub(tr().exported, { n: people.length }), { tone: 'ok' })
  }

  /** «From the directory»: a person of the tenant becomes a contact (the directory gives the name, never an email). */
  const fromDirectory = async () => {
    let chosen: DirectoryUser | null = null
    const picker = personPicker({
      label: tr().dirLabel,
      placeholder: tr().dirPlaceholder,
      value: null,
      clearLabel: tr().dirClear,
      noneLabel: tr().dirNone,
      search: (q) => msk.directory.search({ kind: 'user', q }).catch((e) => (toast(tr().dirDenied + errText(e, msk.context?.lang), { tone: 'err' }), [])),
      onChange: (u) => {
        chosen = u
        add.disabled = !u
      },
    })
    const add = el('button', { type: 'button', class: 'msk-btn' }, tr().dirAdd)
    add.disabled = true
    const cancel = el('button', { type: 'button', class: 'msk-btn ghost' }, tr().cancel)
    const d = dialog({ title: tr().dirTitle, body: el('div', { class: 'cdir' }, el('p', { class: 'cdup-hint' }, tr().dirHint), picker.el), actions: [cancel, add] })
    cancel.addEventListener('click', d.close)
    add.addEventListener('click', () => {
      const u = chosen as DirectoryUser | null
      if (!u) return
      add.disabled = true
      msk
        .crud('contacts')
        .create({ name: u.name, company: 'Internal', tags: tr().dirTag })
        .then(() => {
          d.close()
          toast(sub(tr().dirAdded, { n: u.name }), { tone: 'ok' })
          return handle?.reload()
        })
        .catch((e) => {
          add.disabled = false
          toast(tr().dirFailed + errText(e, msk.context?.lang), { tone: 'err' })
        })
    })
  }

  const showDuplicates = (go: (id: string) => void) => {
    const groups = duplicates(all.map(entry))
    const body = el('div', { class: 'cdups' })
    if (!groups.length) body.append(el('p', {}, tr().dupNone))
    else {
      body.append(el('p', { class: 'cdup-hint' }, tr().dupHint))
      for (const g of groups) {
        const ul = el('ul', { class: 'cdup' })
        for (const p of g) {
          const open = el('button', { type: 'button', class: 'msk-btn ghost mini' }, tr().open)
          open.addEventListener('click', () => {
            d.close()
            go(p.id)
          })
          ul.append(el('li', {}, avatar(p.name || tr().noName), el('span', { class: 'cdup-name' }, p.name || tr().noName), el('span', { class: 'cdup-meta' }, [p.email, p.phone, p.org].filter(Boolean).join(' · ')), open))
        }
        body.append(ul)
      }
    }
    const close = el('button', { type: 'button', class: 'msk-btn' }, tr().close)
    const d = dialog({ title: tr().dupTitle, body, actions: [close] })
    close.addEventListener('click', d.close)
  }

  const bar = (): HTMLElement[] => {
    const file = el('input', { type: 'file', accept: '.vcf,.csv,text/vcard,text/csv', class: 'msk-sr', 'aria-label': tr().import, tabindex: '-1' })
    file.addEventListener('change', () => {
      const f = file.files?.[0]
      file.value = ''
      if (f) void doImport(f)
    })
    const imp = el('button', { type: 'button', class: 'msk-btn ghost' }, '⤒ ' + tr().import)
    imp.addEventListener('click', () => file.click())
    imp.hidden = !msk.can('create')
    const exp = el('button', { type: 'button', class: 'msk-btn ghost', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, '⤓ ' + tr().export)
    exp.addEventListener('click', () => menu(exp, [{ label: tr().exportVcf, onClick: () => doExport('vcf') }, { label: tr().exportCsv, onClick: () => doExport('csv') }]))
    const dir = el('button', { type: 'button', class: 'msk-btn ghost' }, '👥 ' + tr().fromDirectory)
    dir.addEventListener('click', () => void fromDirectory())
    dir.hidden = !msk.can('create')
    const dup = el('button', { type: 'button', class: 'msk-btn ghost' }, '⧉ ' + tr().duplicates)
    dup.addEventListener('click', () => showDuplicates((id) => void openRow(id)))
    return [tagsBar, el('span', { class: 'cgrow' }), dir, imp, exp, dup, file]
  }
  /** Opens the detail of a contact: select it in the list, which is the way the view opens it. */
  const openRow = async (id: string) => {
    activeTag = null
    drawTags()
    await handle?.reload()
    app.querySelector<HTMLElement>(`.msk-item[data-id="${CSS.escape(id)}"]`)?.click()
  }

  const open = () => {
    handle = mountCrud(app, msk, 'contacts', {
      title: tr().title,
      newLabel: tr().newLabel,
      empty: { art: 'contacts', title: tr().emptyTitle, text: tr().emptyText },
      columns: ['name', 'email', 'phone', 'company'],
      views: views(),
      form: 'modal',
      bar: bar(),
      reader,
      editor,
      onLoad: (rows) => {
        all = rows
        drawTags()
      },
    })
    return handle
  }
  let off: () => void = open()
  // the view follows the host for its own texts; the title and the button are ours
  msk.onContext((ctx) => {
    if (langOf(ctx.lang) === lang) return
    lang = langOf(ctx.lang)
    tagsBar.setAttribute('aria-label', tr().tagsLabel)
    off()
    off = open()
  })
}

connect()
  .then(mount)
  .catch((e) => {
    app.textContent = TEXTS[langOf(undefined)].failed + errText(e)
  })

export type { L }
