import type { Msk } from '@mosaikit/plugin-api'
// The texts of the Whiteboard UI (English by default; Italian and Spanish follow the language of the host).
const en = {
  title: 'Whiteboard', newBoard: '＋ New whiteboard', emptyTitle: 'No whiteboards yet', emptyText: 'Start a board, share it with the people you work with and draw together: sticky notes, shapes, arrows and sketches, live.',
  untitled: 'Untitled whiteboard', fTitle: 'Title', newTitle: 'New whiteboard', create: 'Create', cancel: 'Cancel', close: 'Close', needTitle: 'Write a title',
  open: 'Open', share: 'Share…', remove: 'Delete', removeConfirm: 'Delete the whiteboard “{n}” and everything drawn on it?', edited: 'Edited {d}', by: 'by {n}', viewOnly: 'View only', objectsN: '{n} objects',
  failed: 'Could not start the UI of the plugin: ', loadFailed: 'Could not load the whiteboards: ', openFailed: 'Could not open the whiteboard: ',
  // the editor
  back: 'Back to the whiteboards', titleLabel: 'Title of the whiteboard', tools: 'Tools', colors: 'Colour', history: 'History', arrange: 'Arrange', zoomGroup: 'Zoom', exportGroup: 'Export',
  select: 'Select and move', hand: 'Pan', note: 'Sticky note', rect: 'Rectangle', ellipse: 'Ellipse', text: 'Text', arrow: 'Arrow', pen: 'Pen',
  undo: 'Undo', redo: 'Redo', del: 'Delete the selection', duplicate: 'Duplicate', front: 'Bring to front', back2: 'Send to back',
  zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit to content', zoomLevel: 'Zoom {n}%', background: 'Background', plain: 'Plain', dots: 'Dots', grid: 'Grid',
  exportPng: 'Export as PNG', exportSvg: 'Export as SVG', exported: 'Exported', here: 'Here now', alone: 'Only you', withN: 'Here: {n}', shortcuts: 'Keyboard shortcuts',
  saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved changes', saveFailed: 'Could not save the whiteboard: ', tooBig: 'The whiteboard is too big to be saved: delete some drawings', live: 'Live', offline: 'Offline: changes are kept and sent when the connection returns',
  canvas: 'Whiteboard canvas', canvasHelp: 'Use the toolbar to add things. Arrow keys move the selection, Enter edits its text, Tab goes to the next object.',
  empty: 'The whiteboard is empty', selectedN: '{n} selected', editText: 'Text of the object', placeholderNote: 'Write here',
  kNote: 'sticky notes', kRect: 'rectangles', kEllipse: 'ellipses', kText: 'texts', kArrow: 'arrows', kPen: 'drawings',
  legendTitle: 'Keyboard shortcuts', legendTools: 'Tools: V select, H pan, N note, R rectangle, O ellipse, T text, A arrow, P pen',
  legendMove: 'Arrow keys move the selection (Shift for bigger steps); Tab and Shift+Tab choose the next or previous object',
  legendEdit: 'Enter edits the text of the selected object; Escape finishes; Delete removes the selection; Ctrl+D duplicates it',
  legendUndo: 'Ctrl+Z undoes, Ctrl+Shift+Z or Ctrl+Y redoes; Ctrl+A selects everything', legendOrder: '] brings to front, [ sends to back',
  legendView: '+ and − zoom, 0 fits the content; the mouse wheel zooms; hold Space or use the middle button to pan',
  colorNames: { yellow: 'Yellow', orange: 'Orange', red: 'Red', pink: 'Pink', purple: 'Purple', blue: 'Blue', green: 'Green', gray: 'Gray' } as Record<string, string>,
  pointers: 'Pointers of the others are shown live',
}
export type Texts = typeof en
export type L = string

