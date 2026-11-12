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
}
export type Texts = typeof en
export type L = 'en' | 'it' | 'es'

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
}
export const TEXTS: Record<L, Texts> = { en, it, es }

export const langOf = (l: string | undefined): L => {
  const x = (l ?? navigator.language).toLowerCase()
  return x.startsWith('it') ? 'it' : x.startsWith('es') ? 'es' : 'en'
}
export const sub = (t: string, vars: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))
