import { describe, expect, it } from 'vitest'
import { byName, daysToBirthday, duplicates, groupByLetter, letterOf, splitTags } from './logic.ts'
import { parseCsv, parseCsvRows, parseVcf, toCsv, toVcf } from './vcard.ts'

const e = (id: string, name: string, extra: Partial<Parameters<typeof duplicates>[0][number]> = {}) => ({ id, name, email: '', email2: '', phone: '', phone2: '', org: '', ...extra })

describe('order and groups', () => {
  it('files a name under its letter, without accents', () => {
    expect(letterOf('Émile')).toBe('E')
    expect(letterOf('  ada')).toBe('A')
    expect(letterOf('42 Club')).toBe('#')
    expect(letterOf('')).toBe('#')
  })
  it('sorts and groups, # last', () => {
    expect(byName([{ name: 'b' }, { name: 'À' }, { name: 'a' }]).map((x) => x.name)).toEqual(['À', 'a', 'b'])
    expect(groupByLetter([{ name: '1x' }, { name: 'Bob' }, { name: 'Ann' }, { name: 'Alf' }]).map(([l, g]) => [l, g.length])).toEqual([['A', 2], ['B', 1], ['#', 1]])
  })
  it('tags', () => expect(splitTags(' a, b ,A,,c')).toEqual(['a', 'b', 'c']))
})

describe('birthdays', () => {
  const today = new Date(2026, 10, 11)
  it('counts the days to the next one', () => {
    expect(daysToBirthday('1990-11-11', today)).toBe(0)
    expect(daysToBirthday('1990-11-12', today)).toBe(1)
    expect(daysToBirthday('1990-11-10', today)).toBe(364)
    expect(daysToBirthday('2000-02-29', today)).toBe(109)
  })
  it('refuses what is not a date', () => {
    expect(daysToBirthday('', today)).toBeNull()
    expect(daysToBirthday('1990-13-01', today)).toBeNull()
  })
})

describe('duplicates', () => {
  it('joins by email, phone and name, also through a chain', () => {
    const g = duplicates([
      e('1', 'Ann Lee', { email: 'ann@x.org' }),
      e('2', 'A. Lee', { email: 'ANN@x.org', phone: '+39 333 1234567' }),
      e('3', 'Annie', { phone2: '0039333-1234567' }),
      e('4', 'Zed'),
      e('5', 'zed '),
      e('6', 'Solo', { phone: '123' }),
      e('7', 'Other', { phone: '123' }),
    ])
    expect(g.map((x) => x.map((p) => p.id).sort())).toEqual([['1', '2'], ['4', '5']])
  })
})

describe('vCard', () => {
  const p = { name: 'Ada King Lovelace', org: 'Analytical; Co', job_title: 'Countess', email: 'ada@x.org', email2: 'a@y.org', phone: '+441', address: '1 Rd\nLondon', birthday: '1815-12-10', notes: 'a, b\nline', tags: 'math,vip' }
  it('round trips', () => {
    const back = parseVcf(toVcf([p, { name: 'Bob' }]))
    expect(back).toHaveLength(2)
    expect(back[0]).toMatchObject({ name: 'Ada King Lovelace', org: 'Analytical; Co', job_title: 'Countess', email: 'ada@x.org', email2: 'a@y.org', phone: '+441', birthday: '1815-12-10', notes: 'a, b\nline', tags: 'math,vip' })
    expect(back[0]!.address).toBe('1 Rd, London')
  })
  it('reads folded lines, other versions and a name only in N', () => {
    const t = 'BEGIN:VCARD\r\nVERSION:2.1\r\nN:Rossi;Mario;;;\r\nTEL;CELL:333\r\nEMAIL;PREF:m@r.it\r\nNOTE:one\r\n two\r\nBDAY:19800102\r\nEND:VCARD\r\nBEGIN:VCARD\r\nEND:VCARD'
    const [m, ...rest] = parseVcf(t)
    expect(rest).toHaveLength(0)
    expect(m).toMatchObject({ name: 'Mario Rossi', phone: '333', email: 'm@r.it', notes: 'onetwo', birthday: '1980-01-02' })
  })
})

describe('CSV', () => {
  it('round trips with quotes and line breaks', () => {
    const people = [{ name: 'A, B', notes: 'say "hi"\nbye', email: 'a@b.c' }, { name: 'C' }]
    expect(parseCsv(toCsv(people))).toEqual([{ name: 'A, B', notes: 'say "hi"\nbye', email: 'a@b.c' }, { name: 'C' }])
  })
  it('knows common headers, semicolons and skips rows without a name', () => {
    expect(parseCsv('Full Name;E-mail;Telefono\nAnn;a@b.c;333\n;x;y\n')).toEqual([{ name: 'Ann', email: 'a@b.c', phone: '333' }])
    expect(parseCsvRows('a,b\n"x\ny",z')).toEqual([['a', 'b'], ['x\ny', 'z']])
  })
  it('does not let a spreadsheet run a formula, and gives the text back', () => {
    const csv = toCsv([{ name: '=HYPERLINK("x")', phone: '+39 333' }])
    expect(csv).toContain("'=HYPERLINK")
    expect(csv).toContain('+39 333')
    expect(parseCsv(csv)[0]).toMatchObject({ name: '=HYPERLINK("x")', phone: '+39 333' })
  })
})
