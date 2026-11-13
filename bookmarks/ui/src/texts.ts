import type { Msk } from '@mosaikit/plugin-api'
// The texts of the Bookmarks UI (English by default; Italian and Spanish follow the language of the host).
const en = {
  title: 'Bookmarks', newBookmark: '＋ New bookmark', search: 'Search bookmarks', searchPlaceholder: 'Search title, address, note, tags', tagsFilter: 'Filter by tag', favourites: 'Favourites',
  emptyTitle: 'No bookmarks yet', emptyText: 'Save the links your team comes back to, add a note and tags, and share them with the people who need them.',
  emptyFilter: 'No bookmark matches. Try other words or tags.', clearFilters: 'Clear filters',
  fTitle: 'Title', fUrl: 'Address', fNote: 'Note', fTags: 'Tags', fTagsHint: 'Type a tag and press Enter', fFavorite: 'Favourite', titleHint: 'Empty: the host name is used',
  open: 'Open', copy: 'Copy link', edit: 'Edit', share: 'Share…', remove: 'Delete', create: 'Save', save: 'Save', cancel: 'Cancel',
  newTitle: 'New bookmark', editTitle: 'Edit bookmark', removeConfirm: 'Delete the bookmark “{n}”?', removeTag: 'Remove tag',
  addFavorite: 'Add to favourites: {n}', removeFavorite: 'Remove from favourites: {n}', copied: 'Link copied', copyFailed: 'Could not copy the link',
  needUrl: 'Write an address', count: '{n} shown of {t}',
  failed: 'Could not start the UI of the plugin: ', loadFailed: 'Could not load the bookmarks: ',
}
export type Texts = typeof en
export type L = string

const it: Texts = {
  title: 'Segnalibri', newBookmark: '＋ Nuovo segnalibro', search: 'Cerca nei segnalibri', searchPlaceholder: 'Cerca in titolo, indirizzo, nota, etichette', tagsFilter: 'Filtra per etichetta', favourites: 'Preferiti',
  emptyTitle: 'Ancora nessun segnalibro', emptyText: 'Salva i link a cui il tuo gruppo torna spesso, aggiungi una nota e delle etichette e condividili con chi ne ha bisogno.',
  emptyFilter: 'Nessun segnalibro corrisponde. Prova altre parole o etichette.', clearFilters: 'Azzera i filtri',
  fTitle: 'Titolo', fUrl: 'Indirizzo', fNote: 'Nota', fTags: 'Etichette', fTagsHint: 'Scrivi un’etichetta e premi Invio', fFavorite: 'Preferito', titleHint: 'Se vuoto, si usa il nome del sito',
  open: 'Apri', copy: 'Copia il link', edit: 'Modifica', share: 'Condividi…', remove: 'Elimina', create: 'Salva', save: 'Salva', cancel: 'Annulla',
  newTitle: 'Nuovo segnalibro', editTitle: 'Modifica segnalibro', removeConfirm: 'Eliminare il segnalibro “{n}”?', removeTag: 'Rimuovi etichetta',
  addFavorite: 'Aggiungi ai preferiti: {n}', removeFavorite: 'Togli dai preferiti: {n}', copied: 'Link copiato', copyFailed: 'Impossibile copiare il link',
  needUrl: 'Scrivi un indirizzo', count: '{n} mostrati su {t}',
  failed: 'Impossibile avviare la UI del plugin: ', loadFailed: 'Impossibile caricare i segnalibri: ',
}
const es: Texts = {
  title: 'Marcadores', newBookmark: '＋ Nuevo marcador', search: 'Buscar marcadores', searchPlaceholder: 'Buscar en título, dirección, nota, etiquetas', tagsFilter: 'Filtrar por etiqueta', favourites: 'Favoritos',
  emptyTitle: 'Todavía no hay marcadores', emptyText: 'Guarda los enlaces a los que tu equipo vuelve a menudo, añade una nota y etiquetas, y compártelos con quienes los necesiten.',
  emptyFilter: 'Ningún marcador coincide. Prueba otras palabras o etiquetas.', clearFilters: 'Borrar filtros',
  fTitle: 'Título', fUrl: 'Dirección', fNote: 'Nota', fTags: 'Etiquetas', fTagsHint: 'Escribe una etiqueta y pulsa Intro', fFavorite: 'Favorito', titleHint: 'Si está vacío, se usa el nombre del sitio',
  open: 'Abrir', copy: 'Copiar enlace', edit: 'Editar', share: 'Compartir…', remove: 'Eliminar', create: 'Guardar', save: 'Guardar', cancel: 'Cancelar',
  newTitle: 'Nuevo marcador', editTitle: 'Editar marcador', removeConfirm: '¿Eliminar el marcador “{n}”?', removeTag: 'Quitar etiqueta',
  addFavorite: 'Añadir a favoritos: {n}', removeFavorite: 'Quitar de favoritos: {n}', copied: 'Enlace copiado', copyFailed: 'No se pudo copiar el enlace',
  needUrl: 'Escribe una dirección', count: '{n} mostrados de {t}',
  failed: 'No se pudo iniciar la interfaz del plugin: ', loadFailed: 'No se pudieron cargar los marcadores: ',
}
// Page texts: English, Italian and Spanish are the tables above. The other languages come from the language plugins
// (`lang/ui/<plugin id>.json`, English phrase → translation, read through `msk.t`), once `bindTexts` has run; the English
// phrase is shown when a language has none. Without a host (a public page) the tables are used as they are.
let host: Msk | undefined
type Tree = string | { [k: string]: Tree }
/** Connects the tables to the host: `TEXTS[code]` then reads `msk.t` for the languages that are not in the tables. */
export function bindTexts(msk: Msk) {
  host = msk
}
let built: { code: string; texts: unknown; value: Texts } | undefined
function translated(code: string, msk: Msk): Texts {
  const texts = msk.context?.texts
  if (built && built.code === code && built.texts === texts) return built.value
  const tx = (v: Tree): Tree => (typeof v === 'string' ? msk.t(v) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, tx(x)])))
  built = { code, texts, value: tx(en as unknown as Tree) as unknown as Texts }
  return built.value
}
const tables: Record<string, Texts> = { en, it, es }
export const TEXTS = new Proxy(tables, {
  get: (t, code) => (typeof code !== 'string' ? undefined : host && !(code in t) ? translated(code, host) : (t[code] ?? en)),
}) as Record<string, Texts>

/** The code of the language (`es`, `ar`…), `en` when none is known. */
export const langOf = (l: string | undefined): L => ((l ?? (typeof navigator === 'undefined' ? '' : navigator.language)).toLowerCase().split('-')[0] || 'en')
export const sub = (t: string, vars: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))
