// The texts of the Contacts UI (English by default; Italian and Spanish follow the language of the host).
const en = {
  title: 'Contacts', newLabel: '＋ New contact', cards: 'Cards', list: 'List', noName: 'Unnamed',
  emptyTitle: 'No contacts yet', emptyText: 'Add the people and companies you work with, or import a vCard or CSV file.',
  allTags: 'All', tagsLabel: 'Filter by tag',
  import: 'Import', export: 'Export', exportVcf: 'vCard (.vcf)', exportCsv: 'CSV (.csv)', duplicates: 'Duplicates',
  importAsk: 'Import {n} contacts from “{f}”?', importTitle: 'Import contacts', importOk: 'Imported {n} contacts', importPartial: 'Imported {n}, {m} skipped (invalid data)', importNone: 'No contacts found in “{f}”', importWrong: 'Choose a .vcf or .csv file', importFailed: 'Import failed: ',
  exported: 'Exported {n} contacts', exportNone: 'There is nothing to export',
  dupTitle: 'Possible duplicates', dupNone: 'No duplicates found: every contact has a different email, phone number and name.', dupHint: 'Same email, phone number or name. Open each one to merge by hand.', open: 'Open', close: 'Close', cancel: 'Cancel',
  email: 'Email', phone: 'Phone', address: 'Address', birthday: 'Birthday', notes: 'Notes', tags: 'Tags', tagsPlaceholder: 'Add a tag…', removeTag: 'Remove tag',
  sendMail: 'Email', call: 'Call', noNotes: 'No notes.',
  today: 'today!', inDays: 'in {n} days', tomorrow: 'tomorrow',
  write: 'Write', preview: 'Preview', bold: 'Bold', italic: 'Italic', heading: 'Heading', bullets: 'List', checks: 'Check list', quote: 'Quote', code: 'Code', link: 'Link', nothingToPreview: 'Nothing to preview',
  failed: 'Could not start the UI of the plugin: ',
}
export type Texts = typeof en
export type L = 'en' | 'it' | 'es'

const it: Texts = {
  title: 'Contatti', newLabel: '＋ Nuovo contatto', cards: 'Schede', list: 'Elenco', noName: 'Senza nome',
  emptyTitle: 'Ancora nessun contatto', emptyText: 'Aggiungi le persone e le aziende con cui lavori, oppure importa un file vCard o CSV.',
  allTags: 'Tutte', tagsLabel: 'Filtra per etichetta',
  import: 'Importa', export: 'Esporta', exportVcf: 'vCard (.vcf)', exportCsv: 'CSV (.csv)', duplicates: 'Doppioni',
  importAsk: 'Importare {n} contatti da “{f}”?', importTitle: 'Importa contatti', importOk: 'Importati {n} contatti', importPartial: 'Importati {n}, {m} saltati (dati non validi)', importNone: 'Nessun contatto trovato in “{f}”', importWrong: 'Scegli un file .vcf o .csv', importFailed: 'Importazione non riuscita: ',
  exported: 'Esportati {n} contatti', exportNone: 'Non c’è niente da esportare',
  dupTitle: 'Possibili doppioni', dupNone: 'Nessun doppione: ogni contatto ha email, telefono e nome diversi.', dupHint: 'Stessa email, stesso telefono o stesso nome. Aprili uno per uno per unirli a mano.', open: 'Apri', close: 'Chiudi', cancel: 'Annulla',
  email: 'Email', phone: 'Telefono', address: 'Indirizzo', birthday: 'Compleanno', notes: 'Note', tags: 'Etichette', tagsPlaceholder: 'Aggiungi un’etichetta…', removeTag: 'Rimuovi etichetta',
  sendMail: 'Scrivi', call: 'Chiama', noNotes: 'Nessuna nota.',
  today: 'oggi!', inDays: 'tra {n} giorni', tomorrow: 'domani',
  write: 'Scrivi', preview: 'Anteprima', bold: 'Grassetto', italic: 'Corsivo', heading: 'Titolo', bullets: 'Elenco', checks: 'Lista di controllo', quote: 'Citazione', code: 'Codice', link: 'Link', nothingToPreview: 'Niente da mostrare',
  failed: 'Impossibile avviare la UI del plugin: ',
}
const es: Texts = {
  title: 'Contactos', newLabel: '＋ Nuevo contacto', cards: 'Fichas', list: 'Lista', noName: 'Sin nombre',
  emptyTitle: 'Todavía no hay contactos', emptyText: 'Añade las personas y empresas con las que trabajas, o importa un archivo vCard o CSV.',
  allTags: 'Todas', tagsLabel: 'Filtrar por etiqueta',
  import: 'Importar', export: 'Exportar', exportVcf: 'vCard (.vcf)', exportCsv: 'CSV (.csv)', duplicates: 'Duplicados',
  importAsk: '¿Importar {n} contactos de “{f}”?', importTitle: 'Importar contactos', importOk: 'Importados {n} contactos', importPartial: 'Importados {n}, {m} omitidos (datos no válidos)', importNone: 'No se encontraron contactos en “{f}”', importWrong: 'Elige un archivo .vcf o .csv', importFailed: 'La importación falló: ',
  exported: 'Exportados {n} contactos', exportNone: 'No hay nada que exportar',
  dupTitle: 'Posibles duplicados', dupNone: 'Sin duplicados: cada contacto tiene un correo, teléfono y nombre distintos.', dupHint: 'Mismo correo, teléfono o nombre. Ábrelos uno a uno para unirlos a mano.', open: 'Abrir', close: 'Cerrar', cancel: 'Cancelar',
  email: 'Correo', phone: 'Teléfono', address: 'Dirección', birthday: 'Cumpleaños', notes: 'Notas', tags: 'Etiquetas', tagsPlaceholder: 'Añadir una etiqueta…', removeTag: 'Quitar etiqueta',
  sendMail: 'Escribir', call: 'Llamar', noNotes: 'Sin notas.',
  today: '¡hoy!', inDays: 'en {n} días', tomorrow: 'mañana',
  write: 'Escribir', preview: 'Vista previa', bold: 'Negrita', italic: 'Cursiva', heading: 'Título', bullets: 'Lista', checks: 'Lista de control', quote: 'Cita', code: 'Código', link: 'Enlace', nothingToPreview: 'Nada que mostrar',
  failed: 'No se pudo iniciar la interfaz del plugin: ',
}
export const TEXTS: Record<L, Texts> = { en, it, es }

export const langOf = (l: string | undefined): L => {
  const x = (l ?? navigator.language).toLowerCase()
  return x.startsWith('it') ? 'it' : x.startsWith('es') ? 'es' : 'en'
}
export const sub = (t: string, vars: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))
