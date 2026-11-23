// A picture reduced to a thumbnail, the same way the Sites plugin does it: at most 480 px wide, JPEG, small enough to
// live in the record as a `data:` address. Needs a browser (canvas), so it is not covered by the unit tests.

/** The picture (a blob, or a `data:` address as `msk.web.probe` returns it) as a small JPEG `data:` address. */
export async function toThumbnail(src: Blob | string): Promise<string> {
  // a data: address is decoded here (the CSP of the plugin does not allow fetch on it)
  let blob: Blob
  if (typeof src === 'string') {
    const m = /^data:([^;,]+);base64,(.*)$/s.exec(src)
    if (!m) throw new Error('image')
    const bin = atob(m[2]!)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    blob = new Blob([bytes], { type: m[1] })
  } else blob = src
  const bmp = await createImageBitmap(blob)
  const w = Math.min(480, bmp.width)
  const h = Math.max(1, Math.round((bmp.height * w) / bmp.width))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  return canvas.toDataURL('image/jpeg', 0.8)
}
