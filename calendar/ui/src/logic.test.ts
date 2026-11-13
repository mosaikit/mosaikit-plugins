import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  addPerson,
  arrowTarget,
  chipText,
  daysBetween,
  endAfter,
  fixEnd,
  icsCalendar,
  icsEscape,
  icsEvent,
  convertOcc,
  instantToWall,
  validZone,
  wallToInstant,
  zoneNames,
  icsFold,
  icsName,
  isDate,
  isTime,
  layoutDay,
  monthGrid,
  parsePeople,
  peopleJson,
  periodTitle,
  rangeFor,
  removePerson,
  shift,
  spread,
  startOfWeek,
  timeRange,
  viewKey,
  weekdayIndex,
  weekdayNames,
  type IcsEvent,
  type Occ,
} from './logic.ts'

const occ = (o: Partial<Occ>): Occ => ({
  id: 'e1', title: 'Standup', location: '', start: '2026-11-12', end: '2026-11-12', starts_time: '09:30', ends_time: '10:00', all_day: false,
  repeat: 'none', color: 'blue', invitees: 0, invited: false, yes: 0, no: 0, maybe: 0, mine: '', ...o,
})

describe('dates and grids', () => {
  it('validates dates and times', () => {
    expect(isDate('2026-11-12')).toBe(true)
    expect(isDate('2026-02-30')).toBe(false)
    expect(isDate('12/11/2026')).toBe(false)
    expect(isTime('23:59')).toBe(true)
    expect(isTime('24:00')).toBe(false)
    expect(isTime('9:30')).toBe(false)
  })

  it('adds days and months, a 31st falls on the last day of a shorter month', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15')
    expect(daysBetween('2026-11-12', '2026-11-19')).toBe(7)
  })

  it('starts the week on Monday', () => {
    // 2026-11-12 is a Thursday
    expect(weekdayIndex('2026-11-12')).toBe(3)
    expect(weekdayIndex('2026-11-15')).toBe(6)
    expect(startOfWeek('2026-11-12')).toBe('2026-11-09')
    expect(startOfWeek('2026-11-15')).toBe('2026-11-09')
    expect(startOfWeek('2026-11-09')).toBe('2026-11-09')
  })

  it('draws six weeks for a month', () => {
    const g = monthGrid('2026-11-12')
    expect(g).toHaveLength(42)
    // 1 November 2026 is a Sunday: the grid begins on Monday 26 October
    expect(g[0]).toBe('2026-10-26')
    expect(g[41]).toBe('2026-12-06')
    expect(monthGrid('2026-06-30')[0]).toBe('2026-06-01')
  })

  it('knows the range of each view and how to step', () => {
    expect(rangeFor('week', '2026-11-12')).toEqual({ from: '2026-11-09', to: '2026-11-15' })
    expect(rangeFor('day', '2026-11-12')).toEqual({ from: '2026-11-12', to: '2026-11-12' })
    expect(rangeFor('month', '2026-11-12')).toEqual({ from: '2026-10-26', to: '2026-12-06' })
    expect(shift('week', '2026-11-12', 1)).toBe('2026-11-19')
    expect(shift('day', '2026-11-12', -1)).toBe('2026-11-11')
    expect(shift('month', '2026-11-12', 1)).toBe('2026-12-12')
  })

  it('names the weekdays and the period with Intl', () => {
    expect(weekdayNames('en')[0]).toBe('Mon')
    expect(weekdayNames('it')[6].toLowerCase()).toBe('dom')
    expect(weekdayNames('es', 'long')[0].toLowerCase()).toBe('lunes')
    expect(periodTitle('month', '2026-11-12', 'en')).toBe('November 2026')
    expect(periodTitle('day', '2026-11-12', 'en')).toContain('November')
    expect(periodTitle('week', '2026-11-12', 'en')).toMatch(/Nov.*9.*15.*2026/)
    expect(periodTitle('week', '2026-12-30', 'en')).toContain('2027')
  })

  it('maps the keys', () => {
    expect(arrowTarget('2026-11-12', 'ArrowRight')).toBe('2026-11-13')
    expect(arrowTarget('2026-11-12', 'ArrowUp')).toBe('2026-11-05')
    expect(arrowTarget('2026-11-12', 'a')).toBeNull()
    expect(viewKey('m')).toBe('month')
    expect(viewKey('W')).toBe('week')
    expect(viewKey('d')).toBe('day')
    expect(viewKey('x')).toBeNull()
  })
})