const it: Texts = {
  title: 'Lavagna', newBoard: '＋ Nuova lavagna', emptyTitle: 'Ancora nessuna lavagna', emptyText: 'Crea una lavagna, condividila con chi lavora con te e disegnate insieme: note adesive, forme, frecce e schizzi, dal vivo.',
  untitled: 'Lavagna senza titolo', fTitle: 'Titolo', newTitle: 'Nuova lavagna', create: 'Crea', cancel: 'Annulla', close: 'Chiudi', needTitle: 'Scrivi un titolo',
  open: 'Apri', share: 'Condividi…', remove: 'Elimina', removeConfirm: 'Eliminare la lavagna “{n}” e tutto ciò che vi è disegnato?', edited: 'Modificata {d}', by: 'di {n}', viewOnly: 'Sola lettura', objectsN: '{n} oggetti',
  failed: 'Impossibile avviare la UI del plugin: ', loadFailed: 'Impossibile caricare le lavagne: ', openFailed: 'Impossibile aprire la lavagna: ',
  back: 'Torna alle lavagne', titleLabel: 'Titolo della lavagna', tools: 'Strumenti', colors: 'Colore', history: 'Cronologia', arrange: 'Disponi', zoomGroup: 'Zoom', exportGroup: 'Esporta',
  select: 'Seleziona e sposta', hand: 'Sposta la vista', note: 'Nota adesiva', rect: 'Rettangolo', ellipse: 'Ellisse', text: 'Testo', arrow: 'Freccia', pen: 'Penna',
  undo: 'Annulla', redo: 'Ripeti', del: 'Elimina la selezione', duplicate: 'Duplica', front: 'Porta in primo piano', back2: 'Manda sullo sfondo',
  zoomIn: 'Ingrandisci', zoomOut: 'Riduci', fit: 'Adatta al contenuto', zoomLevel: 'Zoom {n}%', background: 'Sfondo', plain: 'Liscio', dots: 'Puntinato', grid: 'Griglia',
  exportPng: 'Esporta come PNG', exportSvg: 'Esporta come SVG', exported: 'Esportata', here: 'Presenti ora', alone: 'Solo tu', withN: 'Presenti: {n}', shortcuts: 'Scorciatoie da tastiera',
  saved: 'Salvata', saving: 'Salvataggio…', unsaved: 'Modifiche non salvate', saveFailed: 'Impossibile salvare la lavagna: ', tooBig: 'La lavagna è troppo grande per essere salvata: elimina qualche disegno', live: 'In diretta', offline: 'Non connesso: le modifiche restano e partono al ritorno della connessione',
  canvas: 'Area della lavagna', canvasHelp: 'Usa la barra degli strumenti per aggiungere elementi. I tasti freccia spostano la selezione, Invio ne modifica il testo, Tab passa all’oggetto successivo.',
  empty: 'La lavagna è vuota', selectedN: '{n} selezionati', editText: 'Testo dell’oggetto', placeholderNote: 'Scrivi qui',
  kNote: 'note adesive', kRect: 'rettangoli', kEllipse: 'ellissi', kText: 'testi', kArrow: 'frecce', kPen: 'disegni',
  legendTitle: 'Scorciatoie da tastiera', legendTools: 'Strumenti: V seleziona, H sposta la vista, N nota, R rettangolo, O ellisse, T testo, A freccia, P penna',
  legendMove: 'I tasti freccia spostano la selezione (con Maiusc a passi più grandi); Tab e Maiusc+Tab scelgono l’oggetto successivo o precedente',
  legendEdit: 'Invio modifica il testo dell’oggetto selezionato; Esc termina; Canc elimina la selezione; Ctrl+D la duplica',
  legendUndo: 'Ctrl+Z annulla, Ctrl+Maiusc+Z o Ctrl+Y ripete; Ctrl+A seleziona tutto', legendOrder: '] porta in primo piano, [ manda sullo sfondo',
  legendView: '+ e − fanno zoom, 0 adatta al contenuto; la rotellina fa zoom; tieni premuto Spazio o usa il tasto centrale per spostare la vista',
  colorNames: { yellow: 'Giallo', orange: 'Arancione', red: 'Rosso', pink: 'Rosa', purple: 'Viola', blue: 'Blu', green: 'Verde', gray: 'Grigio' } as Record<string, string>,
  pointers: 'I puntatori degli altri si vedono in diretta',
}
const es: Texts = {
  title: 'Pizarra', newBoard: '＋ Nueva pizarra', emptyTitle: 'Todavía no hay pizarras', emptyText: 'Crea una pizarra, compártela con quienes trabajan contigo y dibujad juntos: notas adhesivas, formas, flechas y bocetos, en directo.',
  untitled: 'Pizarra sin título', fTitle: 'Título', newTitle: 'Nueva pizarra', create: 'Crear', cancel: 'Cancelar', close: 'Cerrar', needTitle: 'Escribe un título',
  open: 'Abrir', share: 'Compartir…', remove: 'Eliminar', removeConfirm: '¿Eliminar la pizarra “{n}” y todo lo dibujado en ella?', edited: 'Editada {d}', by: 'de {n}', viewOnly: 'Solo lectura', objectsN: '{n} objetos',
  failed: 'No se pudo iniciar la interfaz del plugin: ', loadFailed: 'No se pudieron cargar las pizarras: ', openFailed: 'No se pudo abrir la pizarra: ',
  back: 'Volver a las pizarras', titleLabel: 'Título de la pizarra', tools: 'Herramientas', colors: 'Color', history: 'Historial', arrange: 'Ordenar', zoomGroup: 'Zoom', exportGroup: 'Exportar',
  select: 'Seleccionar y mover', hand: 'Desplazar la vista', note: 'Nota adhesiva', rect: 'Rectángulo', ellipse: 'Elipse', text: 'Texto', arrow: 'Flecha', pen: 'Lápiz',
  undo: 'Deshacer', redo: 'Rehacer', del: 'Eliminar la selección', duplicate: 'Duplicar', front: 'Traer al frente', back2: 'Enviar al fondo',
  zoomIn: 'Acercar', zoomOut: 'Alejar', fit: 'Ajustar al contenido', zoomLevel: 'Zoom {n}%', background: 'Fondo', plain: 'Liso', dots: 'Punteado', grid: 'Cuadrícula',
  exportPng: 'Exportar como PNG', exportSvg: 'Exportar como SVG', exported: 'Exportada', here: 'Aquí ahora', alone: 'Solo tú', withN: 'Aquí: {n}', shortcuts: 'Atajos de teclado',
  saved: 'Guardada', saving: 'Guardando…', unsaved: 'Cambios sin guardar', saveFailed: 'No se pudo guardar la pizarra: ', tooBig: 'La pizarra es demasiado grande para guardarla: elimina algunos dibujos', live: 'En directo', offline: 'Sin conexión: los cambios se conservan y se envían al volver la conexión',
  canvas: 'Lienzo de la pizarra', canvasHelp: 'Usa la barra de herramientas para añadir elementos. Las flechas del teclado mueven la selección, Intro edita su texto, Tab pasa al objeto siguiente.',
  empty: 'La pizarra está vacía', selectedN: '{n} seleccionados', editText: 'Texto del objeto', placeholderNote: 'Escribe aquí',
  kNote: 'notas adhesivas', kRect: 'rectángulos', kEllipse: 'elipses', kText: 'textos', kArrow: 'flechas', kPen: 'dibujos',
  legendTitle: 'Atajos de teclado', legendTools: 'Herramientas: V seleccionar, H desplazar la vista, N nota, R rectángulo, O elipse, T texto, A flecha, P lápiz',
  legendMove: 'Las flechas del teclado mueven la selección (con Mayús, pasos más grandes); Tab y Mayús+Tab eligen el objeto siguiente o anterior',
  legendEdit: 'Intro edita el texto del objeto seleccionado; Esc termina; Supr elimina la selección; Ctrl+D la duplica',
  legendUndo: 'Ctrl+Z deshace, Ctrl+Mayús+Z o Ctrl+Y rehace; Ctrl+A selecciona todo', legendOrder: '] trae al frente, [ envía al fondo',
  legendView: '+ y − hacen zoom, 0 ajusta al contenido; la rueda del ratón hace zoom; mantén Espacio o usa el botón central para desplazar la vista',
  colorNames: { yellow: 'Amarillo', orange: 'Naranja', red: 'Rojo', pink: 'Rosa', purple: 'Morado', blue: 'Azul', green: 'Verde', gray: 'Gris' } as Record<string, string>,
  pointers: 'Los punteros de los demás se ven en directo',
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
