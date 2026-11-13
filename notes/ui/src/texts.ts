// The texts of the Notes UI (English by default). The key of a text is its name here; the English phrase is the key of the
// language plugins.
import type { Msk } from '@mosaikit/plugin-api'

const en = {
  colorNames: { yellow: 'yellow', orange: 'orange', pink: 'pink', violet: 'violet', blue: 'blue', teal: 'teal', green: 'green', grey: 'grey' },
  legacyTags: { personal: 'personal', work: 'work', urgent: 'urgent' } as Record<string, string>,
  title: 'Notes', all: 'All notes', newLabel: '＋ New note', postits: 'Post-its', list: 'List', emptyTitle: 'No notes yet', emptyText: 'Write the first note: it stays yours until you share it.',
  failed: 'Could not start the UI of the plugin: ', mine: 'My notes', shared: 'Shared with me', tag: 'Tag', sharedBy: 'Shared by {n}', empty: 'No text', untitled: 'Untitled',
  tags: 'Tags', allTags: 'All tags', filterTag: 'Filter by tag', colour: 'Colour', noteColour: 'Colour of the note', resize: 'Resize the note: drag, or press Alt and the arrow keys',
  tagsOfNote: 'Tags of the note', newTag: 'New tag', addTag: 'Add', tagName: 'Name of the tag', manageText: 'Every tag has its own colour. Renaming or deleting a tag changes it in all your notes.',
  nameOf: 'Name of the tag {n}', colourOf: 'Colour of the tag {n}', deleteTag: 'Delete', deleteTagOf: 'Delete the tag {n}', close: 'Close', noTags: 'No tags yet: add the first one above.',
  notesN: '{n} notes', noteN: '1 note', tagExists: 'A tag with this name exists already', tagDeleted: 'Tag deleted', tagSaved: 'Tag saved', tagAdded: 'Tag added',
  confirmDelete: 'Delete the tag “{n}”? It is removed from all the notes that have it.',
  pin: 'Pin', unpin: 'Unpin', pinned: 'Pinned', archive: 'Archive', restore: 'Restore', archived: 'Archive', exportMd: 'Export as Markdown', archivedMsg: 'Note archived', restoredMsg: 'Note restored', exportedMsg: 'Note exported',
  emptyArchive: 'Nothing in the archive', emptyArchiveText: 'Archived notes wait here; restore one to bring it back.', mdHelp: 'Markdown: **bold**, *italic*, - list, - [ ] check list',
  bold: 'Bold', italic: 'Italic', heading: 'Heading', bullets: 'List', checks: 'Check list', quote: 'Quote', code: 'Code', link: 'Link', formatting: 'Formatting', progress: '{d} of {n} done',
  editingWith: 'Editing together with {n}', tooLongTogether: 'This note is too long to edit together: only one person at a time should edit it.',
}
export type Texts = typeof en
export type L = string

const it: Texts = {
  colorNames: { yellow: 'giallo', orange: 'arancione', pink: 'rosa', violet: 'viola', blue: 'blu', teal: 'turchese', green: 'verde', grey: 'grigio' },
  legacyTags: { personal: 'personale', work: 'lavoro', urgent: 'urgente' },
  title: 'Note', all: 'Tutte le note', newLabel: '＋ Nuova nota', postits: 'Post-it', list: 'Elenco', emptyTitle: 'Ancora nessuna nota', emptyText: 'Scrivi la prima nota: resta tua finché non la condividi.',
  failed: 'Impossibile avviare la UI del plugin: ', mine: 'Le mie note', shared: 'Condivise con me', tag: 'Tag', sharedBy: 'Condivisa da {n}', empty: 'Nessun testo', untitled: 'Senza titolo',
  tags: 'Tag', allTags: 'Tutti i tag', filterTag: 'Filtra per tag', colour: 'Colore', noteColour: 'Colore della nota', resize: 'Ridimensiona la nota: trascina, oppure premi Alt e i tasti freccia',
  tagsOfNote: 'Tag della nota', newTag: 'Nuovo tag', addTag: 'Aggiungi', tagName: 'Nome del tag', manageText: 'Ogni tag ha il suo colore. Rinominare o eliminare un tag lo cambia in tutte le tue note.',
  nameOf: 'Nome del tag {n}', colourOf: 'Colore del tag {n}', deleteTag: 'Elimina', deleteTagOf: 'Elimina il tag {n}', close: 'Chiudi', noTags: 'Ancora nessun tag: aggiungi il primo qui sopra.',
  notesN: '{n} note', noteN: '1 nota', tagExists: 'Esiste già un tag con questo nome', tagDeleted: 'Tag eliminato', tagSaved: 'Tag salvato', tagAdded: 'Tag aggiunto',
  confirmDelete: 'Eliminare il tag “{n}”? Viene tolto da tutte le note che lo hanno.',
  pin: 'Fissa', unpin: 'Stacca', pinned: 'Fissata', archive: 'Archivia', restore: 'Ripristina', archived: 'Archivio', exportMd: 'Esporta in Markdown', archivedMsg: 'Nota archiviata', restoredMsg: 'Nota ripristinata', exportedMsg: 'Nota esportata',
  emptyArchive: 'Niente nell’archivio', emptyArchiveText: 'Le note archiviate aspettano qui; ripristinane una per riaverla.', mdHelp: 'Markdown: **grassetto**, *corsivo*, - elenco, - [ ] lista di controllo',
  bold: 'Grassetto', italic: 'Corsivo', heading: 'Titolo', bullets: 'Elenco', checks: 'Lista di controllo', quote: 'Citazione', code: 'Codice', link: 'Link', formatting: 'Formattazione', progress: '{d} di {n} fatti',
  editingWith: 'Stai modificando insieme a {n}', tooLongTogether: 'Questa nota è troppo lunga per essere modificata insieme: dovrebbe modificarla una persona alla volta.',
}

