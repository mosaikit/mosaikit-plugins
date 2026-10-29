// The tags of a note: a JSON list of names in the field `tags`. The same name written in another case is the same tag.

export const MAX_TAG = 40

/** A name as the person typed it: spaces trimmed and collapsed, not too long. */
export const cleanName = (s: string): string => s.replace(/\s+/g, ' ').trim().slice(0, MAX_TAG)

export const sameTag = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

/** The names in the value of the field (anything that is not a list of texts gives none), without repeats. */
export function parseTags(v: unknown): string[] {
  if (typeof v !== 'string' || !v.trim().startsWith('[')) return []
  try {
    const raw: unknown = JSON.parse(v)
    return Array.isArray(raw) ? withoutRepeats(raw.filter((x): x is string => typeof x === 'string').map(cleanName)) : []
  } catch {
    return []
  }
}

export function withoutRepeats(names: string[]): string[] {
  const out: string[] = []
  for (const n of names) if (n && !out.some((o) => sameTag(o, n))) out.push(n)
  return out
}

/** The values to save for a list of tags: the list, and the first one in the field `tag`. */
export const tagValues = (tags: string[]): { tags: string; tag: string | null } => ({ tags: JSON.stringify(tags), tag: tags[0] ?? null })

export const hasTag = (tags: string[], name: string): boolean => tags.some((t) => sameTag(t, name))
export const removeTag = (tags: string[], name: string): string[] => tags.filter((t) => !sameTag(t, name))
export const renameTag = (tags: string[], from: string, to: string): string[] => withoutRepeats(tags.map((t) => (sameTag(t, from) ? to : t)))
