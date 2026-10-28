// File manager: navigation by id, multiple selection, actions according to the level of permission.
import { pageHead, type FileEntry, type Listing, type Msk } from '@mosaikit/plugin-api'
import { choiceDialog, closeDialog, dialogOpen, nameList, pickFolder, promptDialog } from './dialogs.ts'
import { fileIcon, h, saveBlob, spinner, svg, type IconName } from './dom.ts'
import { locale, t } from './i18n.ts'
import { closeViewer, loadPreview, openViewer, viewerOpen, type Preview } from './preview.ts'
import {
  THUMB_MAX,
  atLeast,
  errMsg,
  fmtDate,
  fmtSize,
  freeName,
  kindLabel,
  kindOf,
  levelLabel,
  plural,
  previewable,
  previewMode,
  sortEntries,
  type SortKey,
} from './util.ts'

const PREF_KEY = 'msk_files_prefs'
const DRAG_TYPE = 'application/x-mosaikit-files'

type View = 'list' | 'grid'
type ActId =
  | 'open'
  | 'tab'
  | 'download'
  | 'rename'
  | 'move'
  | 'copy'
  | 'duplicate'
  | 'share'
  | 'delete'
  | 'mkdir'
  | 'upload'
  | 'selall'
  | 'refresh'
  | 'zipcwd'
  | 'sharecwd'
  | 'clear'

interface Action {
  id: ActId
  label: string
  icon: IconName
  danger?: boolean
  primary?: boolean
  kbd?: string
}

interface Prefs {
  view: View
  sortKey: SortKey
  sortDir: 1 | -1
}

function loadPrefs(): Prefs {
  const def: Prefs = { view: 'list', sortKey: 'name', sortDir: 1 }
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}') as Partial<Prefs>
    return {
      view: p.view === 'grid' ? 'grid' : 'list',
      sortKey: (['name', 'kind', 'modified', 'size'] as const).includes(p.sortKey as SortKey) ? (p.sortKey as SortKey) : def.sortKey,
      sortDir: p.sortDir === -1 ? -1 : 1,
    }
  } catch {
    return def
  }
}

function initialFolder(): string | null {
  try {
    const m = /^#f=([0-9a-fA-F-]{36})$/.exec(location.hash)
    return m ? m[1] : null
  } catch {
    return null
  }
}

export class FileManager {
  private parent: string | null = initialFolder()
  private listing: Listing | null = null
  private entries: FileEntry[] = []
  private sel = new Set<string>()
  private anchor: string | null = null
  private filter = ''
  private prefs = loadPrefs()
  private loading = false
  private loadError = ''
  private loadSeq = 0

  private detail: { key: string; preview?: Preview; error?: string } | null = null
  private sideKey = ''
  private thumbs = new Map<string, string>()
  private thumbQueue: FileEntry[] = []
  private thumbBusy = 0
  private dragIds: string[] | null = null
  private menu: HTMLElement | null = null
  private osDragDepth = 0

  private readonly root: HTMLElement
  private readonly search: HTMLInputElement
  private readonly viewSeg: HTMLElement
  private readonly headActs: HTMLElement
  private readonly crumbs: HTMLElement
  private readonly bar: HTMLElement
  private readonly main: HTMLElement
  private readonly side: HTMLElement
  private readonly status: HTMLElement
  private readonly picker: HTMLInputElement
  private readonly progress: HTMLElement