const es: Texts = {
  colorNames: { yellow: 'amarillo', orange: 'naranja', pink: 'rosa', violet: 'violeta', blue: 'azul', teal: 'turquesa', green: 'verde', grey: 'gris' },
  legacyTags: { personal: 'personal', work: 'trabajo', urgent: 'urgente' },
  title: 'Notas', all: 'Todas las notas', newLabel: '＋ Nueva nota', postits: 'Post-its', list: 'Lista', emptyTitle: 'Todavía no hay notas', emptyText: 'Escribe la primera nota: es tuya hasta que la compartas.',
  failed: 'No se pudo iniciar la interfaz del plugin: ', mine: 'Mis notas', shared: 'Compartidas conmigo', tag: 'Etiqueta', sharedBy: 'Compartida por {n}', empty: 'Sin texto', untitled: 'Sin título',
  tags: 'Etiquetas', allTags: 'Todas las etiquetas', filterTag: 'Filtrar por etiqueta', colour: 'Color', noteColour: 'Color de la nota', resize: 'Cambia el tamaño de la nota: arrastra, o pulsa Alt y las flechas',
  tagsOfNote: 'Etiquetas de la nota', newTag: 'Nueva etiqueta', addTag: 'Añadir', tagName: 'Nombre de la etiqueta', manageText: 'Cada etiqueta tiene su propio color. Cambiar el nombre o eliminar una etiqueta lo cambia en todas tus notas.',
  nameOf: 'Nombre de la etiqueta {n}', colourOf: 'Color de la etiqueta {n}', deleteTag: 'Eliminar', deleteTagOf: 'Eliminar la etiqueta {n}', close: 'Cerrar', noTags: 'Todavía no hay etiquetas: añade la primera arriba.',
  notesN: '{n} notas', noteN: '1 nota', tagExists: 'Ya existe una etiqueta con este nombre', tagDeleted: 'Etiqueta eliminada', tagSaved: 'Etiqueta guardada', tagAdded: 'Etiqueta añadida',
  confirmDelete: '¿Eliminar la etiqueta “{n}”? Se quita de todas las notas que la tienen.',
  pin: 'Fijar', unpin: 'Soltar', pinned: 'Fijada', archive: 'Archivar', restore: 'Restaurar', archived: 'Archivo', exportMd: 'Exportar como Markdown', archivedMsg: 'Nota archivada', restoredMsg: 'Nota restaurada', exportedMsg: 'Nota exportada',
  emptyArchive: 'Nada en el archivo', emptyArchiveText: 'Las notas archivadas esperan aquí; restaura una para recuperarla.', mdHelp: 'Markdown: **negrita**, *cursiva*, - lista, - [ ] lista de control',
  bold: 'Negrita', italic: 'Cursiva', heading: 'Título', bullets: 'Lista', checks: 'Lista de control', quote: 'Cita', code: 'Código', link: 'Enlace', formatting: 'Formato', progress: '{d} de {n} hechos',
  editingWith: 'Editando junto a {n}', tooLongTogether: 'Esta nota es demasiado larga para editarla en conjunto: solo una persona a la vez debería editarla.',
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

/** The code of the language (\`es\`, \`ar\`…), \`en\` when none is known. */
export const langOf = (l: string | undefined): L => ((l ?? (typeof navigator === 'undefined' ? '' : navigator.language)).toLowerCase().split('-')[0] || 'en')
