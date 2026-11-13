import type { Msk } from '@mosaikit/plugin-api'
// The texts of the Meet UI (English by default; Italian and Spanish follow the language of the host).
const en = {
  title: 'Meet', newRoom: '＋ New room', roomName: 'Name', roomTopic: 'Topic (optional)', create: 'Create', save: 'Save', cancel: 'Cancel',
  emptyTitle: 'No rooms yet', emptyText: 'Create a room, share it with the people who should join, and meet face to face.',
  join: 'Join', leave: 'Leave', share: 'Share…', edit: 'Edit', remove: 'Delete', removeConfirm: 'Delete the room “{n}”?', newTab: 'Open in a new tab', copyLink: 'Copy the link',
  copied: 'Link copied', inRoom: '{n} in the room', nobody: 'Nobody in the room', youAre: 'You are in the room', sharedBy: 'Shared by {n}', roomsOf: 'Rooms',
  privacy: 'The call runs on Jitsi Meet: no video goes through Mosaikit. The browser asks for the camera and the microphone the first time.',
  failed: 'Could not start the UI of the plugin: ', loadFailed: 'Could not load the rooms: ',
}
export type Texts = typeof en
export type L = string

const it: Texts = {
  title: 'Riunioni', newRoom: '＋ Nuova stanza', roomName: 'Nome', roomTopic: 'Argomento (facoltativo)', create: 'Crea', save: 'Salva', cancel: 'Annulla',
  emptyTitle: 'Ancora nessuna stanza', emptyText: 'Crea una stanza, condividila con chi deve entrare e incontratevi faccia a faccia.',
  join: 'Entra', leave: 'Esci', share: 'Condividi…', edit: 'Modifica', remove: 'Elimina', removeConfirm: 'Eliminare la stanza “{n}”?', newTab: 'Apri in una nuova scheda', copyLink: 'Copia il link',
  copied: 'Link copiato', inRoom: '{n} nella stanza', nobody: 'Nessuno nella stanza', youAre: 'Sei nella stanza', sharedBy: 'Condivisa da {n}', roomsOf: 'Stanze',
  privacy: 'La chiamata passa da Jitsi Meet: nessun video passa da Mosaikit. Il browser chiede fotocamera e microfono la prima volta.',
  failed: 'Impossibile avviare la UI del plugin: ', loadFailed: 'Impossibile caricare le stanze: ',
}
const es: Texts = {
  title: 'Reuniones', newRoom: '＋ Nueva sala', roomName: 'Nombre', roomTopic: 'Tema (opcional)', create: 'Crear', save: 'Guardar', cancel: 'Cancelar',
  emptyTitle: 'Todavía no hay salas', emptyText: 'Crea una sala, compártela con quienes deban entrar y reúnanse cara a cara.',
  join: 'Entrar', leave: 'Salir', share: 'Compartir…', edit: 'Editar', remove: 'Eliminar', removeConfirm: '¿Eliminar la sala “{n}”?', newTab: 'Abrir en una pestaña nueva', copyLink: 'Copiar el enlace',
  copied: 'Enlace copiado', inRoom: '{n} en la sala', nobody: 'Nadie en la sala', youAre: 'Estás en la sala', sharedBy: 'Compartida por {n}', roomsOf: 'Salas',
  privacy: 'La llamada se hace en Jitsi Meet: ningún vídeo pasa por Mosaikit. El navegador pide la cámara y el micrófono la primera vez.',
  failed: 'No se pudo iniciar la interfaz del plugin: ', loadFailed: 'No se pudieron cargar las salas: ',
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
