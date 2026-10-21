// MapFrame: iframe GeoLibre + ponte di stato (stesso schema di Sestante,
// src/web/src/components/MapFrame.tsx). Usato dall'editor (index.html) e dalla
// vista dei link pubblici (public.html).
//
// ── Il ponte usato ──────────────────────────────────────────────────────────
// GeoLibre espone due ponti postMessage. L'API embed v2 (`{v:2, type, payload}`)
// comanda la mappa ma non sa *leggere* il progetto. Il ponte di stato
// `geolibre:*`, attivo con `?embed=1`, invece lo trasporta:
//   app -> host:  geolibre:ready | geolibre:state {project} | geolibre:error
//   host -> app:  geolibre:request-state | geolibre:load-project {project}
// `geolibre:state` arriva a ogni cambiamento dello store (debounce 250 ms).
// Qui "host" e' la UI del plugin (a sua volta in un iframe di Mosaikit): il
// ponte GeoLibre e il ponte verso Mosaikit sono indipendenti, e ogni
// messaggio si riconosce da origine e finestra di provenienza.
//
// ── Perché tre fasi e non "carica al ready" ─────────────────────────────────
// Un `load-project` inviato troppo presto viene applicato e poi sovrascritto
// dall'avvio dell'app: il livello compare e sparisce, e se quello stato vuoto
// si salva il lavoro e' perso. Quindi:
//   probing    — solo `request-state` (innocuo), ripetuto: la prima risposta
//                certifica che l'avvio e' concluso;
//   restoring  — `load-project` + richiesta di conferma; la conferma si fa
//                sugli id dei livelli (GeoLibre normalizza il JSON), con
//                nuovi tentativi fino a un tetto;
//   live       — solo da qui gli snapshot vengono salvati.
// Per 5 s dopo il ripristino, uno snapshot che perde i livelli ripristinati e'
// letto come sovrascrittura dell'avvio: non si salva e si ricarica.

/** Istanza GeoLibre da incorporare. Hosted = zero configurazione; per una
 * istanza self-hosted basta cambiare questo (e `frame_src` nel manifest). */
export const GEOLIBRE_URL = 'https://web.geolibre.app/'
const THEME = 'dark'
const LOCALE = 'it'

const PROBE_INTERVAL_MS = 600
const PROBE_MAX_ATTEMPTS = 25
const RESTORE_MAX_ATTEMPTS = 5
const CONFIRM_DELAY_MS = 500
const RESTORE_GUARD_MS = 5000

const GEOLIBRE_ORIGIN = (() => {
  try {
    return new URL(GEOLIBRE_URL, window.location.href).origin
  } catch {
    return ''
  }
})()

/** Progetto GeoLibre (.geolibre.json): qui interessano solo i livelli. */
export type Project = { layers?: unknown[]; [k: string]: unknown }

export type Phase = 'closed' | 'probing' | 'restoring' | 'live'

export interface MapFrameOptions {
  /** stato del ponte ("connessione a GeoLibre…", "GeoLibre connesso"...) */
  onStatus?: (text: string) => void
  /** errori riportati da GeoLibre */
  onError?: (text: string) => void
}

/**
 * Identificativi dei livelli, ordinati: la firma con cui si riconosce se un
 * ripristino ha attecchito. Il JSON non si puo' confrontare perche' GeoLibre
 * lo normalizza al caricamento; gli id dei livelli sopravvivono.
 */
export function layerIds(project: unknown): string[] {
  const layers = project && typeof project === 'object' ? (project as Project).layers : undefined
  if (!Array.isArray(layers)) return []
  return layers
    .map((l) => (l && typeof l === 'object' && typeof (l as { id?: unknown }).id === 'string' ? (l as { id: string }).id : ''))
    .filter(Boolean)
    .sort()
}

function containsAll(arrived: string[], wanted: string[]): boolean {
  return wanted.every((id) => arrived.includes(id))
}