describe('occurrences in days', () => {
  it('puts an event on each day it covers', () => {
    const m = spread([occ({ start: '2026-11-10', end: '2026-11-12', all_day: true })], '2026-11-09', '2026-11-13')
    expect([...m.entries()].filter(([, v]) => v.length).map(([d]) => d)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12'])
    expect(m.get('2026-11-10')![0].first).toBe(true)
    expect(m.get('2026-11-12')![0].last).toBe(true)
    expect(m.get('2026-11-11')![0].startMin).toBeNull()
  })

  it('cuts an event that started before the range', () => {
    const m = spread([occ({ start: '2026-11-01', end: '2026-11-20', all_day: true })], '2026-11-09', '2026-11-10')
    expect(m.get('2026-11-09')).toHaveLength(1)
    expect(m.get('2026-11-09')![0].first).toBe(false)
  })

  it('gives a timed event its minutes and sorts the day', () => {
    const m = spread(
      [occ({ id: 'b', title: 'B', starts_time: '14:00', ends_time: '15:00' }), occ({ id: 'a', title: 'A', starts_time: '09:00', ends_time: '' }), occ({ id: 'c', title: 'C', all_day: true, starts_time: '' })],
      '2026-11-12',
      '2026-11-12',
    )
    const day = m.get('2026-11-12')!
    expect(day.map((s) => s.occ.title)).toEqual(['C', 'A', 'B'])
    expect(day[1].startMin).toBe(540)
    // no end time: an hour
    expect(day[1].endMin).toBe(600)
    expect(day[0].startMin).toBeNull()
  })

  it('writes the chip and the time range', () => {
    expect(chipText(occ({}))).toBe('09:30 Standup')
    expect(chipText(occ({ all_day: true }))).toBe('Standup')
    expect(chipText(occ({ start: '2026-11-12', end: '2026-11-14' }), '2026-11-13')).toBe('Standup')
    expect(timeRange(occ({}))).toBe('09:30–10:00')
    expect(timeRange(occ({ ends_time: '' }))).toBe('09:30')
    expect(timeRange(occ({ all_day: true }))).toBe('')
  })
})

describe('layout of a day', () => {
  const ev = (startMin: number, endMin: number) => ({ startMin, endMin })

  it('leaves events that do not overlap in one column', () => {
    const l = layoutDay([ev(60, 120), ev(120, 180)])
    expect(l.map((p) => [p.col, p.cols])).toEqual([[0, 1], [0, 1]])
  })

  it('puts overlapping events side by side', () => {
    const l = layoutDay([ev(60, 180), ev(90, 150), ev(100, 130)])
    expect(l.map((p) => p.col)).toEqual([0, 1, 2])
    expect(l.every((p) => p.cols === 3)).toBe(true)
  })

  it('reuses a column when an event is over, in the same group', () => {
    const l = layoutDay([ev(60, 120), ev(90, 200), ev(130, 190)])
    // the third starts after the first ended: it takes column 0 again; two columns for the group
    expect(l.map((p) => p.col)).toEqual([0, 1, 0])
    expect(l.every((p) => p.cols === 2)).toBe(true)
  })

  it('keeps the groups apart', () => {
    const l = layoutDay([ev(0, 60), ev(30, 90), ev(300, 360)])
    expect(l.map((p) => p.cols)).toEqual([2, 2, 1])
  })
})

describe('the form helpers', () => {
  it('ends an hour after the start, never past the day', () => {
    expect(endAfter('09:30')).toBe('10:30')
    expect(endAfter('23:30')).toBe('23:59')
    expect(endAfter('')).toBe('')
  })

  it('keeps the end from falling before the start', () => {
    expect(fixEnd({ starts_on: '2026-11-12', starts_time: '10:00', ends_on: '2026-11-11', ends_time: '', all_day: false }).ends_on).toBe('2026-11-12')
    expect(fixEnd({ starts_on: '2026-11-12', starts_time: '10:00', ends_on: '2026-11-12', ends_time: '09:00', all_day: false }).ends_time).toBe('11:00')
    expect(fixEnd({ starts_on: '2026-11-12', starts_time: '22:00', ends_on: '2026-11-13', ends_time: '02:00', all_day: false }).ends_time).toBe('02:00')
    expect(fixEnd({ starts_on: '2026-11-12', starts_time: '', ends_on: '', ends_time: '', all_day: true }).ends_on).toBe('2026-11-12')
  })

  it('manages the invitees', () => {
    const a = { id: 'a', name: 'Ann' }
    let l = addPerson([], a)
    l = addPerson(l, a)
    expect(l).toHaveLength(1)
    expect(removePerson(l, 'a')).toEqual([])
    expect(JSON.parse(peopleJson([{ ...a, extra: 1 } as never]))).toEqual([a])
    expect(parsePeople('[{"id":"a","name":"Ann"},{"x":1}]')).toEqual([a])
    expect(parsePeople('nope')).toEqual([])
    const many = Array.from({ length: 60 }, (_, i) => ({ id: String(i), name: 'x' }))
    expect(many.reduce(addPerson, [] as { id: string; name: string }[])).toHaveLength(50)
  })
})

describe('.ics', () => {
  const base: IcsEvent = {
    id: 'abc', title: 'Team, lunch; plan', details: 'Line one\nLine two \\ end', location: 'Room 4, floor 2', starts_on: '2026-11-12', starts_time: '12:30',
    ends_on: '2026-11-12', ends_time: '13:45', all_day: false, repeat: 'none', repeat_until: '',
  }
  const stamp = '20261101T080000Z'

  it('escapes the text values', () => {
    expect(icsEscape('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne')
  })

  it('writes a timed event with floating times', () => {
    const l = icsEvent(base, stamp)
    expect(l).toContain('BEGIN:VEVENT')
    expect(l).toContain('UID:abc@mosaikit-calendar')
    expect(l).toContain('DTSTAMP:20261101T080000Z')
    expect(l).toContain('DTSTART:20261112T123000')
    expect(l).toContain('DTEND:20261112T134500')
    expect(l).toContain('SUMMARY:Team\\, lunch\\; plan')
    expect(l).toContain('LOCATION:Room 4\\, floor 2')
    expect(l).toContain('DESCRIPTION:Line one\\nLine two \\\\ end')
    expect(l.some((x) => x.startsWith('RRULE'))).toBe(false)
    expect(l[l.length - 1]).toBe('END:VEVENT')
  })

  it('writes an all-day event with VALUE=DATE and an exclusive end', () => {
    const l = icsEvent({ ...base, all_day: true, starts_time: '', ends_time: '', ends_on: '2026-11-14' }, stamp)
    expect(l).toContain('DTSTART;VALUE=DATE:20261112')
    expect(l).toContain('DTEND;VALUE=DATE:20261115')
    const one = icsEvent({ ...base, all_day: true, starts_time: '', ends_time: '', ends_on: '' }, stamp)
    expect(one).toContain('DTEND;VALUE=DATE:20261113')
  })

  it('has no end time: one hour', () => {
    expect(icsEvent({ ...base, ends_time: '' }, stamp)).toContain('DTEND:20261112T133000')
  })

  it('writes the recurrence', () => {
    expect(icsEvent({ ...base, repeat: 'weekly' }, stamp)).toContain('RRULE:FREQ=WEEKLY')
    expect(icsEvent({ ...base, repeat: 'monthly', repeat_until: '2027-01-31' }, stamp)).toContain('RRULE:FREQ=MONTHLY;UNTIL=20270131T235959')
    expect(icsEvent({ ...base, all_day: true, starts_time: '', repeat: 'yearly', repeat_until: '2030-01-01' }, stamp)).toContain('RRULE:FREQ=YEARLY;UNTIL=20300101')
  })

  it('folds long lines at 75 octets without splitting a character', () => {
    expect(icsFold('short')).toEqual(['short'])
    const long = 'DESCRIPTION:' + 'é'.repeat(100)
    const parts = icsFold(long)
    expect(parts.length).toBeGreaterThan(2)
    for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75)
    for (const p of parts.slice(1)) expect(p.startsWith(' ')).toBe(true)
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(long)
  })

  it('makes a calendar with CRLF line ends', () => {
    const text = icsCalendar([base], stamp)
    expect(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(text.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n')).toBe(true)
    expect(text.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('names the file safely', () => {
    expect(icsName('Team lunch / plan!')).toBe('Team-lunch-plan.ics')
    expect(icsName('???')).toBe('event.ics')
  })
})

describe('.ics: zones, exceptions and invited', () => {
  const base: IcsEvent = {
    id: 'abc', title: 'Standup', details: '', location: '', starts_on: '2026-11-02', starts_time: '09:30',
    ends_on: '2026-11-02', ends_time: '10:00', all_day: false, repeat: 'weekly', repeat_until: '', timezone: 'Europe/Rome',
  }
  const stamp = '20261101T080000Z'

  it('writes the times of an event with a zone with its TZID', () => {
    const l = icsEvent(base, stamp)
    expect(l).toContain('DTSTART;TZID=Europe/Rome:20261102T093000')
    expect(l).toContain('DTEND;TZID=Europe/Rome:20261102T100000')
  })

  it('writes the end of a series with a zone in UTC, as the format asks', () => {
    // 23:59:59 in Rome on 2026-12-31 (UTC+1) is 22:59:59 UTC
    expect(icsEvent({ ...base, repeat_until: '2026-12-31' }, stamp)).toContain('RRULE:FREQ=WEEKLY;UNTIL=20261231T225959Z')
  })

  it('keeps floating times for an event with no zone, and ignores a zone on an all-day event', () => {
    expect(icsEvent({ ...base, timezone: '' }, stamp)).toContain('DTSTART:20261102T093000')
    const day = icsEvent({ ...base, all_day: true, starts_time: '', ends_time: '', timezone: 'Europe/Rome' }, stamp)
    expect(day).toContain('DTSTART;VALUE=DATE:20261102')
    expect(day.join('\n')).not.toContain('TZID')
  })

  it('removes a deleted occurrence with an EXDATE and writes a changed one again with its RECURRENCE-ID', () => {
    const l = icsEvent(
      {
        ...base,
        exceptions: [
          { on: '2026-11-09', skipped: true, title: null, location: null, starts_time: null, ends_time: null },
          { on: '2026-11-16', skipped: false, title: 'Planning', location: 'Room 2', starts_time: '11:00', ends_time: null },
        ],
      },
      stamp,
    )
    expect(l).toContain('EXDATE;TZID=Europe/Rome:20261109T093000')
    // the changed one is not an EXDATE
    expect(l.filter((x) => x.startsWith('EXDATE'))).toHaveLength(1)
    const i = l.indexOf('RECURRENCE-ID;TZID=Europe/Rome:20261116T093000')
    expect(i).toBeGreaterThan(0)
    const second = l.slice(i - 3)
    expect(second[0]).toBe('BEGIN:VEVENT')
    expect(second).toContain('UID:abc@mosaikit-calendar')
    expect(second).toContain('DTSTART;TZID=Europe/Rome:20261116T110000')
    expect(second).toContain('DTEND;TZID=Europe/Rome:20261116T120000')
    expect(second).toContain('SUMMARY:Planning')
    expect(second).toContain('LOCATION:Room 2')
    expect(second.join('\n')).not.toContain('RRULE')
  })

  it('writes the exceptions of an all-day series with dates', () => {
    const l = icsEvent(
      { ...base, timezone: '', all_day: true, starts_time: '', ends_time: '', exceptions: [{ on: '2026-11-09', skipped: true, title: null, location: null, starts_time: null, ends_time: null }] },
      stamp,
    )
    expect(l).toContain('EXDATE;VALUE=DATE:20261109')
  })

  it('writes the invited as attendees with their answer', () => {
    const l = icsEvent(
      {
        ...base,
        repeat: 'none',
        attendees: [
          { id: 'u1', name: 'Ann "A" Rossi', answer: 'yes' },
          { id: 'u2', name: 'Bob', answer: 'no' },
          { id: 'u3', name: 'Cy', answer: 'maybe' },
          { id: 'u4', name: 'Di', answer: '' },
        ],
      },
      stamp,
    )
    expect(l).toContain('ATTENDEE;CN="Ann A Rossi";ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:urn:uuid:u1')
    expect(l).toContain('ATTENDEE;CN="Bob";ROLE=REQ-PARTICIPANT;PARTSTAT=DECLINED:urn:uuid:u2')
    expect(l).toContain('ATTENDEE;CN="Cy";ROLE=REQ-PARTICIPANT;PARTSTAT=TENTATIVE:urn:uuid:u3')
    expect(l).toContain('ATTENDEE;CN="Di";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:urn:uuid:u4')
  })
})

describe('time zones', () => {
  const occ = (o: Partial<Occ>): Occ => ({
    id: 'e', title: 'x', location: '', start: '2026-11-12', end: '2026-11-12', starts_time: '09:30', ends_time: '10:30', all_day: false, repeat: 'none',
    color: 'blue', invitees: 0, invited: false, yes: 0, no: 0, maybe: 0, mine: '', ...o,
  })

  it('knows the zones it can use', () => {
    expect(validZone('Europe/Rome')).toBe(true)
    expect(validZone('Mars/Olympus')).toBe(false)
    expect(validZone('')).toBe(false)
    expect(zoneNames()[0]).toBe('UTC')
  })

  it('turns a wall clock into an instant and back, across a daylight-saving change', () => {
    // Rome is UTC+1 in November and UTC+2 in July
    expect(new Date(wallToInstant('2026-11-12', '09:30', 'Europe/Rome')).toISOString()).toBe('2026-11-12T08:30:00.000Z')
    expect(new Date(wallToInstant('2026-07-12', '09:30', 'Europe/Rome')).toISOString()).toBe('2026-07-12T07:30:00.000Z')
    expect(instantToWall(Date.UTC(2026, 10, 12, 8, 30), 'Europe/Rome')).toEqual({ date: '2026-11-12', time: '09:30' })
    expect(instantToWall(Date.UTC(2026, 10, 12, 0, 5), 'Asia/Tokyo')).toEqual({ date: '2026-11-12', time: '09:05' })
  })

  it('shows an event of another zone at the hour of the viewer, the day too', () => {
    // 09:30-10:30 in Rome is 17:30-18:30 in Tokyo
    const t = convertOcc(occ({ timezone: 'Europe/Rome' }), 'Asia/Tokyo')
    expect([t.start, t.starts_time, t.end, t.ends_time]).toEqual(['2026-11-12', '17:30', '2026-11-12', '18:30'])
    expect(t.own).toEqual({ start: '2026-11-12', end: '2026-11-12', starts_time: '09:30', ends_time: '10:30' })
    // 23:00 in Rome is 07:00 the next day in Tokyo
    const n = convertOcc(occ({ timezone: 'Europe/Rome', starts_time: '23:00', ends_time: '23:30' }), 'Asia/Tokyo')
    expect([n.start, n.starts_time, n.end, n.ends_time]).toEqual(['2026-11-13', '07:00', '2026-11-13', '07:30'])
    // an event with no end time keeps none and keeps its length in days
    const open = convertOcc(occ({ timezone: 'Europe/Rome', ends_time: '', end: '2026-11-13' }), 'Asia/Tokyo')
    expect([open.start, open.end, open.ends_time]).toEqual(['2026-11-12', '2026-11-13', ''])
  })

  it('leaves alone what has no zone, all-day events, no time, the same zone and unknown zones', () => {
    const base = occ({})
    expect(convertOcc(base, 'Asia/Tokyo')).toBe(base)
    const day = occ({ timezone: 'Europe/Rome', all_day: true })
    expect(convertOcc(day, 'Asia/Tokyo')).toBe(day)
    const none = occ({ timezone: 'Europe/Rome', starts_time: '' })
    expect(convertOcc(none, 'Asia/Tokyo')).toBe(none)
    const same = occ({ timezone: 'Europe/Rome' })
    expect(convertOcc(same, 'Europe/Rome')).toBe(same)
    const odd = occ({ timezone: 'Mars/Olympus' })
    expect(convertOcc(odd, 'Asia/Tokyo')).toBe(odd)
  })
})
