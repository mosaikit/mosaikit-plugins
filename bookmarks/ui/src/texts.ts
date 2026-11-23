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
  import: 'Import', importHint: 'From a browser (bookmarks .html) or a CSV file', export: 'Export', exportHtml: 'Browser file (.html)', exportCsv: 'CSV (.csv)', duplicates: 'Duplicates', close: 'Close',
  importTitle: 'Import bookmarks', importAsk: 'Import {n} new bookmarks from “{f}”?', importSkip: '{m} already saved will be skipped.', importCap: 'Only the first {max} are imported.', importOk: 'Imported {n} bookmarks ({m} skipped)', importPartial: 'Imported {n}, {m} skipped or failed', importAllDup: 'Nothing to import: all {n} are already saved', importNone: 'No bookmarks found in “{f}”', importWrong: 'Choose a .html or .csv file', importFailed: 'Import failed: ',
  exported: 'Exported {n} bookmarks', exportNone: 'There is nothing to export', alreadySaved: 'Already saved as “{n}”.',
  dupTitle: 'Duplicate bookmarks', dupNone: 'No duplicates: every bookmark has its own address.', dupHint: 'The same address (www, a final slash, http or https and tracking parameters do not count).', dupKeep: 'Keep “{n}”, delete the others', dupRemoved: '{n} duplicates deleted',
  scNew: 'New bookmark', scSearch: 'Search', scTitle: 'Keyboard shortcuts', scThen: 'then',
  openLinks: 'Open links', openLinksHint: 'Where a bookmark opens unless it says otherwise', modeFrame: 'In the page', modeTab: 'New tab', modeDefault: 'As the list: {m}', fOpen: 'Opens', fOpenHint: 'In the page the site is shown inside Mosaikit; if it forbids that, it opens in a new tab.',
  badgeFrame: 'In page', badgeTab: 'New tab', looking: 'Looking at the site…', backToList: 'Back to the bookmarks', frameTitle: 'Web site', newTabLink: '↗ New tab',
  noFrame: 'This site does not allow being shown inside Mosaikit (it forbids framing). It was opened in a new tab; if nothing opened, use the button.',
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
  import: 'Importa', importHint: 'Da un browser (segnalibri .html) o da un file CSV', export: 'Esporta', exportHtml: 'File del browser (.html)', exportCsv: 'CSV (.csv)', duplicates: 'Doppioni', close: 'Chiudi',
  importTitle: 'Importa segnalibri', importAsk: 'Importare {n} nuovi segnalibri da “{f}”?', importSkip: '{m} già salvati saranno saltati.', importCap: 'Si importano solo i primi {max}.', importOk: 'Importati {n} segnalibri ({m} saltati)', importPartial: 'Importati {n}, {m} saltati o falliti', importAllDup: 'Niente da importare: tutti i {n} sono già salvati', importNone: 'Nessun segnalibro trovato in “{f}”', importWrong: 'Scegli un file .html o .csv', importFailed: 'Importazione non riuscita: ',
  exported: 'Esportati {n} segnalibri', exportNone: 'Non c’è niente da esportare', alreadySaved: 'Già salvato come “{n}”.',
  dupTitle: 'Segnalibri doppi', dupNone: 'Nessun doppione: ogni segnalibro ha il suo indirizzo.', dupHint: 'Lo stesso indirizzo (www, una barra finale, http o https e i parametri di tracciamento non contano).', dupKeep: 'Tieni “{n}”, elimina gli altri', dupRemoved: '{n} doppioni eliminati',
  scNew: 'Nuovo segnalibro', scSearch: 'Cerca', scTitle: 'Scorciatoie da tastiera', scThen: 'poi',
  openLinks: 'Apri i link', openLinksHint: 'Dove si apre un segnalibro se non dice altro', modeFrame: 'Nella pagina', modeTab: 'Nuova scheda', modeDefault: 'Come l’elenco: {m}', fOpen: 'Si apre', fOpenHint: 'Nella pagina il sito è mostrato dentro Mosaikit; se non lo permette, si apre in una nuova scheda.',
  badgeFrame: 'Nella pagina', badgeTab: 'Nuova scheda', looking: 'Guardo il sito…', backToList: 'Torna ai segnalibri', frameTitle: 'Sito web', newTabLink: '↗ Nuova scheda',
  noFrame: 'Questo sito non può essere mostrato dentro Mosaikit (vieta l’incorporamento). È stato aperto in una nuova scheda; se non si è aperto nulla, usa il pulsante.',
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
  import: 'Importar', importHint: 'Desde un navegador (marcadores .html) o un archivo CSV', export: 'Exportar', exportHtml: 'Archivo del navegador (.html)', exportCsv: 'CSV (.csv)', duplicates: 'Duplicados', close: 'Cerrar',
  importTitle: 'Importar marcadores', importAsk: '¿Importar {n} marcadores nuevos de “{f}”?', importSkip: 'Se omitirán {m} ya guardados.', importCap: 'Solo se importan los primeros {max}.', importOk: 'Importados {n} marcadores ({m} omitidos)', importPartial: 'Importados {n}, {m} omitidos o fallidos', importAllDup: 'Nada que importar: los {n} ya están guardados', importNone: 'No se encontraron marcadores en “{f}”', importWrong: 'Elige un archivo .html o .csv', importFailed: 'Falló la importación: ',
  exported: 'Exportados {n} marcadores', exportNone: 'No hay nada que exportar', alreadySaved: 'Ya guardado como “{n}”.',
  dupTitle: 'Marcadores duplicados', dupNone: 'Sin duplicados: cada marcador tiene su dirección.', dupHint: 'La misma dirección (www, una barra final, http o https y los parámetros de seguimiento no cuentan).', dupKeep: 'Conservar “{n}”, eliminar los demás', dupRemoved: '{n} duplicados eliminados',
  scNew: 'Nuevo marcador', scSearch: 'Buscar', scTitle: 'Atajos de teclado', scThen: 'luego',
  openLinks: 'Abrir enlaces', openLinksHint: 'Dónde se abre un marcador si no dice otra cosa', modeFrame: 'En la página', modeTab: 'Pestaña nueva', modeDefault: 'Como la lista: {m}', fOpen: 'Se abre', fOpenHint: 'En la página el sitio se muestra dentro de Mosaikit; si no lo permite, se abre en una pestaña nueva.',
  badgeFrame: 'En la página', badgeTab: 'Pestaña nueva', looking: 'Mirando el sitio…', backToList: 'Volver a los marcadores', frameTitle: 'Sitio web', newTabLink: '↗ Pestaña nueva',
  noFrame: 'Este sitio no permite mostrarse dentro de Mosaikit (prohíbe incrustarlo). Se abrió en una pestaña nueva; si no se abrió nada, usa el botón.',
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