  constructor(
    private readonly el: HTMLElement,
    private readonly msk: Msk,
  ) {
    this.search = h('input', { type: 'search', placeholder: t('Search in this folder'), 'aria-label': t('Search in this folder') })
    this.search.addEventListener('input', () => {
      this.filter = this.search.value
      this.render()
    })
    this.search.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        this.search.value = ''
        this.filter = ''
        this.render()
        this.root.focus()
      }
      ev.stopPropagation()
    })
    this.viewSeg = h('div', { class: 'fm-seg', role: 'group', 'aria-label': t('View') })
    this.headActs = h('div', { class: 'fm-headacts' })
    this.crumbs = h('nav', { class: 'fm-crumbs', 'aria-label': t('Path') })
    this.bar = h('div', { class: 'fm-bar' })
    this.main = h('div', { class: 'fm-main' })
    this.side = h('aside', { class: 'fm-side', 'aria-label': t('Details') })
    this.status = h('div', { class: 'fm-status' })
    this.progress = h('div', { class: 'fm-progress', 'aria-live': 'polite' })
    this.picker = h('input', { type: 'file', multiple: true, hidden: true })
    this.picker.addEventListener('change', () => {
      const files = [...(this.picker.files ?? [])]
      this.picker.value = ''
      void this.upload(files, this.parent, this.entries)
    })
    this.root = h(
      'div',
      { class: 'fm', tabindex: -1 },
      // the header and the search never scroll (the same header as the pages of Mosaikit); the files do
      pageHead({
        title: t('Files'),
        sub: msk.user ? msk.user.name || msk.user.username : undefined,
        actions: [this.headActs],
        filters: [this.viewSeg, h('label', { class: 'fm-search' }, svg('search'), this.search)],
      }),
      h('div', { class: 'fm-content' }, this.crumbs, this.bar, h('div', { class: 'fm-body' }, this.main, this.side), this.status),
      this.picker,
    )
    el.replaceChildren(this.root)
    document.body.append(this.progress)
    this.bindMain()
    document.addEventListener('keydown', this.onKey)
    document.addEventListener('mousedown', this.onDocDown)
    window.addEventListener('blur', this.closeMenu)
    void this.refresh()
    this.root.focus()
  }

  dispose() {
    document.removeEventListener('keydown', this.onKey)
    document.removeEventListener('mousedown', this.onDocDown)
    window.removeEventListener('blur', this.closeMenu)
    closeViewer()
    closeDialog()
    this.closeMenu()
    this.setDetail(null)
    this.clearThumbs()
    this.progress.remove()
    this.el.replaceChildren()
  }

  // ------------------------------------------------------------------ data

  private get me(): string | undefined {
    return this.msk.user?.id
  }

  private get canCreate(): boolean {
    return atLeast(this.listing?.my_level ?? (this.parent === null ? 'write' : undefined), 'write')
  }

  private byId(id: string): FileEntry | undefined {
    return this.entries.find((e) => e.id === id)
  }

  private sorted(): FileEntry[] {
    return sortEntries(this.entries, this.prefs.sortKey, this.prefs.sortDir, this.filter)
  }

  private selected(): FileEntry[] {
    return this.sorted().filter((e) => this.sel.has(e.id))
  }

  private savePrefs() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(this.prefs))
    } catch {
      // storage not available
    }
  }

  private folderName(): string {
    const p = this.listing?.path
    return p && p.length ? p[p.length - 1].name : t('My files')
  }

  private sharedWithMe(e: FileEntry): boolean {
    return this.parent === null && !!this.me && e.owner_id !== this.me
  }

  async refresh(keepSel = true): Promise<void> {
    const my = ++this.loadSeq
    const parent = this.parent
    this.loading = true
    if (!this.listing) this.render()
    try {
      const l = await this.msk.files.list(parent)
      if (my !== this.loadSeq) return
      this.listing = l
      this.entries = l.entries
      this.loadError = ''
      const ids = new Set(l.entries.map((e) => e.id))
      this.sel = keepSel ? new Set([...this.sel].filter((id) => ids.has(id))) : new Set()
      if (this.anchor && !ids.has(this.anchor)) this.anchor = null
    } catch (e) {
      if (my !== this.loadSeq) return
      if (parent !== null) {
        this.msk.toast(t('Folder not available: {error}', { error: errMsg(e) }), true)
        this.loading = false
        return this.go(null)
      }
      this.loadError = errMsg(e)
      this.entries = []
    }
    this.loading = false
    this.sideKey = '' // details to draw again (names, levels)
    this.render()
  }

  go(id: string | null) {
    this.parent = id
    this.listing = null
    this.entries = []
    this.filter = ''
    this.search.value = ''
    this.sel.clear()
    this.anchor = null
    this.clearThumbs()
    try {
      history.replaceState(null, '', id ? '#f=' + id : location.pathname + location.search)
    } catch {
      // history not available
    }
    void this.refresh(false)
  }

  private goUp() {
    const p = this.listing?.path ?? []
    if (this.parent === null) return
    this.go(p.length >= 2 ? p[p.length - 2].id : null)
  }

  // -------------------------------------------------------------- actions

  private selectionActions(items: FileEntry[]): Action[] {
    const out: Action[] = []
    if (!items.length) return out
    const one = items.length === 1 ? items[0] : null
    const allManage = items.every((e) => atLeast(e.my_level, 'manage'))
    if (one) {
      if (one.is_dir) out.push({ id: 'open', label: t('Open'), icon: 'open', kbd: t('Enter'), primary: true })
      else if (previewable(one)) out.push({ id: 'open', label: t('Preview'), icon: 'eye', kbd: t('Enter'), primary: true })
      if (!one.is_dir) out.push({ id: 'tab', label: t('Open in a new tab'), icon: 'external' })
    }
    const anyDir = items.some((e) => e.is_dir)
    out.push({ id: 'download', label: one?.is_dir ? t('Download zip') : anyDir ? t('Download (zip for the folders)') : t('Download'), icon: one?.is_dir ? 'zip' : 'download' })
    if (one && atLeast(one.my_level, 'write')) out.push({ id: 'rename', label: t('Rename'), icon: 'edit', kbd: 'F2' })
    if (allManage) out.push({ id: 'move', label: t('Move to…'), icon: 'move' })
    out.push({ id: 'copy', label: t('Copy to…'), icon: 'copy' })
    if (this.canCreate) out.push({ id: 'duplicate', label: t('Duplicate here'), icon: 'copy' })
    if (one && atLeast(one.my_level, 'manage')) out.push({ id: 'share', label: t('Share'), icon: 'share' })
    if (allManage) out.push({ id: 'delete', label: t('Delete'), icon: 'trash', danger: true, kbd: t('Del') })
    return out
  }

  private folderActions(): Action[] {
    const out: Action[] = []
    if (this.canCreate) {
      out.push({ id: 'upload', label: t('Upload files'), icon: 'upload', primary: true })
      out.push({ id: 'mkdir', label: t('New folder'), icon: 'folderPlus' })
    }
    if (this.entries.length) out.push({ id: 'selall', label: t('Select all'), icon: 'check', kbd: 'Ctrl+A' })
    out.push({ id: 'refresh', label: t('Refresh'), icon: 'refresh' })
    if (this.parent !== null) {
      out.push({ id: 'zipcwd', label: t('Download folder (.zip)'), icon: 'zip' })
      if (atLeast(this.listing?.my_level, 'manage')) out.push({ id: 'sharecwd', label: t('Share folder'), icon: 'share' })
    }
    return out
  }

  private act(id: ActId) {
    this.closeMenu()
    const items = this.selected()
    const one = items.length === 1 ? items[0] : null
    switch (id) {
      case 'open':
        if (one) this.openItem(one)
        break
      case 'tab':
        if (one) this.openTab(one)
        break
      case 'download':
        void this.download(items)
        break
      case 'rename':
        if (one) this.rename(one)
        break
      case 'move':
        this.transferDialog(items, 'move')
        break
      case 'copy':
        this.transferDialog(items, 'copy')
        break
      case 'duplicate':
        void this.transfer(items, this.parent, 'copy', '')
        break
      case 'share':
        if (one) void this.share(one.id)
        break
      case 'delete':
        void this.remove(items)
        break
      case 'mkdir':
        this.mkdir()
        break
      case 'upload':
        this.picker.click()
        break
      case 'selall':
        this.sorted().forEach((e) => this.sel.add(e.id))
        this.render()
        break
      case 'refresh':
        this.clearThumbs()
        this.setDetail(null)
        void this.refresh()
        break
      case 'zipcwd':
        if (this.parent) void this.downloadZip(this.parent, this.folderName())
        break
      case 'sharecwd':
        if (this.parent) void this.share(this.parent)
        break
      case 'clear':
        this.sel.clear()
        this.render()
        break
    }
  }

  private button(a: Action, solid = false): HTMLButtonElement {
    const b = h(
      'button',
      { type: 'button', class: 'msk-btn mini' + (a.danger ? ' danger' : solid ? '' : ' ghost'), title: a.kbd ? `${a.label} (${a.kbd})` : null },
      svg(a.icon),
      a.label,
    )
    b.addEventListener('click', (ev) => {
      ev.stopPropagation()
      this.act(a.id)
    })
    return b
  }

  private openItem(e: FileEntry) {
    if (e.is_dir) this.go(e.id)
    else if (previewable(e)) this.view(e)
    else void this.download([e])
  }

  private view(e: FileEntry) {
    const items = this.sorted().filter(previewable)
    openViewer({
      msk: this.msk,
      items,
      index: items.findIndex((x) => x.id === e.id),
      onShow: (cur) => {
        this.sel = new Set([cur.id])
        this.anchor = cur.id
        this.render()
      },
      onDownload: (cur) => void this.download([cur]),
      onOpenTab: (cur) => this.openTab(cur),
      onClose: () => this.root.focus(),
    })
  }

  /** New tab opened at once (gesture of the user), then sent to the temporary URL. */
  private openTab(e: FileEntry) {
    const w = window.open('', '_blank')
    if (!w) {
      this.msk.toast(t('The browser blocked the new tab'), true)
      return
    }
    try {
      w.opener = null
    } catch {
      // ignore
    }
    this.msk.files.url(e.id).then(
      (url) => {
        w.location.href = url
      },
      (err) => {
        w.close()
        this.msk.toast(errMsg(err), true)
      },
    )
  }

  private async share(id: string) {
    try {
      await this.msk.share(id)
      await this.refresh()
    } catch (e) {
      this.msk.toast(errMsg(e), true)
    }
  }

  private async seq<T extends { name: string }>(items: T[], fn: (it: T) => Promise<unknown>): Promise<string[]> {
    const errors: string[] = []
    for (const it of items) {
      try {
        await fn(it)
      } catch (e) {
        errors.push(`${it.name}: ${errMsg(e)}`)
      }
    }
    return errors
  }

  private report(errors: string[], okText?: string) {
    if (errors.length) this.msk.toast(errors.length === 1 ? errors[0] : t('{n} errors: {first}', { n: errors.length, first: errors[0] }), true)
    else if (okText) this.msk.toast(okText)
  }

  private async downloadZip(id: string, name: string) {
    this.msk.toast(t('Preparing the zip of “{name}”…', { name }))
    saveBlob(await this.msk.files.zip(id), name + '.zip')
  }

  private async download(items: FileEntry[]) {
    const errs = await this.seq(items, async (e) => {
      if (e.is_dir) return this.downloadZip(e.id, e.name)
      const url = await this.msk.files.url(e.id, true)
      // served as an attachment: the browser downloads without leaving the page
      const a = h('a', { href: url, style: 'display:none' })
      document.body.append(a)
      a.click()
      a.remove()
    })
    this.report(errs)
  }

  private mkdir() {
    if (!this.canCreate) return
    const parent = this.parent
    promptDialog({
      title: t('New folder'),
      icon: 'folderPlus',
      label: t('Name of the folder'),
      value: t('New folder'),
      ok: t('Create'),
      validate: (v) => (this.entries.some((e) => e.name === v) ? t('an item with this name already exists') : ''),
      run: async (name) => {
        const d = await this.msk.files.mkdir(name, parent)
        this.msk.toast(t('Folder “{name}” created', { name }))
        if (this.parent === parent) {
          this.sel = new Set([d.id])
          this.anchor = d.id
          await this.refresh()
        }
      },
    })
  }

  private rename(e: FileEntry) {
    promptDialog({
      title: t('Rename'),
      icon: 'edit',
      label: e.is_dir ? t('New name of the folder') : t('New name of the file'),
      value: e.name,
      ok: t('Rename'),
      selectBase: !e.is_dir,
      validate: (v) => (v !== e.name && this.entries.some((x) => x.name === v && x.parent_id === e.parent_id) ? t('an item with this name already exists') : ''),
      run: async (name) => {
        if (name === e.name) return
        await this.msk.files.rename(e.id, name)
        this.msk.toast(t('Renamed to “{name}”', { name }))
        await this.refresh()
      },
    })
  }

  private async remove(items: FileEntry[]) {
    items = items.filter((e) => atLeast(e.my_level, 'manage'))
    if (!items.length) return
    const dirs = items.some((e) => e.is_dir)
    const text =
      (items.length === 1 ? t('Delete “{name}”?', { name: items[0].name }) : t('Delete {n} items?', { n: items.length })) +
      (dirs ? ' ' + t('The folders will be deleted with all their content.') : '') +
      ' ' +
      t('They stay in the Trash for a while: you can restore them from there.')
    let ok = false
    try {
      ok = await this.msk.confirm(text)
    } catch (e) {
      this.msk.toast(errMsg(e), true)
    }
    if (!ok) return
    const errs = await this.seq(items, (e) => this.msk.files.remove(e.id))
    this.report(errs, items.length === 1 ? t('“{name}” deleted', { name: items[0].name }) : plural(items.length, 'item deleted', 'items deleted'))
    await this.refresh()
  }

  private transferDialog(items: FileEntry[], mode: 'move' | 'copy') {
    if (!items.length) return
    if (mode === 'move' && !items.every((e) => atLeast(e.my_level, 'manage'))) return
    const one = items.length === 1
    const title = mode === 'move' ? (one ? 'Move “{name}”' : 'Move {n} items') : one ? 'Copy “{name}”' : 'Copy {n} items'
    pickFolder(this.msk, {
      title: t(title, { name: items[0].name, n: items.length }),
      icon: mode === 'move' ? 'move' : 'copy',
      ok: mode === 'move' ? t('Move here') : t('Copy here'),
      start: this.parent,
      blocked: new Set(items.filter((e) => e.is_dir).map((e) => e.id)),
      source: this.parent,
      sameOk: mode === 'copy',
      run: (dest, name) => this.transfer(items, dest, mode, name),
      onCreated: (p) => {
        if (p === this.parent) void this.refresh()
      },
    })
  }

  private async transfer(items: FileEntry[], dest: string | null, mode: 'move' | 'copy', destName: string) {
    if (!items.length) return
    const errs = await this.seq(items, (e) => (mode === 'move' ? this.msk.files.move(e.id, dest) : this.msk.files.copy(e.id, dest)))
    const DONE = {
      move: { one: ['“{name}” moved here', '“{name}” moved to “{dest}”'], many: ['{n} items moved here', '{n} items moved to “{dest}”'] },
      copy: { one: ['“{name}” copied here', '“{name}” copied to “{dest}”'], many: ['{n} items copied here', '{n} items copied to “{dest}”'] },
    }
    const done = DONE[mode][items.length === 1 ? 'one' : 'many'][dest === this.parent ? 0 : 1]
    this.report(errs, t(done, { name: items[0].name, n: items.length, dest: destName }))
    await this.refresh()
  }

  /** Uploads files (files only, not folders) into `dest`, asking what to do with the names already there. */
  async upload(files: File[], dest: string | null, known?: FileEntry[]) {
    if (!files.length) return
    let existing = known
    let destName = dest === this.parent ? this.folderName() : ''
    if (!existing) {
      try {
        const l = await this.msk.files.list(dest)
        existing = l.entries
        destName = l.path.length ? l.path[l.path.length - 1].name : t('My files')
        if (!atLeast(l.my_level, 'write')) {
          this.msk.toast(t('You do not have the permission to upload files to “{dest}”', { dest: destName }), true)
          return
        }
      } catch (e) {
        this.msk.toast(errMsg(e), true)
        return
      }
    }
    const byName = new Map(existing.map((e) => [e.name, e]))
    const clash = files.filter((f) => byName.has(f.name))
    let choice: string | null = 'keep'
    if (clash.length) {
      choice = await choiceDialog({
        title: clash.length === 1 ? t('“{name}” already exists', { name: clash[0].name }) : t('{n} files already exist', { n: clash.length }),
        icon: 'info',
        body: [
          (clash.length === 1 ? t('The folder already has an item with this name.') : t('The folder already has items with these names.')) +
            ' ' +
            t('Do you want to replace them, keep both versions or skip them?'),
          nameList(clash.map((f) => ({ name: f.name, is_dir: !!byName.get(f.name)?.is_dir }))),
        ],
        choices: [
          { id: 'skip', label: t('Skip') },
          { id: 'keep', label: t('Keep both') },
          { id: 'replace', label: t('Replace'), cls: '' },
        ],
      })
      if (!choice) return
    }
    const taken = new Set(byName.keys())
    const jobs: { name: string; file: File; replace: boolean }[] = []
    for (const f of files) {
      const old = byName.get(f.name)
      let name = f.name
      let replace = false
      if (old || taken.has(name)) {
        if (choice === 'skip') continue
        // a folder with the same name is not replaced by a file
        if (choice === 'replace' && old && !old.is_dir && !jobs.some((j) => j.name === name)) replace = true
        else name = freeName(f.name, taken)
      }
      taken.add(name)
      jobs.push({ name, file: f, replace })
    }
    if (!jobs.length) return

    const label = h('span', { class: 'lbl' })
    const pct = h('span', { class: 'pct' })
    const fill = h('i')
    const box = h('div', { class: 'fm-up' }, h('div', { class: 'r' }, label, pct), h('div', { class: 'bar' }, fill))
    this.progress.append(box)
    const total = jobs.reduce((s, j) => s + j.file.size, 0) || 1
    let done = 0
    let i = 0
    const uploaded: string[] = []
    const errs = await this.seq(jobs, async (j) => {
      i++
      label.textContent = (jobs.length > 1 ? `${i}/${jobs.length} · ` : '') + j.name
      try {
        const e = await this.msk.files.upload(j.file, j.name, dest, j.replace)
        uploaded.push(e.id)
      } finally {
        done += j.file.size
        const p = Math.round((done / total) * 100)
        fill.style.width = p + '%'
        pct.textContent = p + '%'
      }
    })
    setTimeout(() => box.remove(), 600)
    const here = dest === this.parent
    const up = jobs.length === 1 ? (here ? '“{name}” uploaded' : '“{name}” uploaded to “{dest}”') : here ? '{n} files uploaded' : '{n} files uploaded to “{dest}”'
    this.report(errs, t(up, { name: jobs[0].name, n: jobs.length, dest: destName }))
    if (dest === this.parent) {
      this.sel = new Set(uploaded)
      await this.refresh()
    } else {
      await this.refresh()
    }
  }

  // ------------------------------------------------------------ selection

  private click(id: string, ev: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; toggle?: boolean }) {
    const ids = this.sorted().map((e) => e.id)
    if (ev.shiftKey && this.anchor && ids.includes(this.anchor)) {
      const a = ids.indexOf(this.anchor)
      const b = ids.indexOf(id)
      if (!(ev.ctrlKey || ev.metaKey || ev.toggle)) this.sel.clear()
      ids.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((x) => this.sel.add(x))
    } else if (ev.ctrlKey || ev.metaKey || ev.toggle) {
      if (this.sel.has(id)) this.sel.delete(id)
      else this.sel.add(id)
      this.anchor = id
    } else {
      this.sel = new Set([id])
      this.anchor = id
    }
    this.render()
  }

  // ---------------------------------------------------------------- render

  render() {
    this.renderHead()
    this.renderCrumbs()
    this.renderBar()
    this.renderMain()
    this.renderSide()
    this.renderStatus()
  }

  private renderHead() {
    const seg = (v: View, icon: IconName, label: string) => {
      const b = h('button', { type: 'button', class: this.prefs.view === v ? 'on' : '', title: label, 'aria-label': label, 'aria-pressed': String(this.prefs.view === v) }, svg(icon))
      b.onclick = () => {
        this.prefs.view = v
        this.savePrefs()
        this.render()
      }
      return b
    }
    this.viewSeg.replaceChildren(seg('list', 'list', t('List')), seg('grid', 'grid', t('Grid')))
    const refresh = h('button', { type: 'button', class: 'msk-btn ghost mini icon', title: t('Refresh'), 'aria-label': t('Refresh') }, svg('refresh'))
    refresh.onclick = () => this.act('refresh')
    const acts: HTMLElement[] = [refresh]
    if (this.canCreate) {
      acts.push(this.button({ id: 'mkdir', label: t('New folder'), icon: 'folderPlus' }))
      acts.push(this.button({ id: 'upload', label: t('Upload'), icon: 'upload', primary: true }, true))
    }
    this.headActs.replaceChildren(...acts)
  }

  private dropTarget(el: HTMLElement, dest: string | null, canWrite: boolean) {
    el.addEventListener('dragover', (ev) => {
      if (!canWrite) return
      if (this.isOsFiles(ev)) {
        ev.preventDefault()
        ev.stopPropagation()
        ev.dataTransfer!.dropEffect = 'copy'
        el.classList.add('drop')
        return
      }
      if (!this.canDropOn(dest)) return
      ev.preventDefault()
      ev.stopPropagation()
      ev.dataTransfer!.dropEffect = ev.ctrlKey || ev.altKey ? 'copy' : 'move'
      el.classList.add('drop')
    })
    el.addEventListener('dragleave', () => el.classList.remove('drop'))
    el.addEventListener('drop', (ev) => {
      el.classList.remove('drop')
      if (!canWrite) return
      if (this.isOsFiles(ev)) {
        ev.preventDefault()
        ev.stopPropagation()
        this.endOsDrag()
        const files = this.droppedFiles(ev)
        if (files.length) void this.upload(files, dest, dest === this.parent ? this.entries : undefined)
        return
      }
      if (!this.canDropOn(dest)) return
      ev.preventDefault()
      ev.stopPropagation()
      const items = (this.dragIds ?? []).map((id) => this.byId(id)).filter((e): e is FileEntry => !!e)
      this.dragIds = null
      const copy = ev.ctrlKey || ev.altKey
      if (!copy && !items.every((e) => atLeast(e.my_level, 'manage'))) {
        this.msk.toast(t('You do not have the permission to move these items'), true)
        return
      }
      const name = dest === null ? t('My files') : (this.byId(dest)?.name ?? this.listing?.path.find((p) => p.id === dest)?.name ?? '')
      void this.transfer(items, dest, copy ? 'copy' : 'move', name)
    })
  }

  private renderCrumbs() {
    const path = this.listing?.path ?? []
    const crumb = (id: string | null, name: string, cur: boolean) => {
      const b = h('button', { type: 'button', class: 'fm-crumb' + (cur ? ' cur' : ''), 'aria-current': cur ? 'page' : null }, id ? null : svg('home'), name)
      b.onclick = () => {
        if (!cur) this.go(id)
      }
      // the root is always writable; for the ancestors the server decides
      this.dropTarget(b, id, id === null || !cur || this.canCreate)
      return b
    }
    const up = h('button', { type: 'button', class: 'msk-btn ghost mini icon', title: t('Parent folder (Backspace)'), 'aria-label': t('Parent folder'), disabled: this.parent === null }, svg('up'))
    up.onclick = () => this.goUp()
    const nodes: HTMLElement[] = [up, crumb(null, t('My files'), this.parent === null)]
    path.forEach((p, i) => nodes.push(h('span', { class: 'fm-sep' }, '›'), crumb(p.id, p.name, i === path.length - 1)))
    if (this.listing && this.parent !== null && this.listing.my_level !== 'manage') {
      nodes.push(h('span', { class: 'msk-badge' }, this.listing.my_level === 'read' ? t('read only') : t('edit')))
    }
    this.crumbs.replaceChildren(...nodes)
  }

  private renderBar() {
    const items = this.selected()
    this.bar.classList.toggle('has', items.length > 0)
    if (!items.length) {
      this.bar.replaceChildren(
        h(
          'span',
          { class: 'hint' },
          t('Select an item for the details · double click to open · right click for the menu') + (this.canCreate ? ' · ' + t('drag files here to upload them') : ''),
        ),
      )
      return
    }
    const clear = h('button', { type: 'button', class: 'msk-btn ghost mini icon', title: t('Clear the selection (Esc)'), 'aria-label': t('Clear the selection') }, svg('x'))
    clear.onclick = () => this.act('clear')
    this.bar.replaceChildren(
      h('span', { class: 'count' }, plural(items.length, 'item selected', 'items selected')),
      ...this.selectionActions(items).map((a) => this.button(a)),
      h('div', { class: 'grow' }),
      clear,
    )
  }

  private checkbox(id: string): HTMLButtonElement {
    const on = this.sel.has(id)
    const b = h('button', { type: 'button', class: 'chk' + (on ? ' on' : ''), role: 'checkbox', 'aria-checked': String(on), 'aria-label': t('Select') }, svg('check'))
    b.addEventListener('click', (ev) => {
      ev.stopPropagation()
      this.click(id, { toggle: true, shiftKey: ev.shiftKey })
    })
    b.addEventListener('dblclick', (ev) => ev.stopPropagation())
    return b
  }

  private badges(e: FileEntry): (HTMLElement | null)[] {
    if (this.sharedWithMe(e)) return [h('span', { class: 'msk-badge acc', title: t('Shared with you') }, t('Shared by {name}', { name: e.owner_name }))]
    if (e.shared && e.owner_id === this.me) return [h('span', { class: 'msk-badge', title: t('Shared with others') }, svg('users'), t('Shared'))]
    return []
  }

  private bindItem(el: HTMLElement, e: FileEntry) {
    el.dataset.id = e.id
    el.draggable = true
    el.addEventListener('click', (ev) => {
      this.click(e.id, ev)
      this.root.focus({ preventScroll: true })
    })
    el.addEventListener('dblclick', () => this.openItem(e))
    el.addEventListener('contextmenu', (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      if (!this.sel.has(e.id)) {
        this.sel = new Set([e.id])
        this.anchor = e.id
        this.render()
      }
      this.openMenu(ev.clientX, ev.clientY, false)
    })
    el.addEventListener('dragstart', (ev) => {
      if (!this.sel.has(e.id)) {
        this.sel = new Set([e.id])
        this.anchor = e.id
      }
      this.dragIds = [...this.sel]
      ev.dataTransfer?.setData(DRAG_TYPE, JSON.stringify(this.dragIds))
      if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'copyMove'
      // no render during the drag: recreating the source would cancel dragend
      this.main.querySelectorAll<HTMLElement>('[data-id]').forEach((r) => r.classList.toggle('sel', this.sel.has(r.dataset.id!)))
    })
    el.addEventListener('dragend', () => {
      this.dragIds = null
    })
    if (e.is_dir) this.dropTarget(el, e.id, atLeast(e.my_level, 'write'))
  }

  private renderMain() {
    const list = this.sorted()
    const dropzone = h('div', { class: 'fm-dropzone' }, svg('upload'), h('span', null, t('Drop to upload to “{name}”', { name: this.folderName() })))
    let content: HTMLElement | HTMLElement[]
    if (this.loading && !this.listing) {
      content = Array.from({ length: 6 }, (_, s) =>
        h('div', { class: 'fm-skel' }, h('i', { style: 'width:22px;height:22px;border-radius:6px' }), h('i', { style: `width:${30 + ((s * 13) % 40)}%` })),
      )
    } else if (this.loadError) {
      content = h('div', { class: 'fm-empty' }, h('b', null, t('Could not read the folder')), h('span', { class: 'err' }, this.loadError))
    } else if (!list.length) {
      if (this.filter) {
        content = h('div', { class: 'fm-empty' }, h('div', { class: 'big' }, svg('search')), h('b', null, t('No result')), h('span', null, t('No item contains “{text}”', { text: this.filter })))
      } else {
        content = h(
          'div',
          { class: 'fm-empty' },
          h('div', { class: 'big' }, svg(this.canCreate ? 'upload' : 'open')),
          h('b', null, this.parent === null ? t('You have no files yet') : t('This folder is empty')),
          this.canCreate
            ? [
                h('span', null, t('Drag files here or')),
                h(
                  'div',
                  { class: 'row' },
                  this.button({ id: 'upload', label: t('Upload files'), icon: 'upload', primary: true }, true),
                  this.button({ id: 'mkdir', label: t('New folder'), icon: 'folderPlus' }),
                ),
              ]
            : h('span', null, t('You have read-only access')),
        )
      }
    } else if (this.prefs.view === 'grid') {
      content = h(
        'div',
        { class: 'fm-grid' },
        ...list.map((e) => {
          const thumb = this.thumbs.get(e.id)
          const card = h(
            'div',
            { class: 'fm-card' + (this.sel.has(e.id) ? ' sel' : ''), title: e.name },
            this.checkbox(e.id),
            h('div', { class: 'th' }, thumb ? h('img', { src: thumb, alt: '', draggable: 'false' }) : fileIcon(e, true)),
            h('div', { class: 'nm2' }, e.name),
            h('div', { class: 'meta' }, e.is_dir ? t('Folder') : fmtSize(e.size)),
            this.sharedWithMe(e) ? h('div', { class: 'meta acc' }, t('Shared by {name}', { name: e.owner_name })) : null,
          )
          this.bindItem(card, e)
          return card
        }),
      )
      this.loadThumbs(list)
    } else {
      const allOn = list.every((e) => this.sel.has(e.id))
      const someOn = !allOn && list.some((e) => this.sel.has(e.id))
      const all = h('button', { type: 'button', class: 'chk' + (allOn ? ' on' : someOn ? ' part' : ''), role: 'checkbox', 'aria-checked': allOn ? 'true' : someOn ? 'mixed' : 'false', 'aria-label': t('Select all') }, someOn ? null : svg('check'))
      all.onclick = (ev) => {
        ev.stopPropagation()
        this.sel = allOn ? new Set() : new Set(list.map((e) => e.id))
        this.render()
      }
      const th = (key: SortKey, label: string, cls = '') => {
        const cur = this.prefs.sortKey === key
        const t = h(
          'th',
          { class: 'sortable ' + cls, 'aria-sort': cur ? (this.prefs.sortDir > 0 ? 'ascending' : 'descending') : 'none', tabindex: 0 },
          label,
          cur ? h('span', { class: 'arr' }, this.prefs.sortDir > 0 ? '↑' : '↓') : null,
        )
        const sort = () => {
          if (cur) this.prefs.sortDir = this.prefs.sortDir > 0 ? -1 : 1
          else {
            this.prefs.sortKey = key
            this.prefs.sortDir = key === 'name' || key === 'kind' ? 1 : -1
          }
          this.savePrefs()
          this.render()
        }
        t.onclick = sort
        t.onkeydown = (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault()
            ev.stopPropagation()
            sort()
          }
        }
        return t
      }
      content = h(
        'table',
        { class: 'fm-table' },
        h('thead', null, h('tr', null, h('th', { class: 'c-chk' }, all), th('name', t('Name')), th('kind', t('Kind'), 'c-kind'), h('th', { class: 'c-owner' }, t('Owner')), th('modified', t('Modified'), 'c-date'), th('size', t('Size'), 'c-size'))),
        h(
          'tbody',
          null,
          ...list.map((e) => {
            const tr = h(
              'tr',
              { class: 'it' + (this.sel.has(e.id) ? ' sel' : '') },
              h('td', { class: 'c-chk' }, this.checkbox(e.id)),
              h('td', null, h('div', { class: 'nm' }, fileIcon(e), h('span', { class: 'n' + (e.is_dir ? ' is-dir' : ''), title: e.name }, e.name), ...this.badges(e))),
              h('td', { class: 'c-kind' }, kindLabel(e)),
              h('td', { class: 'c-owner' }, e.owner_id === this.me ? t('me') : e.owner_name),
              h('td', { class: 'c-date', title: fmtDate(e.modified, true) }, fmtDate(e.modified)),
              h('td', { class: 'c-size' }, e.is_dir ? '—' : fmtSize(e.size)),
            )
            this.bindItem(tr, e)
            return tr
          }),
        ),
      )
    }
    this.main.replaceChildren(...(Array.isArray(content) ? content : [content]), dropzone)
  }

  private renderStatus() {
    const files = this.entries.filter((e) => !e.is_dir)
    const dirs = this.entries.length - files.length
    const visible = this.sorted().length
    this.status.replaceChildren(
      h('span', null, `${plural(dirs, 'folder', 'folders')} · ${plural(files.length, 'file', 'files')}`),
      h('span', null, fmtSize(files.reduce((s, e) => s + e.size, 0))),
      ...(this.filter ? [h('span', null, t('filter: {n} visible', { n: visible }))] : []),
    )
  }

  // --------------------------------------------------------- details panel

  private setDetail(d: FileManager['detail']) {
    this.detail?.preview?.dispose()
    this.detail = d
  }

  private renderSide(force = false) {
    const items = this.selected()
    const one = items.length === 1 ? items[0] : null
    const key = one
      ? `1:${one.id}:${one.name}:${one.modified}:${one.size}:${one.my_level}:${one.shared}`
      : items.length
        ? 'n:' + items.map((e) => e.id).join(',')
        : `d:${this.parent}:${this.entries.length}:${this.listing?.my_level}`
    if (!force && key === this.sideKey) return
    this.sideKey = key

    if (one) {
      if (this.detail?.key !== key) {
        this.setDetail({ key })
        if (previewMode(one)) this.loadDetail(one, key)
      }
      this.side.replaceChildren(...this.sideOne(one))
    } else {
      this.setDetail(null)
      this.side.replaceChildren(...(items.length ? this.sideMany(items) : this.sideFolder()))
    }
  }

  private loadDetail(e: FileEntry, key: string) {
    const upd = () => {
      if (this.detail?.key === key) this.renderSide(true)
    }
    loadPreview(this.msk, e, false, upd).then(
      (p) => {
        if (this.detail?.key !== key) return p.dispose()
        this.detail.preview = p
        upd()
      },
      (err) => {
        if (this.detail?.key !== key) return
        this.detail.error = errMsg(err)
        upd()
      },
    )
  }

  private acts(list: Action[]): HTMLElement {
    return h(
      'div',
      { class: 'acts' },
      list.map((a) => {
        const b = this.button(a, !!a.primary)
        if (a.primary || a.danger) b.classList.add('wide')
        return b
      }),
    )
  }

  private dl(rows: [string, string | Node | null | undefined][]): HTMLElement {
    return h(
      'dl',
      null,
      rows.filter(([, v]) => v != null && v !== '').flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v as string | Node)]),
    )
  }

  private sideOne(e: FileEntry): HTMLElement[] {
    const d = this.detail
    const mode = previewMode(e)
    let pv: HTMLElement
    if (!mode) pv = h('div', { class: 'pv plain' }, fileIcon(e, true))
    else if (d?.error) pv = h('div', { class: 'pv plain' }, h('div', { class: 'err' }, t('Preview not available'), h('br'), h('small', null, d.error)))
    else if (!d?.preview) pv = h('div', { class: 'pv plain' }, spinner())
    else {
      const zoom = h('button', { type: 'button', class: 'msk-btn ghost mini' }, svg('eye'), t('Open'))
      zoom.onclick = () => this.view(e)
      pv = h('div', { class: 'pv' + (mode === 'text' ? ' text' : '') }, d.preview.node, h('div', { class: 'zoom' }, zoom))
    }
    const m = d?.preview?.meta ?? {}
    const owner = e.owner_id === this.me ? t('You') : e.owner_name
    return [
      pv,
      h('div', { class: 'hd' }, h('div', { class: 'n' }, e.name), h('div', { class: 'k' }, kindLabel(e)), ...this.badges(e)),
      this.dl([
        [t('Size'), e.is_dir ? null : fmtSize(e.size) + (e.size >= 1024 ? ` (${e.size.toLocaleString(locale())} B)` : '')],
        [t('Resolution'), m.dims],
        [t('Lines'), m.lines != null ? m.lines.toLocaleString(locale()) + (m.truncated ? '+' : '') : null],
        [t('Duration'), m.duration],
        [t('Created'), fmtDate(e.created, true)],
        [t('Modified'), fmtDate(e.modified, true)],
        [t('Owner'), owner],
        [t('Your permission'), levelLabel(e.my_level)],
        [t('Shared'), e.shared ? t('Yes') : t('No')],
      ]),
      this.acts(this.selectionActions([e])),
    ]
  }

  private sideMany(items: FileEntry[]): HTMLElement[] {
    const nd = items.filter((e) => e.is_dir).length
    const sz = items.reduce((s, e) => s + (e.is_dir ? 0 : e.size), 0)
    return [
      h('div', { class: 'pv plain' }, h('div', { class: 'fm-stack' }, ...items.slice(0, 3).map((e, i) => h('div', { style: `left:${i * 10}px;top:${i * 8}px` }, fileIcon(e, true))))),
      h('div', { class: 'hd' }, h('div', { class: 'n' }, plural(items.length, 'item selected', 'items selected')), h('div', { class: 'k' }, `${plural(nd, 'folder', 'folders')} · ${plural(items.length - nd, 'file', 'files')}`)),
      this.dl([[t('Size of the files'), fmtSize(sz) + (nd ? ' + ' + t('folders') : '')]]),
      this.acts(this.selectionActions(items)),
    ]
  }

  private sideFolder(): HTMLElement[] {
    const lvl = this.listing?.my_level
    return [
      h('div', { class: 'pv plain' }, fileIcon({ name: '', is_dir: true }, true)),
      h('div', { class: 'hd' }, h('div', { class: 'n' }, this.folderName()), h('div', { class: 'k' }, t('Current folder'))),
      this.dl([
        [t('Items'), String(this.entries.length)],
        [t('Shared with you'), this.parent === null ? String(this.entries.filter((e) => this.sharedWithMe(e)).length) : null],
        [t('Your permission'), this.parent !== null && lvl ? levelLabel(lvl) : null],
      ]),
      this.acts(this.folderActions().filter((a) => a.id !== 'selall' && a.id !== 'refresh')),
    ]
  }

  // ----------------------------------------------------------- thumbnails

  private clearThumbs() {
    for (const u of this.thumbs.values()) if (u) URL.revokeObjectURL(u)
    this.thumbs.clear()
    this.thumbQueue = []
  }

  private loadThumbs(list: FileEntry[]) {
    for (const e of list) {
      if (previewMode(e) === 'image' && kindOf(e) === 'image' && !this.thumbs.has(e.id) && e.size <= THUMB_MAX) {
        this.thumbs.set(e.id, '')
        this.thumbQueue.push(e)
      }
    }
    this.pumpThumbs()
  }

  private pumpThumbs() {
    while (this.thumbBusy < 4 && this.thumbQueue.length) {
      const e = this.thumbQueue.shift()!
      this.thumbBusy++
      this.msk.files
        .blob(e.id)
        .then((b) => {
          if (!this.thumbs.has(e.id)) return
          const type = b.type && !/svg|xml|html/i.test(b.type) ? b.type : 'image/png'
          const u = URL.createObjectURL(new Blob([b], { type }))
          this.thumbs.set(e.id, u)
          const th = this.main.querySelector(`.fm-card[data-id="${CSS.escape(e.id)}"] .th`)
          th?.replaceChildren(h('img', { src: u, alt: '', draggable: 'false' }))
        })
        .catch(() => {
          // the icon stays
        })
        .finally(() => {
          this.thumbBusy--
          this.pumpThumbs()
        })
    }
  }

  // --------------------------------------------------------- context menu

  private openMenu(x: number, y: number, background: boolean) {
    this.closeMenu()
    const items = this.selected()
    const acts = background || !items.length ? this.folderActions() : this.selectionActions(items)
    const menu = h(
      'div',
      { class: 'fm-menu', role: 'menu' },
      acts.map((a) => {
        const b = h('button', { type: 'button', role: 'menuitem', class: a.danger ? 'danger' : '' }, svg(a.icon), h('span', null, a.label), a.kbd ? h('kbd', null, a.kbd) : null)
        b.onclick = (ev) => {
          ev.stopPropagation()
          this.act(a.id)
        }
        return b
      }),
    )
    document.body.append(menu)
    const r = menu.getBoundingClientRect()
    menu.style.left = Math.max(4, Math.min(x, window.innerWidth - r.width - 8)) + 'px'
    menu.style.top = Math.max(4, Math.min(y, window.innerHeight - r.height - 8)) + 'px'
    this.menu = menu
    menu.querySelector<HTMLElement>('button')?.focus()
  }

  private readonly closeMenu = () => {
    this.menu?.remove()
    this.menu = null
  }

  private readonly onDocDown = (ev: MouseEvent) => {
    if (this.menu && !this.menu.contains(ev.target as Node)) this.closeMenu()
  }

  // ------------------------------------------------------------ drag & drop

  private isOsFiles(ev: DragEvent): boolean {
    const t = ev.dataTransfer?.types
    return !!t && [...t].includes('Files') && !this.dragIds
  }

  private canDropOn(dest: string | null): boolean {
    if (!this.dragIds || dest === this.parent) return false
    if (dest !== null && this.dragIds.includes(dest)) return false
    return true
  }

  private endOsDrag() {
    this.osDragDepth = 0
    this.main.classList.remove('dragover')
  }

  /** Files only: folders dragged from the desktop are left out. */
  private droppedFiles(ev: DragEvent): File[] {
    const dt = ev.dataTransfer
    if (!dt) return []
    const out: File[] = []
    let skipped = 0
    const items = [...dt.items]
    if (items.length && typeof items[0].webkitGetAsEntry === 'function') {
      for (const it of items) {
        if (it.kind !== 'file') continue
        const entry = it.webkitGetAsEntry()
        const f = it.getAsFile()
        if (entry?.isDirectory || !f) skipped++
        else out.push(f)
      }
    } else {
      out.push(...dt.files)
    }
    if (skipped) this.msk.toast(skipped === 1 ? t('Folders cannot be uploaded: drag the files') : t('{n} folders ignored: only files can be uploaded', { n: skipped }), true)
    return out
  }

  private bindMain() {
    const main = this.main
    main.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement
      if (t === main || t.classList.contains('fm-grid') || t.classList.contains('fm-empty')) {
        if (this.sel.size) {
          this.sel.clear()
          this.render()
        }
      }
    })
    main.addEventListener('contextmenu', (ev) => {
      ev.preventDefault()
      if (this.sel.size) {
        this.sel.clear()
        this.render()
      }
      this.openMenu(ev.clientX, ev.clientY, true)
    })
    main.addEventListener('dragenter', (ev) => {
      if (this.isOsFiles(ev) && this.canCreate) {
        this.osDragDepth++
        main.classList.add('dragover')
      }
    })
    main.addEventListener('dragleave', (ev) => {
      if (this.isOsFiles(ev) && --this.osDragDepth <= 0) this.endOsDrag()
    })
    main.addEventListener('dragover', (ev) => {
      if (this.isOsFiles(ev) && this.canCreate) {
        ev.preventDefault()
        ev.dataTransfer!.dropEffect = 'copy'
      }
    })
    main.addEventListener('drop', (ev) => {
      if (!this.isOsFiles(ev)) return
      ev.preventDefault()
      this.endOsDrag()
      if (!this.canCreate) return
      const files = this.droppedFiles(ev)
      if (files.length) void this.upload(files, this.parent, this.entries)
    })
  }

  // ------------------------------------------------------------- keyboard

  private readonly onKey = (ev: KeyboardEvent) => {
    if (viewerOpen() || dialogOpen()) return
    if (this.menu) {
      if (ev.key === 'Escape') {
        this.closeMenu()
        ev.preventDefault()
      }
      return
    }
    const t = ev.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
    // with the focus on a button, Enter and space activate it
    if (t?.tagName === 'BUTTON' && (ev.key === 'Enter' || ev.key === ' ')) return
    const list = this.sorted()
    const items = this.selected()
    const one = items.length === 1 ? items[0] : null
    const ctrl = ev.ctrlKey || ev.metaKey
    const key = ev.key
    if (key === 'Escape' && items.length) {
      this.sel.clear()
      this.render()
    } else if (key === 'Delete' && items.length) {
      ev.preventDefault()
      void this.remove(items)
    } else if (key === 'F2' && one && atLeast(one.my_level, 'write')) {
      ev.preventDefault()
      this.rename(one)
    } else if (key === 'Enter' && one) {
      ev.preventDefault()
      this.openItem(one)
    } else if (key === ' ' && one && previewable(one)) {
      ev.preventDefault()
      this.view(one)
    } else if ((key === 'Backspace' || (ev.altKey && key === 'ArrowUp')) && this.parent !== null) {
      ev.preventDefault()
      this.goUp()
    } else if (ctrl && key.toLowerCase() === 'a') {
      ev.preventDefault()
      list.forEach((e) => this.sel.add(e.id))
      this.render()
    } else if (ctrl && key.toLowerCase() === 'f') {
      ev.preventDefault()
      this.search.focus()
    } else if (/^Arrow(Up|Down|Left|Right)$/.test(key) && list.length) {
      const horiz = key === 'ArrowLeft' || key === 'ArrowRight'
      if (horiz && this.prefs.view !== 'grid') return
      ev.preventDefault()
      let cols = 1
      const g = this.main.querySelector<HTMLElement>('.fm-grid')
      if (g) cols = Math.max(1, getComputedStyle(g).gridTemplateColumns.split(' ').length)
      const step = horiz ? (key === 'ArrowLeft' ? -1 : 1) : key === 'ArrowUp' ? -cols : cols
      const i = list.findIndex((e) => e.id === this.anchor)
      const ni = i < 0 ? 0 : Math.max(0, Math.min(list.length - 1, i + step))
      this.click(list[ni].id, { shiftKey: ev.shiftKey })
      this.main.querySelector(`[data-id="${CSS.escape(list[ni].id)}"]`)?.scrollIntoView({ block: 'nearest' })
    }
  }
}
