// Anteprime (pannello dettagli e visualizzatore a tutto schermo).
// Testo, codice, HTML e SVG si mostrano sempre come TESTO: nessun contenuto attivo.
import type { FileEntry, Msk } from '@mosaikit/plugin-api'
import { fileIcon, h, spinner, svg } from './dom.ts'
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

/** Tipo del Blob per il browser: mai HTML/SVG/XML (contenuti che potrebbero diventare attivi). */
function safeType(e: FileEntry, b: Blob): string {
  const t = MIME[ext(e.name)] || b.type || e.mime || 'application/octet-stream'
  return /html|svg|xml|javascript/i.test(t) ? 'application/octet-stream' : t
}

/**
 * Carica l'anteprima di un file. `onMeta` viene chiamata quando arrivano
 * dati letti dopo (durata, risoluzione di un video).
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
        // json non valido: testo grezzo
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
    node = h('iframe', { src: big ? url : url + '#toolbar=0&view=FitH', title: 'Anteprima PDF di ' + e.name })
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

/** Visualizzatore a tutto schermo con navigazione fra i file con anteprima. */
export function openViewer(o: ViewerOpts) {
  viewer?.close()
  const items = o.items
  let idx = Math.max(0, Math.min(items.length - 1, o.index))
  let cur: Preview | null = null
  let seq = 0
  const top = h('div', { class: 'top' })
  const stage = h('div', { class: 'stage' })
  const root = h('div', { class: 'fm-lb', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Visualizzatore' }, top, stage)
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
    const closeBtn = h('button', { type: 'button', class: 'msk-btn ghost mini icon', title: 'Chiudi (Esc)', 'aria-label': 'Chiudi' }, svg('x'))
    closeBtn.onclick = close
    const dl = h('button', { type: 'button', class: 'msk-btn ghost mini' }, svg('download'), 'Scarica')
    dl.onclick = () => o.onDownload(e)
    const tab = h('button', { type: 'button', class: 'msk-btn ghost mini' }, svg('external'), 'Apri in una nuova scheda')
    tab.onclick = () => o.onOpenTab(e)
    top.replaceChildren(
      fileIcon(e),
      h(
        'div',
        { class: 'tt' },
        h('div', { class: 'n' }, e.name),
        h('div', { class: 'k' }, `${kindLabel(e)} · ${fmtSize(e.size)}` + (items.length > 1 ? ` · ${idx + 1} di ${items.length}` : '')),
      ),
      h('div', { class: 'grow' }),
      tab,
      dl,
      closeBtn,
    )
    const nav: HTMLElement[] = []
    if (items.length > 1) {
      const l = h('button', { type: 'button', class: 'nav l', title: 'Precedente (←)', 'aria-label': 'Precedente' }, svg('left'))
      const r = h('button', { type: 'button', class: 'nav r', title: 'Successivo (→)', 'aria-label': 'Successivo' }, svg('right'))
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
        const extra = p.meta.truncated ? h('div', { class: 'trunc' }, `Mostrati i primi ${fmtSize(TEXT_MAX)}: scarica il file per vederlo tutto`) : null
        stage.replaceChildren(h('div', { class: 'media' }, p.node), ...nav, extra ?? '')
      },
      (err) => {
        if (my !== seq) return
        stage.replaceChildren(h('div', { class: 'err' }, 'Anteprima non disponibile: ' + errMsg(err)), ...nav)
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
