// Reads only the names of the files of a zip (central directory), without
// extracting anything: it refuses, before the upload, a zip without index.html,
// which would otherwise replace the files of an existing site with useless
// content. If the zip cannot be read (zip64, damaged file) it returns null and
// the server decides.

const EOCD_SIG = 0x06054b50
const CEN_SIG = 0x02014b50

export interface ZipEntry {
  name: string
  /** bytes once unpacked */
  size: number
}

export async function zipEntryNames(file: Blob): Promise<string[] | null> {
  return (await zipEntries(file))?.map((e) => e.name) ?? null
}

/** The names and the unpacked sizes of the files of a zip, from the central directory; null when it cannot be read. */
export async function zipEntries(file: Blob): Promise<ZipEntry[] | null> {
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
    const names: ZipEntry[] = []
    let p = 0
    for (let n = 0; n < count; n++) {
      if (p + 46 > cd.byteLength || cd.getUint32(p, true) !== CEN_SIG) return null
      const nameLen = cd.getUint16(p + 28, true)
      const extraLen = cd.getUint16(p + 30, true)
      const commentLen = cd.getUint16(p + 32, true)
      names.push({ name: dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen)), size: cd.getUint32(p + 24, true) })
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

// ------------------------------------------------------------------------------------------------ the report of a zip

/** What the page refuses before uploading (the file cannot become a site) and what it only points out. */
export type ZipProblem = 'type' | 'empty' | 'noindex' | 'unsafe' | 'zipbig' | 'unpackedbig'
export type ZipWarning = 'junk' | 'nested' | 'bigfile'

/** Sanity limits of the page; the server and the quota of the tenant decide the real ones. */
export const LIMITS = { zip: 200 * 1024 * 1024, unpacked: 1024 * 1024 * 1024, file: 50 * 1024 * 1024 }

export interface ZipReport {
  files: number
  /** bytes once unpacked */
  bytes: number
  /** the page the site opens on (the least nested index.html), or null */
  entry: string | null
  problems: ZipProblem[]
  warnings: ZipWarning[]
  /** the biggest first-level folders and files, for the list under the drop zone */
  top: { name: string; folder: boolean; files: number; bytes: number }[]
}

const norm = (p: string) => p.replace(/\\/g, '/')
const isJunk = (p: string) => /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)(\/|$)/i.test(p)

/** Whether a file looks like a zip by its name or its type (browsers give an empty or generic type for many zips). */
export function looksLikeZip(name: string, mime: string): boolean {
  return /\.zip$/i.test(name) && (!mime || /zip|octet-stream/i.test(mime))
}

/**
 * What a zip would do as a site: files and bytes, the entry page, and why it cannot (no index.html, paths that leave the
 * folder, too big) or what looks odd (system junk, the index in a folder, one huge file). `entries` null means the
 * directory could not be read (zip64, damaged): then only the size and the type are judged and the server decides the rest.
 */
export function inspectZip(entries: ZipEntry[] | null, file: { name: string; size: number; type?: string }, limits = LIMITS): ZipReport {
  const problems: ZipProblem[] = []
  const warnings: ZipWarning[] = []
  if (!looksLikeZip(file.name, file.type ?? '')) problems.push('type')
  if (file.size > limits.zip) problems.push('zipbig')
  const report: ZipReport = { files: 0, bytes: 0, entry: null, problems, warnings, top: [] }
  if (!entries) return report
  const real = entries.filter((e) => !e.name.endsWith('/') && !isJunk(norm(e.name)))
  if (entries.some((e) => /(^|\/)\.\.(\/|$)/.test(norm(e.name)) || norm(e.name).startsWith('/') || /^[a-zA-Z]:/.test(e.name))) problems.push('unsafe')
  if (entries.some((e) => isJunk(norm(e.name)) && !e.name.endsWith('/'))) warnings.push('junk')
  if (!real.length) {
    problems.push('empty')
    return report
  }
  report.files = real.length
  report.bytes = real.reduce((n, e) => n + e.size, 0)
  if (report.bytes > limits.unpacked) problems.push('unpackedbig')
  if (real.some((e) => e.size > limits.file)) warnings.push('bigfile')
  const indexes = real.map((e) => norm(e.name)).filter((n) => (n.split('/').pop() ?? '').toLowerCase() === 'index.html')
  if (!indexes.length) problems.push('noindex')
  else {
    indexes.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
    report.entry = indexes[0]!
    if (report.entry.includes('/')) warnings.push('nested')
  }
  const groups = new Map<string, { folder: boolean; files: number; bytes: number }>()
  // a zip made of one folder (`site/…`) is listed by what is inside that folder
  const roots = new Set(real.map((e) => norm(e.name).split('/')[0]))
  const single = roots.size === 1 && real.every((e) => norm(e.name).includes('/'))
  for (const e of real) {
    const parts = norm(e.name).split('/').slice(single ? 1 : 0)
    const key = parts[0]!
    const g = groups.get(key) ?? { folder: parts.length > 1, files: 0, bytes: 0 }
    g.files++
    g.bytes += e.size
    groups.set(key, g)
  }
  report.top = [...groups.entries()]
    .map(([name, g]) => ({ name, ...g }))
    .sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name))
    .slice(0, 6)
  return report
}
