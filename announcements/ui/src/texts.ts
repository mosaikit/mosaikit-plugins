import type { Msk } from '@mosaikit/plugin-api'
// The texts of the Announcements UI (English by default; Italian and Spanish follow the language of the host).
const en = {
  title: 'Announcements', newNotice: '＋ New notice', current: 'Current', upcoming: 'Upcoming', past: 'Past', all: 'All', filter: 'Show',
  emptyTitle: 'No notices yet', emptyText: 'Publish a notice, share it with the people who should see it and, if it matters, ask them to confirm they read it.',
  emptyCurrent: 'No current notices', emptyFilter: 'Nothing here. Try another filter.',
  fTitle: 'Title', fBody: 'Text (Markdown)', fLevel: 'Level', fFrom: 'Valid from', fUntil: 'Valid until', fPinned: 'Keep at the top', fAck: 'Ask readers to confirm',
  info: 'Information', important: 'Important', urgent: 'Urgent', pinned: 'Pinned',
  create: 'Publish', save: 'Save', cancel: 'Cancel', edit: 'Edit', remove: 'Delete', share: 'Share…', newTitle: 'New notice', editTitle: 'Edit notice',
  removeConfirm: 'Delete the notice “{n}”?', by: 'by {n}', from: 'from {d}', until: 'until {d}', ended: 'ended {d}',
  confirm: 'I have read it', confirmed: 'You confirmed', confirmedBy: 'Confirmed by {n}', nobodyYet: 'Nobody has confirmed yet', whoTitle: 'Who confirmed', whoNone: 'Nobody has confirmed this notice yet.',
  close: 'Close', thanks: 'Thank you, confirmed', failed: 'Could not start the UI of the plugin: ', loadFailed: 'Could not load the notices: ', needTitle: 'Write a title',
}
export type Texts = typeof en
export type L = string

const it: Texts = {
  title: 'Avvisi', newNotice: '＋ Nuovo avviso', current: 'In corso', upcoming: 'In arrivo', past: 'Passati', all: 'Tutti', filter: 'Mostra',
  emptyTitle: 'Ancora nessun avviso', emptyText: 'Pubblica un avviso, condividilo con chi deve vederlo e, se è importante, chiedi di confermare la lettura.',
  emptyCurrent: 'Nessun avviso in corso', emptyFilter: 'Niente qui. Prova un altro filtro.',
  fTitle: 'Titolo', fBody: 'Testo (Markdown)', fLevel: 'Livello', fFrom: 'Valido dal', fUntil: 'Valido fino al', fPinned: 'Tieni in alto', fAck: 'Chiedi conferma ai lettori',
  info: 'Informazione', important: 'Importante', urgent: 'Urgente', pinned: 'Fissato',
  create: 'Pubblica', save: 'Salva', cancel: 'Annulla', edit: 'Modifica', remove: 'Elimina', share: 'Condividi…', newTitle: 'Nuovo avviso', editTitle: 'Modifica avviso',
  removeConfirm: 'Eliminare l’avviso “{n}”?', by: 'di {n}', from: 'dal {d}', until: 'fino al {d}', ended: 'terminato il {d}',
  confirm: 'Ho letto', confirmed: 'Hai confermato', confirmedBy: 'Confermato da {n}', nobodyYet: 'Nessuno ha ancora confermato', whoTitle: 'Chi ha confermato', whoNone: 'Nessuno ha ancora confermato questo avviso.',
  close: 'Chiudi', thanks: 'Grazie, confermato', failed: 'Impossibile avviare la UI del plugin: ', loadFailed: 'Impossibile caricare gli avvisi: ', needTitle: 'Scrivi un titolo',
}
const es: Texts = {
  title: 'Avisos', newNotice: '＋ Nuevo aviso', current: 'Vigentes', upcoming: 'Próximos', past: 'Pasados', all: 'Todos', filter: 'Mostrar',
  emptyTitle: 'Todavía no hay avisos', emptyText: 'Publica un aviso, compártelo con quienes deban verlo y, si es importante, pide que confirmen la lectura.',
  emptyCurrent: 'No hay avisos vigentes', emptyFilter: 'Nada aquí. Prueba otro filtro.',
  fTitle: 'Título', fBody: 'Texto (Markdown)', fLevel: 'Nivel', fFrom: 'Válido desde', fUntil: 'Válido hasta', fPinned: 'Mantener arriba', fAck: 'Pedir confirmación a los lectores',
  info: 'Información', important: 'Importante', urgent: 'Urgente', pinned: 'Fijado',
  create: 'Publicar', save: 'Guardar', cancel: 'Cancelar', edit: 'Editar', remove: 'Eliminar', share: 'Compartir…', newTitle: 'Nuevo aviso', editTitle: 'Editar aviso',
  removeConfirm: '¿Eliminar el aviso “{n}”?', by: 'de {n}', from: 'desde el {d}', until: 'hasta el {d}', ended: 'terminó el {d}',
  confirm: 'Lo he leído', confirmed: 'Has confirmado', confirmedBy: 'Confirmado por {n}', nobodyYet: 'Nadie ha confirmado todavía', whoTitle: 'Quién ha confirmado', whoNone: 'Nadie ha confirmado este aviso todavía.',
  close: 'Cerrar', thanks: 'Gracias, confirmado', failed: 'No se pudo iniciar la interfaz del plugin: ', loadFailed: 'No se pudieron cargar los avisos: ', needTitle: 'Escribe un título',
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
