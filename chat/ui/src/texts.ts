import type { Msk } from '@mosaikit/plugin-api'
// The texts of the Chat UI (English by default; Italian and Spanish follow the language of the host).
const en = {
  title: 'Chat', channels: 'Channels', newChannel: 'New channel', channelName: 'Name', channelTopic: 'Topic (optional)', create: 'Create', save: 'Save', cancel: 'Cancel', close: 'Close',
  noChannelsTitle: 'No channels yet', noChannelsText: 'Create the first channel, then share it with the people you want to talk to.', noChannelOpenTitle: 'Pick a channel', noChannelOpenText: 'Choose a channel on the left to read and write.',
  share: 'Share…', rename: 'Edit channel', remove: 'Delete channel', removeConfirm: 'Delete the channel “{n}” with all its messages?', back: 'Channels',
  placeholder: 'Write a message… (Enter sends, Shift+Enter makes a new line, Markdown works)', send: 'Send', readOnly: 'You can read this channel but not write in it.',
  replyingTo: 'Replying to {n}', cancelReply: 'Cancel the reply', reply: 'Reply', react: 'React', edit: 'Edit', delete: 'Delete', edited: 'edited',
  deleteConfirm: 'Delete this message?', online: '{n} online', alone: 'Only you', loadOlder: 'Load older messages', noMessages: 'No messages yet. Say hello!', loading: 'Loading…',
  typing1: '{a} is typing…', typing2: '{a} and {b} are typing…', typingMany: 'Several people are typing…',
  today: 'Today', yesterday: 'Yesterday',
  reconnecting: 'Connection lost: trying again…', gap: 'Some messages may have been missed.', closed: 'You can no longer follow this channel.', reload: 'Reload', retry: 'Reload',
  sendFailed: 'Could not send the message: ', loadFailed: 'Could not load: ', youReacted: 'You', failed: 'Could not start the UI of the plugin: ',
  you: 'You',
  call: 'Start a call', callText: '📞 Call started: [join the call]({url})',
  // Chat 2.0: the list
  newChat: 'New chat', searchChats: 'Search chats', filters: 'Filter chats', filterAll: 'All', filterUnread: 'Unread', filterChats: 'Chats', filterMeetings: 'Meetings',
  pinnedSection: 'Pinned', recentSection: 'Recent', noChatsTitle: 'No chats yet', noChatsText: 'Start a conversation with a colleague, or create a group chat.',
  pickChatTitle: 'Pick a chat', pickChatText: 'Choose a chat on the left, or start a new one.', noChatMatch: 'No chat matches.', moreActions: 'More actions',
  pin: 'Pin', unpin: 'Unpin', mute: 'Mute', unmute: 'Unmute', markUnread: 'Mark as unread', markRead: 'Mark as read', hideChat: 'Hide', leaveChat: 'Leave',
  leaveTitle: 'Leave this chat?', leaveText: 'You will not get its messages any more. Someone can add you again.', backToList: 'Back to the chats',
  presenceAvailable: 'Available', presenceAway: 'Away', presenceOffline: 'Offline', unreadCount: '{n} unread', mentionedYou: 'You were mentioned', mutedChat: 'Muted', pinnedChat: 'Pinned', clearFilters: 'Clear filters',
  // the header and its tabs
  tabs: 'Sections of the chat', tabChat: 'Chat', tabFiles: 'Files', tabPinned: 'Pinned', people: 'People', addPeople: 'Add people', callVideo: 'Video call', callAudio: 'Audio call',
  searchInChat: 'Search in this chat', peopleCount: '{n} people', renameChat: 'Rename the chat', chatNameLabel: 'Chat name', groupChat: 'Group chat',
  // new chat and people
  newChatTitle: 'New chat', to: 'To', toPlaceholder: 'Type a name', groupName: 'Group name (optional)', startChat: 'Start chat', groupHint: 'With more than one person you create a group chat.',
  noPeople: 'No one found.', pickPeople: 'Choose from the directory…', removePerson: 'Remove {n}', peopleHere: 'People in this chat', removeFromChat: 'Remove from the chat', you2: '{n} (you)',
  addPeopleTitle: 'Add people to the chat', historyAll: 'Include all the chat history', historyWeek: 'Include the last 7 days', historyNone: 'Do not include the history', add: 'Add',
  sysAdded: '{a} added {b}', sysRemoved: '{a} removed {b}', sysLeft: '{a} left the chat', sysRenamed: '{a} named the chat “{b}”', sysUnnamed: '{a} removed the name of the chat',
  // messages
  deletedMsg: 'This message was deleted', importantLabel: 'Important', urgentLabel: 'Urgent', seen: 'Seen', seenBy: 'Seen by {n}', reactedWith: '{n} reacted with {e}', moreEmoji: 'More reactions',
  pinMessage: 'Pin', unpinMessage: 'Unpin', pinnedBy: 'Pinned by {n}', newMessages: 'New messages', editingMessage: 'Editing a message', copyText: 'Copy text', copied: 'Copied',
  chatLoadFailed: 'Could not open the chat: ', notMember: 'You are not in this chat any more.', deletedAuthor: 'Someone',
  // the composer
  composerPlaceholder: 'Type a message', format: 'Format', bold: 'Bold', italic: 'Italic', underline: 'Underline', strike: 'Strikethrough', bullets: 'Bulleted list', numbers: 'Numbered list',
  quote: 'Quote', codeBtn: 'Code', linkBtn: 'Link', emoji: 'Emoji', attach: 'Attach', fromDevice: 'Upload from this device', fromDocs: 'Choose from Documents', importance: 'Importance',
  importanceNormal: 'Normal', removeFile: 'Remove {n}', uploading: 'Uploading {n}…', uploadFailed: 'Could not upload: ', mentionEveryone: 'everyone', mentionList: 'People to mention',
  // files and pinned
  filesEmptyTitle: 'No files yet', filesEmptyText: 'The files attached to messages of this chat show up here.', sharedBy: 'Shared by {n}', openFile: 'Open',
  pinnedEmptyTitle: 'No pinned messages', pinnedEmptyText: 'Pin a message to keep it at hand for everyone in the chat.', docsTitle: 'Choose files from Documents', docsEmpty: 'This folder is empty.',
  docsUp: 'Up', attachSelected: 'Attach', attachFailed: 'Could not attach: ', shareFailed: 'Could not share {n} with the chat: ',
  // search
  searchMessages: 'Search messages', searchNone: 'No messages found.', searchResults: 'Messages', searchClose: 'Close the search',
  // calls
  startedCall: '{n} started a call', startedVoice: '{n} started a voice call', joinCall: 'Join', leaveCall: 'Leave the call', inCall: 'In the call: {n}', callEnded: 'Call ended',
  callEndedLine: 'Call ended · {d}', callJoined: '{n} took part', callFailed: 'Could not start the call: ', callPrivacy: 'The call runs on the Jitsi Meet service: no video goes through Mosaikit.', callTitle: 'Call', callFullscreen: 'Full screen',
}
export type Texts = typeof en
export type L = string

