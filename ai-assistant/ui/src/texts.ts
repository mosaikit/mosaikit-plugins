import type { Msk } from '@mosaikit/plugin-api'
// The texts of the AI Assistant UI (English by default; Italian follows the language of the host, the other languages come
// from the language plugins through `msk.t`).
const en = {
  title: 'AI Assistant', newChat: 'New chat', history: 'Chats', settings: 'Tokens and settings', back: 'Back to the chat',
  placeholder: 'Ask about your data, your KPIs, or ask me to create something…', send: 'Send', thinking: 'Thinking…',
  emptyTitle: 'How can I help?', emptyText: 'Ask about your tenant, read the KPIs, search your items or have something created. I work with your own rights and you confirm every change.',
  s1: 'How is my tenant doing?', s2: 'Which apps are on in my tenant?', s3: 'How much space am I using?', s4: 'Search my items for “budget”',
  offTitle: 'The assistant is not set up', offText: 'The Administrator has to choose a language model in System › AI assistant before it can answer.',
  tool: 'Used', toolWaiting: 'Waiting for you', toolFailed: 'Failed', show: 'Details', hide: 'Hide',
  proposal: 'Proposed change', run: 'Review and run', dismiss: 'Dismiss', declined: 'The person declined this change.', ran: 'Done',
  noChats: 'No saved chats yet.', rename: 'Rename', remove: 'Delete', renamePrompt: 'Name of the chat', removeTitle: 'Delete this chat?', removeText: 'The chat “{n}” is deleted for good.', cancel: 'Cancel', save: 'Save',
  failed: 'Could not start the assistant: ', loadFailed: 'Could not load the chats: ', sendFailed: 'The assistant could not answer: ',
  tokensTitle: 'Access tokens for outside AI clients', tokensText: 'An outside AI client such as Claude Desktop can use the same tools through the MCP server of this tenant. A token works only here, with your rights; it is read-only unless you turn writes on.',
  tConnector: 'Claude Desktop and other clients can also connect with the address alone (Settings › Connectors › Add custom connector): you approve the access in the browser and it appears below.',
  createLead: 'Creates an item of «{subject}».', changeLead: 'Changes an item of «{subject}».',
  yes: 'Yes', no: 'No', createIn: 'Create in {app}', changeIn: 'Change in {app}', runIn: 'Run in {app}', rawData: 'Raw data',
  model: 'Model', modelDefault: 'default', stop: 'Stop', stopped: 'Stopped after {t}', stoppedShort: 'Stopped',
  attach: 'Attach files', removeFile: 'Remove the file', tooManyFiles: 'At most {n} files in a message.', fileType: '“{n}” cannot be attached: images, PDF and text files only.', fileTooBig: '“{n}” is too large (at most {max}).',
  mic: 'Speak', micStop: 'Stop listening', micUnsupported: 'This browser has no speech recognition', micDenied: 'The microphone is not allowed. Allow it for this site in the browser, then try again.', micNetwork: 'Speech recognition needs an internet connection (the browser sends the audio to its speech service).', micFailed: 'Speech recognition failed',
  tName: 'Name of the token', tNamePlaceholder: 'e.g. Claude Desktop', tWrite: 'May change data', tDays: 'Valid for (days)', tCreate: 'Create token',
  tNone: 'No tokens yet.', tRevoke: 'Revoke', tCreated: 'Created {d}', tUsed: 'last used {d}', tNeverUsed: 'never used', tExpires: 'expires {d}', tReadOnly: 'read-only', tWrites: 'may write',
  tShownOnce: 'Copy it now: it is shown only once.', tServer: 'Address of the MCP server', tConfig: 'Settings for Claude Desktop (claude_desktop_config.json)', copy: 'Copy', copied: 'Copied',
  tRevokeTitle: 'Revoke this token?', tRevokeText: 'The client that uses “{n}” stops working at once.', tCreateFailed: 'Could not create the token: ',
  keyTitle: 'Key of this tenant', keyText: 'The Administrator allows this tenant to bring its own key. The cost and the data go to your account at the provider.',
  kProvider: 'Provider', kModel: 'Model', kKey: 'Key', kKeySaved: 'A key is saved: write another to replace it', kSave: 'Save the key', kClear: 'Use the platform key', kSaved: 'Saved', kCleared: 'The platform key is used again',
  usingPlatform: 'Using the key of the platform', usingTenant: 'Using the key of this tenant',
}
export type Texts = typeof en

