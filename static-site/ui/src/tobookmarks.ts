// The sites made by web address (an older version) in the format Bookmarks imports (CSV; the columns are `CSV_HEADER` of
// the Bookmarks plugin). Pure functions, no DOM.

export const BOOKMARKS_HEADER = ['title', 'url', 'note', 'tags', 'favorite', 'open', 'thumbnail']

type Values = { values: Record<string, unknown> | null | undefined }
const str = (r: Values, k: string) => {
  const v = r.values?.[k]
  return v == null ? '' : String(v)
}

/** A site made by web address: its record has an address. */
export const hasAddress = (r: Values) => str(r, 'url') !== ''

/** Only an image the plugin wrote itself (a small `data:` image) is ever shown or exported. */
export const thumbnailOf = (r: Values) => {
  const v = str(r, 'thumbnail')
  return /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : ''
}

/** One row per site by address: name, address, description as the note, no tags, not a favourite, how it opened (in a frame
 *  unless the site forbade framing) and the thumbnail. Zip sites and sharing do not move. */
export function bookmarkRows(rows: Values[]): string[][] {
  return rows
    .filter(hasAddress)
    .map((r) => [str(r, 'name'), str(r, 'url'), str(r, 'description'), '', 'no', str(r, 'framable') === 'no' ? 'tab' : 'frame', thumbnailOf(r)])
}
