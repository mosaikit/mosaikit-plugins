// The texts of the Snippets UI (English by default; Italian and Spanish follow the language of the host).
const en = {
  title: 'Snippets', newSnippet: '＋ New snippet',
  emptyTitle: 'No snippets yet', emptyText: 'Save the texts and the code you use again and again, tag them, and copy them with one click. Share a snippet with your team so everybody has it at hand.',
  noMatch: 'No snippet matches your search.', clearFilters: 'Clear filters', pick: 'Select a snippet to see it here.',
  search: 'Search snippets', searchPlaceholder: 'Search title, content and tags', allKinds: 'All kinds', filterKind: 'Filter by kind', tagsLabel: 'Tags', allTags: 'All tags', list: 'Snippets',
  kinds: { text: 'Text', shell: 'Shell', sql: 'SQL', json: 'JSON', javascript: 'JavaScript', python: 'Python', rust: 'Rust', markdown: 'Markdown', other: 'Other' },
  fTitle: 'Title', fKind: 'Kind', fBody: 'Content', fTags: 'Tags', tagPlaceholder: 'Type a tag and press Enter', removeTag: 'Remove tag',
  create: 'Create', save: 'Save', cancel: 'Cancel', edit: 'Edit', remove: 'Delete', share: 'Share…', copy: 'Copy', back: 'Back to the list',
  newTitle: 'New snippet', editTitle: 'Edit snippet', removeConfirm: 'Delete the snippet “{n}”?', by: 'by {n}', lines: '{n} lines', line: '1 line',
  copied: 'Copied', copyFailed: 'Could not copy: select the text and copy it by hand', needTitle: 'Write a title', needBody: 'Write the content',
  failed: 'Could not start the UI of the plugin: ', loadFailed: 'Could not load the snippets: ',
}
export type Texts = typeof en
export type L = 'en' | 'it' | 'es'

const it: Texts = {
  title: 'Snippet', newSnippet: '＋ Nuovo snippet',
  emptyTitle: 'Ancora nessuno snippet', emptyText: 'Salva i testi e il codice che usi di continuo, mettici delle etichette e copiali con un clic. Condividi uno snippet con il tuo gruppo, così tutti lo hanno a portata di mano.',
  noMatch: 'Nessuno snippet corrisponde alla ricerca.', clearFilters: 'Azzera i filtri', pick: 'Scegli uno snippet per vederlo qui.',
  search: 'Cerca snippet', searchPlaceholder: 'Cerca nel titolo, nel contenuto e nelle etichette', allKinds: 'Tutti i tipi', filterKind: 'Filtra per tipo', tagsLabel: 'Etichette', allTags: 'Tutte le etichette', list: 'Snippet',
  kinds: { text: 'Testo', shell: 'Shell', sql: 'SQL', json: 'JSON', javascript: 'JavaScript', python: 'Python', rust: 'Rust', markdown: 'Markdown', other: 'Altro' },
  fTitle: 'Titolo', fKind: 'Tipo', fBody: 'Contenuto', fTags: 'Etichette', tagPlaceholder: 'Scrivi un’etichetta e premi Invio', removeTag: 'Rimuovi etichetta',
  create: 'Crea', save: 'Salva', cancel: 'Annulla', edit: 'Modifica', remove: 'Elimina', share: 'Condividi…', copy: 'Copia', back: 'Torna all’elenco',
  newTitle: 'Nuovo snippet', editTitle: 'Modifica snippet', removeConfirm: 'Eliminare lo snippet “{n}”?', by: 'di {n}', lines: '{n} righe', line: '1 riga',
  copied: 'Copiato', copyFailed: 'Impossibile copiare: seleziona il testo e copialo a mano', needTitle: 'Scrivi un titolo', needBody: 'Scrivi il contenuto',
  failed: 'Impossibile avviare la UI del plugin: ', loadFailed: 'Impossibile caricare gli snippet: ',
}
const es: Texts = {
  title: 'Fragmentos', newSnippet: '＋ Nuevo fragmento',
  emptyTitle: 'Todavía no hay fragmentos', emptyText: 'Guarda los textos y el código que usas una y otra vez, ponles etiquetas y cópialos con un clic. Comparte un fragmento con tu equipo para que todos lo tengan a mano.',
  noMatch: 'Ningún fragmento coincide con la búsqueda.', clearFilters: 'Quitar los filtros', pick: 'Elige un fragmento para verlo aquí.',
  search: 'Buscar fragmentos', searchPlaceholder: 'Buscar en el título, el contenido y las etiquetas', allKinds: 'Todos los tipos', filterKind: 'Filtrar por tipo', tagsLabel: 'Etiquetas', allTags: 'Todas las etiquetas', list: 'Fragmentos',
  kinds: { text: 'Texto', shell: 'Shell', sql: 'SQL', json: 'JSON', javascript: 'JavaScript', python: 'Python', rust: 'Rust', markdown: 'Markdown', other: 'Otro' },
  fTitle: 'Título', fKind: 'Tipo', fBody: 'Contenido', fTags: 'Etiquetas', tagPlaceholder: 'Escribe una etiqueta y pulsa Intro', removeTag: 'Quitar etiqueta',
  create: 'Crear', save: 'Guardar', cancel: 'Cancelar', edit: 'Editar', remove: 'Eliminar', share: 'Compartir…', copy: 'Copiar', back: 'Volver a la lista',
  newTitle: 'Nuevo fragmento', editTitle: 'Editar fragmento', removeConfirm: '¿Eliminar el fragmento “{n}”?', by: 'de {n}', lines: '{n} líneas', line: '1 línea',
  copied: 'Copiado', copyFailed: 'No se pudo copiar: selecciona el texto y cópialo a mano', needTitle: 'Escribe un título', needBody: 'Escribe el contenido',
  failed: 'No se pudo iniciar la interfaz del plugin: ', loadFailed: 'No se pudieron cargar los fragmentos: ',
}
export const TEXTS: Record<L, Texts> = { en, it, es }

export const langOf = (l: string | undefined): L => {
  const x = (l ?? navigator.language).toLowerCase()
  return x.startsWith('it') ? 'it' : x.startsWith('es') ? 'es' : 'en'
}
export const sub = (t: string, vars: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))
