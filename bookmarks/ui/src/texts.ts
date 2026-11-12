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
export type L = 'en' | 'it' | 'es'

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
export const TEXTS: Record<L, Texts> = { en, it, es }

export const langOf = (l: string | undefined): L => {
  const x = (l ?? navigator.language).toLowerCase()
  return x.startsWith('it') ? 'it' : x.startsWith('es') ? 'es' : 'en'
}
export const sub = (t: string, vars: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))
