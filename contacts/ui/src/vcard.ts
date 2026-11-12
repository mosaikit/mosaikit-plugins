// vCard 3.0 import and export of contacts, and CSV export and import. Pure functions, no DOM.

export interface Person {
  name: string
  org?: string
  job_title?: string
  email?: string
  email2?: string
  phone?: string
  phone2?: string
  address?: string
  birthday?: string
  notes?: string
  tags?: string
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
/** Splits at the `;` that are not escaped with a backslash. */
const parts = (s: string) => s.split(/(?<!\\);/)
const unesc = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')

/** One vCard per person, joined with CRLF as the format asks. */
export function toVcf(people: Person[]): string {
  return people
    .map((p) => {
      const words = p.name.trim().split(/\s+/)
      const family = words.length > 1 ? words[words.length - 1]! : ''
      const given = words.length > 1 ? words.slice(0, -1).join(' ') : words[0] ?? ''
      const l = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${esc(p.name)}`, `N:${esc(family)};${esc(given)};;;`]
      if (p.org) l.push(`ORG:${esc(p.org)}`)
      if (p.job_title) l.push(`TITLE:${esc(p.job_title)}`)
      if (p.email) l.push(`EMAIL;TYPE=INTERNET:${esc(p.email)}`)
      if (p.email2) l.push(`EMAIL;TYPE=INTERNET:${esc(p.email2)}`)
      if (p.phone) l.push(`TEL:${esc(p.phone)}`)
      if (p.phone2) l.push(`TEL:${esc(p.phone2)}`)
      if (p.address) l.push(`ADR;TYPE=WORK:;;${esc(p.address.replace(/\n/g, ', '))};;;;`)
      if (p.birthday) l.push(`BDAY:${p.birthday}`)
      if (p.notes) l.push(`NOTE:${esc(p.notes)}`)
      if (p.tags) l.push(`CATEGORIES:${p.tags.split(',').map((t) => esc(t.trim())).filter(Boolean).join(',')}`)
      l.push('END:VCARD')
      return l.join('\r\n')
    })
    .join('\r\n') + '\r\n'
}

/** The people of a vCard file (2.1, 3.0 and 4.0 as far as this plugin keeps them); a card without a name is skipped. */
export function parseVcf(text: string): Person[] {
  const unfolded = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '')
  const people: Person[] = []
  let cur: (Person & { n?: string }) | null = null
  for (const raw of unfolded.split('\n')) {
    const line = raw.trim()
    if (/^BEGIN:VCARD$/i.test(line)) cur = { name: '' }
    else if (/^END:VCARD$/i.test(line)) {
      if (cur) {
        const name = cur.name || (cur.n ?? '').trim()
        if (name) {
          const { n: _n, ...rest } = cur
          people.push({ ...rest, name })
        }
      }
      cur = null
    } else if (cur) {
      const i = line.indexOf(':')
      if (i < 0) continue
      const key = line.slice(0, i).split(';')[0]!.toUpperCase().replace(/^ITEM\d+\./, '')
      const val = line.slice(i + 1)
      switch (key) {
        case 'FN': cur.name = unesc(val); break
        case 'N': {
          const [family = '', given = ''] = parts(val).map(unesc)
          cur.n = `${given} ${family}`.trim()
          break
        }
        case 'ORG': cur.org = unesc(parts(val)[0]!); break
        case 'TITLE': cur.job_title = unesc(val); break
        case 'EMAIL': if (!cur.email) cur.email = unesc(val); else if (!cur.email2) cur.email2 = unesc(val); break
        case 'TEL': if (!cur.phone) cur.phone = unesc(val); else if (!cur.phone2) cur.phone2 = unesc(val); break
        case 'ADR': cur.address = parts(val).slice(0, 7).map(unesc).filter(Boolean).join(', '); break
        case 'BDAY': {
          const d = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(val)
          if (d) cur.birthday = `${d[1]}-${d[2]}-${d[3]}`
          break
        }
        case 'NOTE': cur.notes = unesc(val); break
        case 'CATEGORIES': cur.tags = val.split(',').map((t) => unesc(t).trim()).filter(Boolean).join(','); break
      }
    }
  }
  return people
}

// ----------------------------------------------------------------------------------------------------------------- CSV

export const CSV_COLUMNS = ['name', 'org', 'job_title', 'email', 'email2', 'phone', 'phone2', 'address', 'birthday', 'tags', 'notes'] as const

const cell = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

/** A CSV with a header row (the keys of `Person`); text that starts with = + - @ gets a quote in front so a spreadsheet does not run it. */
export function toCsv(people: Person[]): string {
  const safe = (s: string) => (/^[=+\-@\t\r]/.test(s) && !/^\+?[\d\s()-]+$/.test(s) ? `'${s}` : s)
  const rows = people.map((p) => CSV_COLUMNS.map((k) => cell(safe(String(p[k] ?? '')))).join(','))
  return [CSV_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n'
}

/** The rows of a CSV text (quotes, doubled quotes and line breaks inside quotes; `,` or `;` as separator). */
export function parseCsvRows(text: string): string[][] {
  const t = text.replace(/^\uFEFF/, '')
  const sep = (t.split('\n', 1)[0]!.match(/;/g)?.length ?? 0) > (t.split('\n', 1)[0]!.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!
    if (q) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          cur += '"'
          i++
        } else q = false
      } else cur += c
    } else if (c === '"') q = true
    else if (c === sep) {
      row.push(cur)
      cur = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      row.push(cur)
      cur = ''
      if (row.some((x) => x.trim())) rows.push(row)
      row = []
    } else cur += c
  }
  row.push(cur)
  if (row.some((x) => x.trim())) rows.push(row)
  return rows
}

const ALIASES: Record<string, keyof Person> = {
  name: 'name', 'full name': 'name', fullname: 'name', fn: 'name', nome: 'name', nombre: 'name',
  org: 'org', organization: 'org', organisation: 'org', 'company name': 'org', azienda: 'org', organizzazione: 'org', empresa: 'org',
  job_title: 'job_title', title: 'job_title', 'job title': 'job_title', ruolo: 'job_title', cargo: 'job_title',
  email: 'email', 'e-mail': 'email', mail: 'email', email2: 'email2', 'email 2': 'email2',
  phone: 'phone', tel: 'phone', telephone: 'phone', telefono: 'phone', mobile: 'phone', phone2: 'phone2', 'phone 2': 'phone2',
  address: 'address', indirizzo: 'address', 'dirección': 'address', direccion: 'address',
  birthday: 'birthday', bday: 'birthday', compleanno: 'birthday', cumpleaños: 'birthday',
  tags: 'tags', categories: 'tags', etichette: 'tags', etiquetas: 'tags',
  notes: 'notes', note: 'notes', notas: 'notes',
}

/** The people of a CSV with a header row; columns it does not know are ignored, rows without a name are skipped. */
export function parseCsv(text: string): Person[] {
  const rows = parseCsvRows(text)
  if (rows.length < 2) return []
  const map = rows[0]!.map((h) => ALIASES[h.trim().toLowerCase()])
  const out: Person[] = []
  for (const r of rows.slice(1)) {
    const p: Person = { name: '' }
    r.forEach((v, i) => {
      const k = map[i]
      if (k && v.trim()) p[k] = v.replace(/^'(?=[=+\-@\t\r])/, '').trim()
    })
    if (p.name) out.push(p)
  }
  return out
}