export class MapFrame {
  readonly iframe: HTMLIFrameElement
  private _phase: Phase = 'closed'
  /** ultimo progetto noto */
  private _project: Project | null = null
  private restoreAttempts = 0
  private restoreTarget: string[] = []
  private guardUntil = 0
  private probeTimer: ReturnType<typeof setInterval> | undefined
  private confirmTimer: ReturnType<typeof setTimeout> | undefined
  /** chiamato solo sugli snapshot da persistere (fase live) */
  private onChange: ((project: Project) => void) | null = null
  private disposed = false
  private readonly listener = (ev: MessageEvent) => this.onBridgeMessage(ev)

  constructor(private readonly opts: MapFrameOptions = {}) {
    const f = document.createElement('iframe')
    f.className = 'gframe'
    f.title = 'GeoLibre'
    f.setAttribute('allow', 'fullscreen; geolocation')
    f.setAttribute('loading', 'eager')
    this.iframe = f
    window.addEventListener('message', this.listener)
  }

  get phase(): Phase {
    return this._phase
  }

  get project(): Project | null {
    return this._project
  }

  private status(t: string) {
    this.opts.onStatus?.(t)
  }

  private post(message: unknown) {
    const win = this.iframe.contentWindow
    if (win && GEOLIBRE_ORIGIN) win.postMessage(message, GEOLIBRE_ORIGIN)
  }

  /** Sonda innocua: chiede uno snapshot e fa conoscere al ponte la nostra origine. */
  private probe() {
    if (this._phase !== 'probing') return
    this.post({ type: 'geolibre:request-state' })
  }

  /** Spinge il progetto salvato e programma la richiesta di conferma. */
  private restore() {
    const project = this._project
    if (!project || this.restoreAttempts >= RESTORE_MAX_ATTEMPTS) {
      // Oltre il tetto si smette di litigare con l'app: meglio una mappa vuota
      // visibile che un ciclo di ricaricamenti. Il progetto resta nel record.
      if (project) console.warn(`[maps] ripristino non confermato dopo ${RESTORE_MAX_ATTEMPTS} tentativi`)
      this._phase = 'live'
      return
    }
    this._phase = 'restoring'
    this.restoreAttempts += 1
    this.restoreTarget = layerIds(project)
    this.post({ type: 'geolibre:load-project', project })
    clearTimeout(this.confirmTimer)
    this.confirmTimer = setTimeout(() => this.post({ type: 'geolibre:request-state' }), CONFIRM_DELAY_MS)
  }

  private frameSource(readOnly: boolean): string {
    const url = new URL(GEOLIBRE_URL, window.location.href)
    url.searchParams.set('theme', THEME)
    url.searchParams.set('lang', LOCALE)
    url.searchParams.set('locale', LOCALE)
    // Attiva il ponte di stato: senza, il progetto non si legge ne' si ricarica.
    url.searchParams.set('embed', '1')
    if (readOnly) url.searchParams.set('layout', 'viewer')
    return url.toString()
  }

  /**
   * Apre GeoLibre e ripristina `project`. `onChange` riceve gli snapshot da
   * salvare (solo in fase live); `null` = sola lettura senza salvataggi.
   */
  open(project: Project | null, readOnly: boolean, onChange: ((project: Project) => void) | null) {
    if (this.disposed) return
    this.close()
    this._phase = 'probing'
    this._project = project ?? null
    this.restoreAttempts = 0
    this.restoreTarget = []
    this.guardUntil = 0
    this.onChange = onChange
    this.status('connessione a GeoLibre…')

    // `geolibre:ready` arriva una volta sola e puo' sfuggire: si sonda a ripetizione.
    let attempts = 0
    this.probeTimer = setInterval(() => {
      attempts += 1
      if (this._phase !== 'probing' || attempts > PROBE_MAX_ATTEMPTS) {
        clearInterval(this.probeTimer)
        if (this._phase === 'probing') this.status('GeoLibre non risponde: verifica rete o ad-blocker')
        return
      }
      this.probe()
    }, PROBE_INTERVAL_MS)

    this.iframe.onload = () => this.probe()
    this.iframe.src = this.frameSource(readOnly)
  }

