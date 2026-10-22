// Reads only the names of the files of a zip (central directory), without
// extracting anything: it refuses, before the upload, a zip without index.html,
// which would otherwise replace the files of an existing site with useless
// content. If the zip cannot be read (zip64, damaged file) it returns null and
// the server decides.

const EOCD_SIG = 0x06054b50
const CEN_SIG = 0x02014b50

export async function zipEntryNames(file: Blob): Promise<string[] | null> {
  try {
    // the EOCD is in the last 22 bytes + comment (max 64 KB)
    const tailLen = Math.min(file.size, 22 + 0xffff)
    const tail = new DataView(await file.slice(file.size - tailLen).arrayBuffer())
    let eocd = -1
    for (let i = tail.byteLength - 22; i >= 0; i--) {
      if (tail.getUint32(i, true) === EOCD_SIG) {
        eocd = i
        break
      }
    }
    if (eocd < 0) return null
    const count = tail.getUint16(eocd + 10, true)
    const cdSize = tail.getUint32(eocd + 12, true)
    const cdOffset = tail.getUint32(eocd + 16, true)
    if (count === 0xffff || cdOffset === 0xffffffff || cdOffset + cdSize > file.size) return null
    const cd = new DataView(await file.slice(cdOffset, cdOffset + cdSize).arrayBuffer())
    const dec = new TextDecoder()
    const names: string[] = []
    let p = 0
    for (let n = 0; n < count; n++) {
      if (p + 46 > cd.byteLength || cd.getUint32(p, true) !== CEN_SIG) return null
      const nameLen = cd.getUint16(p + 28, true)
      const extraLen = cd.getUint16(p + 30, true)
      const commentLen = cd.getUint16(p + 32, true)
      names.push(dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen)))
      p += 46 + nameLen + extraLen + commentLen
    }
    return names
  } catch {
    return null
  }
}

/** Is there an index.html (at any level)? */
export function hasIndexHtml(names: string[]): boolean {
  return names.some((p) => {
    const base = p.replace(/\\/g, '/').split('/').pop() ?? ''
    return base.toLowerCase() === 'index.html'
  })
}
