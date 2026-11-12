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
export type L = 'en' | 'it' | 'es'

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
export const TEXTS: Record<L, Texts> = { en, it, es }

export const langOf = (l: string | undefined): L => {
  const x = (l ?? navigator.language).toLowerCase()
  return x.startsWith('it') ? 'it' : x.startsWith('es') ? 'es' : 'en'
}
export const sub = (t: string, vars: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))