const it: Texts = {
  title: 'Chat', channels: 'Canali', newChannel: 'Nuovo canale', channelName: 'Nome', channelTopic: 'Argomento (facoltativo)', create: 'Crea', save: 'Salva', cancel: 'Annulla', close: 'Chiudi',
  noChannelsTitle: 'Ancora nessun canale', noChannelsText: 'Crea il primo canale, poi condividilo con le persone con cui vuoi parlare.', noChannelOpenTitle: 'Scegli un canale', noChannelOpenText: 'Scegli un canale a sinistra per leggere e scrivere.',
  share: 'Condividi…', rename: 'Modifica il canale', remove: 'Elimina il canale', removeConfirm: 'Eliminare il canale “{n}” con tutti i suoi messaggi?', back: 'Canali',
  placeholder: 'Scrivi un messaggio… (Invio manda, Maiusc+Invio va a capo, il Markdown funziona)', send: 'Invia', readOnly: 'Puoi leggere questo canale ma non scriverci.',
  replyingTo: 'Risposta a {n}', cancelReply: 'Annulla la risposta', reply: 'Rispondi', react: 'Reagisci', edit: 'Modifica', delete: 'Elimina', edited: 'modificato',
  deleteConfirm: 'Eliminare questo messaggio?', online: '{n} online', alone: 'Solo tu', loadOlder: 'Carica i messaggi precedenti', noMessages: 'Ancora nessun messaggio. Saluta!', loading: 'Caricamento…',
  typing1: '{a} sta scrivendo…', typing2: '{a} e {b} stanno scrivendo…', typingMany: 'Più persone stanno scrivendo…',
  today: 'Oggi', yesterday: 'Ieri',
  reconnecting: 'Connessione persa: nuovo tentativo…', gap: 'Alcuni messaggi potrebbero essere andati persi.', closed: 'Non puoi più seguire questo canale.', reload: 'Ricarica', retry: 'Ricarica',
  sendFailed: 'Impossibile inviare il messaggio: ', loadFailed: 'Impossibile caricare: ', youReacted: 'Tu', failed: 'Impossibile avviare la UI del plugin: ',
  you: 'Tu',
  call: 'Avvia una chiamata', callText: '📞 Chiamata avviata: [entra nella chiamata]({url})',
  // Chat 2.0: la lista
  newChat: 'Nuova chat', searchChats: 'Cerca nelle chat', filters: 'Filtra le chat', filterAll: 'Tutte', filterUnread: 'Non lette', filterChats: 'Chat', filterMeetings: 'Riunioni',
  pinnedSection: 'Fissate', recentSection: 'Recenti', noChatsTitle: 'Ancora nessuna chat', noChatsText: 'Avvia una conversazione con un collega, o crea una chat di gruppo.',
  pickChatTitle: 'Scegli una chat', pickChatText: 'Scegli una chat a sinistra, oppure avviane una nuova.', noChatMatch: 'Nessuna chat corrisponde.', moreActions: 'Altre azioni',
  pin: 'Fissa', unpin: 'Non fissare più', mute: 'Silenzia', unmute: 'Riattiva le notifiche', markUnread: 'Segna come non letta', markRead: 'Segna come letta', hideChat: 'Nascondi', leaveChat: 'Esci',
  leaveTitle: 'Uscire da questa chat?', leaveText: 'Non riceverai più i suoi messaggi. Qualcuno può aggiungerti di nuovo.', backToList: 'Torna alle chat',
  presenceAvailable: 'Disponibile', presenceAway: 'Assente', presenceOffline: 'Non in linea', unreadCount: '{n} non letti', mentionedYou: 'Sei stato menzionato', mutedChat: 'Silenziata', pinnedChat: 'Fissata', clearFilters: 'Cancella i filtri',
  tabs: 'Sezioni della chat', tabChat: 'Chat', tabFiles: 'File', tabPinned: 'Fissati', people: 'Persone', addPeople: 'Aggiungi persone', callVideo: 'Videochiamata', callAudio: 'Chiamata audio',
  searchInChat: 'Cerca in questa chat', peopleCount: '{n} persone', renameChat: 'Rinomina la chat', chatNameLabel: 'Nome della chat', groupChat: 'Chat di gruppo',
  newChatTitle: 'Nuova chat', to: 'A', toPlaceholder: 'Scrivi un nome', groupName: 'Nome del gruppo (facoltativo)', startChat: 'Avvia la chat', groupHint: 'Con più di una persona crei una chat di gruppo.',
  noPeople: 'Nessuno trovato.', pickPeople: 'Scegli dalla rubrica…', removePerson: 'Rimuovi {n}', peopleHere: 'Persone in questa chat', removeFromChat: 'Rimuovi dalla chat', you2: '{n} (tu)',
  addPeopleTitle: 'Aggiungi persone alla chat', historyAll: 'Includi tutta la cronologia della chat', historyWeek: 'Includi gli ultimi 7 giorni', historyNone: 'Non includere la cronologia', add: 'Aggiungi',
  sysAdded: '{a} ha aggiunto {b}', sysRemoved: '{a} ha rimosso {b}', sysLeft: '{a} ha lasciato la chat', sysRenamed: '{a} ha chiamato la chat “{b}”', sysUnnamed: '{a} ha tolto il nome della chat',
  deletedMsg: 'Questo messaggio è stato eliminato', importantLabel: 'Importante', urgentLabel: 'Urgente', seen: 'Visto', seenBy: 'Visto da {n}', reactedWith: '{n} ha reagito con {e}', moreEmoji: 'Altre reazioni',
  pinMessage: 'Fissa', unpinMessage: 'Non fissare più', pinnedBy: 'Fissato da {n}', newMessages: 'Nuovi messaggi', editingMessage: 'Modifica di un messaggio', copyText: 'Copia il testo', copied: 'Copiato',
  chatLoadFailed: 'Impossibile aprire la chat: ', notMember: 'Non fai più parte di questa chat.', deletedAuthor: 'Qualcuno',
  composerPlaceholder: 'Scrivi un messaggio', format: 'Formattazione', bold: 'Grassetto', italic: 'Corsivo', underline: 'Sottolineato', strike: 'Barrato', bullets: 'Elenco puntato', numbers: 'Elenco numerato',
  quote: 'Citazione', codeBtn: 'Codice', linkBtn: 'Collegamento', emoji: 'Emoji', attach: 'Allega', fromDevice: 'Carica da questo dispositivo', fromDocs: 'Scegli da Documenti', importance: 'Importanza',
  importanceNormal: 'Normale', removeFile: 'Rimuovi {n}', uploading: 'Caricamento di {n}…', uploadFailed: 'Impossibile caricare: ', mentionEveryone: 'tutti', mentionList: 'Persone da menzionare',
  filesEmptyTitle: 'Ancora nessun file', filesEmptyText: 'I file allegati ai messaggi di questa chat compaiono qui.', sharedBy: 'Condiviso da {n}', openFile: 'Apri',
  pinnedEmptyTitle: 'Nessun messaggio fissato', pinnedEmptyText: 'Fissa un messaggio per tenerlo a portata di mano di tutti nella chat.', docsTitle: 'Scegli file da Documenti', docsEmpty: 'Questa cartella è vuota.',
  docsUp: 'Su', attachSelected: 'Allega', attachFailed: 'Impossibile allegare: ', shareFailed: 'Impossibile condividere {n} con la chat: ',
  searchMessages: 'Cerca nei messaggi', searchNone: 'Nessun messaggio trovato.', searchResults: 'Messaggi', searchClose: 'Chiudi la ricerca',
  startedCall: '{n} ha avviato una chiamata', startedVoice: '{n} ha avviato una chiamata audio', joinCall: 'Entra', leaveCall: 'Esci dalla chiamata', inCall: 'Nella chiamata: {n}', callEnded: 'Chiamata terminata',
  callEndedLine: 'Chiamata terminata · {d}', callJoined: '{n} hanno partecipato', callFailed: 'Impossibile avviare la chiamata: ', callPrivacy: 'La chiamata passa dal servizio Jitsi Meet: nessun video passa da Mosaikit.', callTitle: 'Chiamata', callFullscreen: 'Schermo intero',
}
const es: Texts = {
  title: 'Chat', channels: 'Canales', newChannel: 'Nuevo canal', channelName: 'Nombre', channelTopic: 'Tema (opcional)', create: 'Crear', save: 'Guardar', cancel: 'Cancelar', close: 'Cerrar',
  noChannelsTitle: 'Todavía no hay canales', noChannelsText: 'Crea el primer canal y compártelo con las personas con las que quieres hablar.', noChannelOpenTitle: 'Elige un canal', noChannelOpenText: 'Elige un canal a la izquierda para leer y escribir.',
  share: 'Compartir…', rename: 'Editar el canal', remove: 'Eliminar el canal', removeConfirm: '¿Eliminar el canal “{n}” con todos sus mensajes?', back: 'Canales',
  placeholder: 'Escribe un mensaje… (Intro envía, Mayús+Intro hace una línea nueva, el Markdown funciona)', send: 'Enviar', readOnly: 'Puedes leer este canal pero no escribir en él.',
  replyingTo: 'Respondiendo a {n}', cancelReply: 'Cancelar la respuesta', reply: 'Responder', react: 'Reaccionar', edit: 'Editar', delete: 'Eliminar', edited: 'editado',
  deleteConfirm: '¿Eliminar este mensaje?', online: '{n} en línea', alone: 'Solo tú', loadOlder: 'Cargar mensajes anteriores', noMessages: 'Todavía no hay mensajes. ¡Saluda!', loading: 'Cargando…',
  typing1: '{a} está escribiendo…', typing2: '{a} y {b} están escribiendo…', typingMany: 'Varias personas están escribiendo…',
  today: 'Hoy', yesterday: 'Ayer',
  reconnecting: 'Conexión perdida: reintentando…', gap: 'Puede que se hayan perdido algunos mensajes.', closed: 'Ya no puedes seguir este canal.', reload: 'Recargar', retry: 'Recargar',
  sendFailed: 'No se pudo enviar el mensaje: ', loadFailed: 'No se pudo cargar: ', youReacted: 'Tú', failed: 'No se pudo iniciar la interfaz del plugin: ',
  you: 'Tú',
  call: 'Iniciar una llamada', callText: '📞 Llamada iniciada: [unirse a la llamada]({url})',
  // Chat 2.0: la lista
  newChat: 'Nuevo chat', searchChats: 'Buscar chats', filters: 'Filtrar chats', filterAll: 'Todos', filterUnread: 'Sin leer', filterChats: 'Chats', filterMeetings: 'Reuniones',
  pinnedSection: 'Fijados', recentSection: 'Recientes', noChatsTitle: 'Todavía no hay chats', noChatsText: 'Empieza una conversación con un compañero o crea un chat de grupo.',
  pickChatTitle: 'Elige un chat', pickChatText: 'Elige un chat a la izquierda o empieza uno nuevo.', noChatMatch: 'Ningún chat coincide.', moreActions: 'Más acciones',
  pin: 'Fijar', unpin: 'Dejar de fijar', mute: 'Silenciar', unmute: 'Activar las notificaciones', markUnread: 'Marcar como no leído', markRead: 'Marcar como leído', hideChat: 'Ocultar', leaveChat: 'Salir',
  leaveTitle: '¿Salir de este chat?', leaveText: 'Ya no recibirás sus mensajes. Alguien puede volver a añadirte.', backToList: 'Volver a los chats',
  presenceAvailable: 'Disponible', presenceAway: 'Ausente', presenceOffline: 'Sin conexión', unreadCount: '{n} sin leer', mentionedYou: 'Te han mencionado', mutedChat: 'Silenciado', pinnedChat: 'Fijado', clearFilters: 'Borrar los filtros',
  tabs: 'Secciones del chat', tabChat: 'Chat', tabFiles: 'Archivos', tabPinned: 'Fijados', people: 'Personas', addPeople: 'Añadir personas', callVideo: 'Videollamada', callAudio: 'Llamada de audio',
  searchInChat: 'Buscar en este chat', peopleCount: '{n} personas', renameChat: 'Cambiar el nombre del chat', chatNameLabel: 'Nombre del chat', groupChat: 'Chat de grupo',
  newChatTitle: 'Nuevo chat', to: 'Para', toPlaceholder: 'Escribe un nombre', groupName: 'Nombre del grupo (opcional)', startChat: 'Iniciar el chat', groupHint: 'Con más de una persona creas un chat de grupo.',
  noPeople: 'No se encontró a nadie.', pickPeople: 'Elegir del directorio…', removePerson: 'Quitar a {n}', peopleHere: 'Personas de este chat', removeFromChat: 'Quitar del chat', you2: '{n} (tú)',
  addPeopleTitle: 'Añadir personas al chat', historyAll: 'Incluir todo el historial del chat', historyWeek: 'Incluir los últimos 7 días', historyNone: 'No incluir el historial', add: 'Añadir',
  sysAdded: '{a} añadió a {b}', sysRemoved: '{a} quitó a {b}', sysLeft: '{a} salió del chat', sysRenamed: '{a} llamó al chat “{b}”', sysUnnamed: '{a} quitó el nombre del chat',
  deletedMsg: 'Este mensaje se eliminó', importantLabel: 'Importante', urgentLabel: 'Urgente', seen: 'Visto', seenBy: 'Visto por {n}', reactedWith: '{n} reaccionó con {e}', moreEmoji: 'Más reacciones',
  pinMessage: 'Fijar', unpinMessage: 'Dejar de fijar', pinnedBy: 'Fijado por {n}', newMessages: 'Mensajes nuevos', editingMessage: 'Editando un mensaje', copyText: 'Copiar el texto', copied: 'Copiado',
  chatLoadFailed: 'No se pudo abrir el chat: ', notMember: 'Ya no estás en este chat.', deletedAuthor: 'Alguien',
  composerPlaceholder: 'Escribe un mensaje', format: 'Formato', bold: 'Negrita', italic: 'Cursiva', underline: 'Subrayado', strike: 'Tachado', bullets: 'Lista con viñetas', numbers: 'Lista numerada',
  quote: 'Cita', codeBtn: 'Código', linkBtn: 'Enlace', emoji: 'Emoji', attach: 'Adjuntar', fromDevice: 'Subir desde este dispositivo', fromDocs: 'Elegir de Documentos', importance: 'Importancia',
  importanceNormal: 'Normal', removeFile: 'Quitar {n}', uploading: 'Subiendo {n}…', uploadFailed: 'No se pudo subir: ', mentionEveryone: 'todos', mentionList: 'Personas a mencionar',
  filesEmptyTitle: 'Todavía no hay archivos', filesEmptyText: 'Los archivos adjuntos a los mensajes de este chat aparecen aquí.', sharedBy: 'Compartido por {n}', openFile: 'Abrir',
  pinnedEmptyTitle: 'No hay mensajes fijados', pinnedEmptyText: 'Fija un mensaje para tenerlo a mano de todos en el chat.', docsTitle: 'Elegir archivos de Documentos', docsEmpty: 'Esta carpeta está vacía.',
  docsUp: 'Subir', attachSelected: 'Adjuntar', attachFailed: 'No se pudo adjuntar: ', shareFailed: 'No se pudo compartir {n} con el chat: ',
  searchMessages: 'Buscar mensajes', searchNone: 'No se encontraron mensajes.', searchResults: 'Mensajes', searchClose: 'Cerrar la búsqueda',
  startedCall: '{n} inició una llamada', startedVoice: '{n} inició una llamada de audio', joinCall: 'Unirse', leaveCall: 'Salir de la llamada', inCall: 'En la llamada: {n}', callEnded: 'Llamada terminada',
  callEndedLine: 'Llamada terminada · {d}', callJoined: 'Participaron {n}', callFailed: 'No se pudo iniciar la llamada: ', callPrivacy: 'La llamada se hace en el servicio Jitsi Meet: ningún vídeo pasa por Mosaikit.', callTitle: 'Llamada', callFullscreen: 'Pantalla completa',
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