const it: Texts = {
  title: 'Assistente AI', newChat: 'Nuova chat', history: 'Chat', settings: 'Token e impostazioni', back: 'Torna alla chat',
  placeholder: 'Chiedi dei tuoi dati, dei KPI, o chiedimi di creare qualcosa…', send: 'Invia', thinking: 'Sto pensando…',
  emptyTitle: 'Come posso aiutarti?', emptyText: 'Chiedi del tuo tenant, leggi i KPI, cerca tra i tuoi elementi o fai creare qualcosa. Lavoro con i tuoi diritti e confermi tu ogni modifica.',
  s1: 'Come sta andando il mio tenant?', s2: 'Quali app sono attive nel mio tenant?', s3: 'Quanto spazio sto usando?', s4: 'Cerca nei miei elementi “budget”',
  offTitle: 'L’assistente non è configurato', offText: 'L’Amministratore deve scegliere un modello linguistico in Sistema › Assistente AI prima che possa rispondere.',
  tool: 'Ho usato', toolWaiting: 'In attesa di te', toolFailed: 'Non riuscito', show: 'Dettagli', hide: 'Nascondi',
  proposal: 'Modifica proposta', run: 'Controlla ed esegui', dismiss: 'Scarta', declined: 'La persona ha rifiutato questa modifica.', ran: 'Fatto',
  noChats: 'Nessuna chat salvata.', rename: 'Rinomina', remove: 'Elimina', renamePrompt: 'Nome della chat', removeTitle: 'Eliminare questa chat?', removeText: 'La chat “{n}” viene eliminata per sempre.', cancel: 'Annulla', save: 'Salva',
  failed: 'Impossibile avviare l’assistente: ', loadFailed: 'Impossibile caricare le chat: ', sendFailed: 'L’assistente non ha potuto rispondere: ',
  tokensTitle: 'Token di accesso per client AI esterni', tokensText: 'Un client AI esterno come Claude Desktop può usare gli stessi strumenti tramite il server MCP di questo tenant. Un token funziona solo qui, con i tuoi diritti; è di sola lettura salvo che attivi la scrittura.',
  tConnector: 'Claude Desktop e altri client possono anche collegarsi con il solo indirizzo (Impostazioni › Connettori › Aggiungi connettore personalizzato): approvi l’accesso nel browser e compare qui sotto.',
  createLead: 'Crea un elemento di «{subject}».', changeLead: 'Modifica un elemento di «{subject}».',
  yes: 'Sì', no: 'No', createIn: 'Crea in {app}', changeIn: 'Modifica in {app}', runIn: 'Esegui in {app}', rawData: 'Dati grezzi',
  model: 'Modello', modelDefault: 'predefinito', stop: 'Interrompi', stopped: 'Interrotta dopo {t}', stoppedShort: 'Interrotta',
  attach: 'Allega file', removeFile: 'Rimuovi il file', tooManyFiles: 'Al massimo {n} file per messaggio.', fileType: '“{n}” non si può allegare: solo immagini, PDF e file di testo.', fileTooBig: '“{n}” è troppo grande (al massimo {max}).',
  mic: 'Parla', micStop: 'Smetti di ascoltare', micUnsupported: 'Questo browser non ha il riconoscimento vocale', micDenied: 'Il microfono non è consentito. Consentilo per questo sito nel browser e riprova.', micNetwork: 'Il riconoscimento vocale richiede una connessione a Internet (il browser invia l’audio al suo servizio vocale).', micFailed: 'Riconoscimento vocale non riuscito',
  tName: 'Nome del token', tNamePlaceholder: 'es. Claude Desktop', tWrite: 'Può modificare i dati', tDays: 'Valido per (giorni)', tCreate: 'Crea token',
  tNone: 'Ancora nessun token.', tRevoke: 'Revoca', tCreated: 'Creato {d}', tUsed: 'ultimo uso {d}', tNeverUsed: 'mai usato', tExpires: 'scade {d}', tReadOnly: 'sola lettura', tWrites: 'può scrivere',
  tShownOnce: 'Copialo ora: viene mostrato una sola volta.', tServer: 'Indirizzo del server MCP', tConfig: 'Impostazioni per Claude Desktop (claude_desktop_config.json)', copy: 'Copia', copied: 'Copiato',
  tRevokeTitle: 'Revocare questo token?', tRevokeText: 'Il client che usa “{n}” smette subito di funzionare.', tCreateFailed: 'Impossibile creare il token: ',
  keyTitle: 'Chiave di questo tenant', keyText: 'L’Amministratore permette a questo tenant di portare una chiave propria. Il costo e i dati vanno sul tuo account presso il provider.',
  kProvider: 'Provider', kModel: 'Modello', kKey: 'Chiave', kKeySaved: 'Una chiave è salvata: scrivine un’altra per sostituirla', kSave: 'Salva la chiave', kClear: 'Usa la chiave della piattaforma', kSaved: 'Salvato', kCleared: 'Si usa di nuovo la chiave della piattaforma',
  usingPlatform: 'Si usa la chiave della piattaforma', usingTenant: 'Si usa la chiave di questo tenant',
}

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
const tables: Record<string, Texts> = { en, it }
export const TEXTS = new Proxy(tables, {
  get: (t, code) => (typeof code !== 'string' ? undefined : host && !(code in t) ? translated(code, host) : (t[code] ?? en)),
}) as Record<string, Texts>

/** The code of the language (`es`, `ar`…), `en` when none is known. */
export const langOf = (l: string | undefined): string => ((l ?? (typeof navigator === 'undefined' ? '' : navigator.language)).toLowerCase().split('-')[0] || 'en')
export const sub = (t: string, vars: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))