  close() {
    clearInterval(this.probeTimer)
    clearTimeout(this.confirmTimer)
    this._phase = 'closed'
    this.onChange = null
    this.iframe.onload = null
    if (this.iframe.getAttribute('src') !== 'about:blank') this.iframe.src = 'about:blank'
    this.status('')
  }

  /**
   * Inserisce un livello nel progetto vivo e lo ricarica (`load-project` e'
   * l'unico ingresso del ponte di stato). Rifiuta prima della fase `live`: il
   * progetto in mano non e' ancora quello definitivo e verrebbe sovrascritto.
   */
  addLayer(layer: unknown): boolean {
    if (this._phase !== 'live') return false
    const current = this._project ?? {}
    const layers = Array.isArray(current.layers) ? current.layers : []
    const next: Project = { ...current, layers: [...layers, layer] }
    this._project = next
    this.post({ type: 'geolibre:load-project', project: next })
    // Si persiste subito: lo snapshot che tornera' lo confermera' e basta.
    this.onChange?.(next)
    return true
  }

  private onBridgeMessage(ev: MessageEvent) {
    // Due controlli: l'origine attesa e che il messaggio venga dal nostro iframe.
    if (ev.origin !== GEOLIBRE_ORIGIN) return
    if (ev.source !== this.iframe.contentWindow) return
    if (this._phase === 'closed') return
    const data = ev.data as { type?: unknown; project?: unknown; message?: unknown } | null
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') return

    if (data.type === 'geolibre:ready') {
      this.status('GeoLibre connesso')
      this.probe()
      return
    }
    if (data.type === 'geolibre:error') {
      this.opts.onError?.('GeoLibre: ' + (typeof data.message === 'string' && data.message ? data.message : 'errore sconosciuto'))
      return
    }
    if (data.type !== 'geolibre:state' || !('project' in data)) return
    this.status('GeoLibre connesso')
    const project = data.project as Project
    const arrived = layerIds(project)

    if (this._phase === 'probing') {
      // Prima risposta: l'avvio dell'app e' concluso.
      const wanted = layerIds(this._project)
      if (wanted.length > 0 && !containsAll(arrived, wanted)) {
        this.restore()
        return
      }
      this._phase = 'live'
      this._project = project
      this.onChange?.(project)
      return
    }

    if (this._phase === 'restoring') {
      if (containsAll(arrived, this.restoreTarget)) {
        this._phase = 'live'
        this.guardUntil = Date.now() + RESTORE_GUARD_MS
        this._project = project
        // Non si persiste: e' il progetto gia' salvato.
        return
      }
      // I nostri livelli non ci sono: l'avvio li ha sovrascritti. Si riprova.
      this.restore()
      return
    }

    // live, ancora sotto sorveglianza: la perdita dei livelli appena
    // ripristinati non e' una scelta dell'utente, e' l'avvio dell'app.
    if (Date.now() < this.guardUntil && this.restoreTarget.length > 0 && !containsAll(arrived, this.restoreTarget)) {
      this.restore()
      return
    }

    this._project = project
    this.onChange?.(project)
  }

  /** Stacca il ponte e ferma i timer (la pagina sta per chiudersi). */
  dispose() {
    if (this.disposed) return
    this.disposed = true
    window.removeEventListener('message', this.listener)
    clearInterval(this.probeTimer)
    clearTimeout(this.confirmTimer)
    this._phase = 'closed'
    this.onChange = null
  }
}

/** Progetto salvato nel campo `config`; `null` se vuoto o non valido. */
export function parseProject(raw: unknown): Project | null {
  const s = raw == null ? '' : String(raw)
  if (!s.trim()) return null
  try {
    const p: unknown = JSON.parse(s)
    return p && typeof p === 'object' && !Array.isArray(p) ? (p as Project) : null
  } catch (e) {
    console.error('[maps] config non valida nel record', e)
    return null
  }
}
