// Previews (details panel and full-screen viewer).
// Text, code, HTML and SVG are always shown as TEXT: no active content.
import type { FileEntry, Msk } from '@mosaikit/plugin-api'
import { fileIcon, h, spinner, svg } from './dom.ts'
import { t } from './i18n.ts'
import { TEXT_MAX, errMsg, ext, fmtDuration, fmtSize, kindLabel, previewMode } from './util.ts'

export interface PreviewMeta {
  dims?: string
  lines?: number
  truncated?: boolean
  duration?: string
}

export interface Preview {
  node: HTMLElement
  meta: PreviewMeta
  dispose(): void
}

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
}

/** Type of the Blob for the browser: never HTML/SVG/XML (content that could become active). */
function safeType(e: FileEntry, b: Blob): string {
  const t = MIME[ext(e.name)] || b.type || e.mime || 'application/octet-stream'
  return /html|svg|xml|javascript/i.test(t) ? 'application/octet-stream' : t
}

/**
 * Loads the preview of a file. `onMeta` is called when data read later
 * arrives (duration, resolution of a video).
 */
export async function loadPreview(msk: Msk, e: FileEntry, big: boolean, onMeta?: () => void): Promise<Preview> {
  const mode = previewMode(e)
  const meta: PreviewMeta = {}
  if (!mode) return { node: h('div', { class: 'pv-icon' }, fileIcon(e, true)), meta, dispose() {} }

  const blob = await msk.files.blob(e.id)
  if (mode === 'text') {
    meta.truncated = blob.size > TEXT_MAX
    let t = await (meta.truncated ? blob.slice(0, TEXT_MAX) : blob).text()
    if (/^(json|geojson)$/.test(ext(e.name)) && !meta.truncated) {
      try {
        t = JSON.stringify(JSON.parse(t), null, 2)
      } catch {
        // invalid json: raw text
      }
    }
    meta.lines = t ? t.split('\n').length : 0
    const pre = h('pre', { class: 'pv-text', tabindex: 0 })
    pre.textContent = big ? t : t.slice(0, 8000)
    return { node: pre, meta, dispose() {} }
  }

  const url = URL.createObjectURL(new Blob([blob], { type: safeType(e, blob) }))
  const dispose = () => URL.revokeObjectURL(url)
  let node: HTMLElement
  if (mode === 'image') {
    const img = h('img', { src: url, alt: e.name, draggable: 'false' })
    await new Promise<void>((res) => {
      img.onload = () => {
        meta.dims = `${img.naturalWidth} × ${img.naturalHeight} px`
        res()
      }
      img.onerror = () => res()
    })
    node = img
  } else if (mode === 'pdf') {
    node = h('iframe', { src: big ? url : url + '#toolbar=0&view=FitH', title: t('PDF preview of {name}', { name: e.name }) })
  } else {
    const media = h(mode, { src: url, controls: true, preload: 'metadata' }) as HTMLMediaElement
    media.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(media.duration)) meta.duration = fmtDuration(media.duration)
      if (media instanceof HTMLVideoElement && media.videoWidth) meta.dims = `${media.videoWidth} × ${media.videoHeight} px`
      onMeta?.()
    })
    if (big && media instanceof HTMLVideoElement) media.autoplay = true
    node = media
  }
  return { node, meta, dispose }
}

export interface ViewerOpts {
  msk: Msk
  items: FileEntry[]
  index: number
  onShow: (e: FileEntry) => void
  onDownload: (e: FileEntry) => void
  onOpenTab: (e: FileEntry) => void
  onClose: () => void
}

let viewer: { close: () => void; step: (d: number) => void } | null = null

export function viewerOpen(): boolean {
  return !!viewer
}

/** Full-screen viewer with navigation among the files with a preview. */
export function openViewer(o: ViewerOpts) {
  viewer?.close()
  const items = o.items
  let idx = Math.max(0, Math.min(items.length - 1, o.index))
  let cur: Preview | null = null
  let seq = 0
  const top = h('div', { class: 'top' })
  const stage = h('div', { class: 'stage' })
  const root = h('div', { class: 'fm-lb', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('Viewer') }, top, stage)
  const prevFocus = document.activeElement as HTMLElement | null

  function close() {
    seq++
    cur?.dispose()
    cur = null
    root.remove()
    viewer = null
    document.removeEventListener('keydown', onKey, true)
    o.onClose()
    prevFocus?.focus?.()
  }

  function onKey(ev: KeyboardEvent) {
    if (ev.key === 'Escape') close()
    else if (ev.key === 'ArrowLeft') step(-1)
    else if (ev.key === 'ArrowRight') step(1)
    else return
    ev.preventDefault()
    ev.stopPropagation()
  }

  function step(d: number) {
    if (items.length > 1) show(idx + d)
  }

  function show(i: number) {
    idx = (i + items.length) % items.length
    const e = items[idx]
    const my = ++seq
    cur?.dispose()
    cur = null
    const closeBtn = h('button', { type: 'button', class: 'msk-btn ghost mini icon', title: t('Close (Esc)'), 'aria-label': t('Close') }, svg('x'))
    closeBtn.onclick = close
    const dl = h('button', { type: 'button', class: 'msk-btn ghost mini' }, svg('download'), t('Download'))
    dl.onclick = () => o.onDownload(e)
    const tab = h('button', { type: 'button', class: 'msk-btn ghost mini' }, svg('external'), t('Open in a new tab'))
    tab.onclick = () => o.onOpenTab(e)
    top.replaceChildren(
      fileIcon(e),
      h(
        'div',
        { class: 'tt' },
        h('div', { class: 'n' }, e.name),
        h('div', { class: 'k' }, `${kindLabel(e)} · ${fmtSize(e.size)}` + (items.length > 1 ? ' · ' + t('{i} of {n}', { i: idx + 1, n: items.length }) : '')),
      ),
      h('div', { class: 'grow' }),
      tab,
      dl,
      closeBtn,
    )
    const nav: HTMLElement[] = []
    if (items.length > 1) {
      const l = h('button', { type: 'button', class: 'nav l', title: t('Previous (←)'), 'aria-label': t('Previous') }, svg('left'))
      const r = h('button', { type: 'button', class: 'nav r', title: t('Next (→)'), 'aria-label': t('Next') }, svg('right'))
      l.onclick = () => step(-1)
      r.onclick = () => step(1)
      nav.push(l, r)
    }
    stage.replaceChildren(spinner(), ...nav)
    o.onShow(e)
    loadPreview(o.msk, e, true).then(
      (p) => {
        if (my !== seq) return p.dispose()
        cur = p
        const extra = p.meta.truncated ? h('div', { class: 'trunc' }, t('Showing the first {size}: download the file to see all of it', { size: fmtSize(TEXT_MAX) })) : null
        stage.replaceChildren(h('div', { class: 'media' }, p.node), ...nav, extra ?? '')
      },
      (err) => {
        if (my !== seq) return
        stage.replaceChildren(h('div', { class: 'err' }, t('Preview not available: {error}', { error: errMsg(err) })), ...nav)
      },
    )
  }

  stage.addEventListener('click', (ev) => {
    if (ev.target === stage) close()
  })
  document.addEventListener('keydown', onKey, true)
  document.body.append(root)
  viewer = { close, step }
  show(idx)
  root.querySelector<HTMLElement>('.top button')?.focus()
}

export function closeViewer() {
  viewer?.close()
}
