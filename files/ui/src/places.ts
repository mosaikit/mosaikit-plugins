// The virtual folders of Files: Recent, Favourites and Shared with me. Pure functions, no DOM; the page gives them the
// listing function of the bridge.
import type { FileEntry } from '@mosaikit/plugin-api'

export type Place = 'files' | 'recent' | 'favourites' | 'shared'

/** The files the person was not the owner of, at the top level (what others share with them). */
export function sharedWithMe(entries: FileEntry[], me: string | undefined): FileEntry[] {
  return me ? entries.filter((e) => e.owner_id !== me) : []
}

/** The newest files first (folders are left out), at most `n`. */
export function newest(entries: FileEntry[], n: number): FileEntry[] {
  return entries
    .filter((e) => !e.is_dir)
    .sort((a, b) => b.modified.localeCompare(a.modified) || a.name.localeCompare(b.name))
    .slice(0, n)
}

export interface WalkOptions {
  /** folders listed at most (the walk stops there; 40) */
  maxFolders?: number
  /** folders listed at the same time (4) */
  concurrency?: number
  /** a folder that fails to list is skipped */
  onSkip?: (id: string | null) => void
}

/**
 * Lists the folders breadth first from the top (the nearest ones first, where the work usually is) and returns every entry
 * found, plus how many folders were listed and whether the walk stopped before the end.
 */
export async function walk(
  list: (parent: string | null) => Promise<{ entries: FileEntry[] }>,
  opts: WalkOptions = {},
): Promise<{ entries: FileEntry[]; folders: number; complete: boolean }> {
  const max = opts.maxFolders ?? 40
  const width = Math.max(1, opts.concurrency ?? 4)
  const queue: (string | null)[] = [null]
  const out: FileEntry[] = []
  let folders = 0
  while (queue.length && folders < max) {
    const batch = queue.splice(0, Math.min(width, max - folders))
    folders += batch.length
    const got = await Promise.all(
      batch.map((id) =>
        list(id).catch(() => {
          opts.onSkip?.(id)
          return { entries: [] as FileEntry[] }
        }),
      ),
    )
    for (const l of got) {
      for (const e of l.entries) {
        out.push(e)
        if (e.is_dir) queue.push(e.id)
      }
    }
  }
  return { entries: out, folders, complete: queue.length === 0 }
}

// ---------------------------------------------------------------------------------------------------------- favourites

/** A favourite as it is kept: the entry as it was seen, so the view shows at once and is then checked against the folder. */
export type Fav = Pick<FileEntry, 'id' | 'name' | 'is_dir' | 'size' | 'mime' | 'created' | 'modified' | 'owner_id' | 'owner_name' | 'my_level' | 'shared' | 'parent_id'>

const FAV_FIELDS: (keyof Fav)[] = ['id', 'name', 'is_dir', 'size', 'mime', 'created', 'modified', 'owner_id', 'owner_name', 'my_level', 'shared', 'parent_id']

export const asFav = (e: FileEntry): Fav => Object.fromEntries(FAV_FIELDS.map((k) => [k, e[k]])) as unknown as Fav

/** The favourites from the stored text (anything that is not a list of entries with an id and a name is no favourites); at most 500. */
export function parseFavs(raw: string | null): Fav[] {
  if (!raw) return []
  try {
    const v: unknown = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    const seen = new Set<string>()
    const out: Fav[] = []
    for (const x of v) {
      const f = x as Partial<Fav> | null
      if (!f || typeof f.id !== 'string' || typeof f.name !== 'string' || seen.has(f.id)) continue
      seen.add(f.id)
      out.push({
        id: f.id,
        name: f.name,
        is_dir: f.is_dir === true,
        size: typeof f.size === 'number' ? f.size : 0,
        mime: typeof f.mime === 'string' ? f.mime : '',
        created: typeof f.created === 'string' ? f.created : '',
        modified: typeof f.modified === 'string' ? f.modified : '',
        owner_id: typeof f.owner_id === 'string' ? f.owner_id : '',
        owner_name: typeof f.owner_name === 'string' ? f.owner_name : '',
        my_level: f.my_level === 'write' || f.my_level === 'manage' ? f.my_level : 'read',
        shared: f.shared === true,
        parent_id: typeof f.parent_id === 'string' ? f.parent_id : null,
      })
    }
    return out.slice(0, 500)
  } catch {
    return []
  }
}

/** Adds the entries that are not favourites yet, or removes them all when every one of them is already a favourite. */
export function toggleFavs(favs: Fav[], items: FileEntry[]): { favs: Fav[]; added: boolean } {
  const ids = new Set(favs.map((f) => f.id))
  const allIn = items.length > 0 && items.every((e) => ids.has(e.id))
  if (allIn) {
    const drop = new Set(items.map((e) => e.id))
    return { favs: favs.filter((f) => !drop.has(f.id)), added: false }
  }
  return { favs: [...favs, ...items.filter((e) => !ids.has(e.id)).map(asFav)].slice(0, 500), added: true }
}

/**
 * Checks the favourites against the folders they sit in: the listing of each parent (the callback) gives the live entry or
 * shows the favourite is gone. Entries of a parent that could not be listed are kept as they were seen.
 */
export async function refreshFavs(favs: Fav[], list: (parent: string | null) => Promise<{ entries: FileEntry[] }>, maxParents = 12): Promise<Fav[]> {
  const parents = [...new Set(favs.map((f) => f.parent_id))].slice(0, maxParents)
  const live = new Map<string | null, Map<string, FileEntry>>()
  await Promise.all(
    parents.map(async (p) => {
      try {
        live.set(p, new Map((await list(p)).entries.map((e) => [e.id, e])))
      } catch {
        // a folder that is not available any more: the favourites in it stay as they were seen
      }
    }),
  )
  return favs.flatMap((f) => {
    const m = live.get(f.parent_id)
    if (!m) return [f]
    const e = m.get(f.id)
    return e ? [asFav(e)] : []
  })
}

/** How many columns of at least `min` px fit in `width` with `gap` between them (1 at least). */
export function columnsFor(width: number, min: number, gap: number): number {
  return Math.max(1, Math.floor((width + gap) / (min + gap)))
}
