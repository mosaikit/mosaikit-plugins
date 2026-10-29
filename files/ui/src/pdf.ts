// PDF preview drawn by pdf.js on canvases. The built-in viewer of Chrome never starts here: the plugin runs in a
// sandboxed frame and the PDF would open in a frame that inherits that sandbox (Chrome refuses to start its viewer in
// a sandboxed document and shows a blank or "blocked" frame). pdf.js only needs a worker of the own UI folder
// (worker-src 'self' of the CSP) and the bytes of the file.
import { h } from './dom.ts'

const MAX_PAGES = 100

export interface PdfView {
  node: HTMLElement
  pages: number
  /** Draws the pages once `node` is in the document (the scale follows its width); `all` = every page, else the first. */
  start(): Promise<void>
  dispose(): void
}

export async function renderPdf(bytes: ArrayBuffer, all: boolean): Promise<PdfView> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.min.mjs')
  const worker = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(worker, import.meta.url).href
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false })
  const doc = await task.promise
  const box = h('div', { class: 'pdf-pages' })
  let gone = false
  const draw = async (n: number) => {
    const page = await doc.getPage(n)
    const cv = h('canvas', { class: 'pdf-page', role: 'img', 'aria-label': `${n} / ${doc.numPages}` })
    box.append(cv)
    const base = page.getViewport({ scale: 1 })
    // the width of the box decides the scale (the panel is narrow, the viewer wide); the pixels follow the device
    const width = Math.max(160, Math.min(box.clientWidth || (all ? 900 : 276), 1000))
    const css = width / base.width
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const vp = page.getViewport({ scale: css * dpr })
    cv.width = Math.floor(vp.width)
    cv.height = Math.floor(vp.height)
    cv.style.width = `${Math.floor(vp.width / dpr)}px`
    cv.style.height = `${Math.floor(vp.height / dpr)}px`
    await page.render({ canvasContext: cv.getContext('2d')!, viewport: vp, background: '#ffffff' } as never).promise
  }
  const rest = async () => {
    for (let n = 2; n <= Math.min(doc.numPages, MAX_PAGES) && !gone; n++) await draw(n)
  }
  return {
    node: box,
    pages: doc.numPages,
    start: async () => {
      await draw(1)
      if (all) void rest().catch(() => {})
    },
    dispose() {
      gone = true
      void task.destroy()
    },
  }
}
