// MapFrame: GeoLibre iframe + state bridge (the same scheme as Sestante,
// src/web/src/components/MapFrame.tsx). Used by the editor (index.html) and by the
// view of the public links (public.html).
//
// ── The bridge in use ───────────────────────────────────────────────────────
// GeoLibre exposes two postMessage bridges. The embed API v2 (`{v:2, type, payload}`)
// drives the map but cannot *read* the project. The state bridge `geolibre:*`,
// on with `?embed=1`, carries it instead:
//   app -> host:  geolibre:ready | geolibre:state {project} | geolibre:error
//   host -> app:  geolibre:request-state | geolibre:load-project {project}
// `geolibre:state` arrives at every change of the store (debounce 250 ms).
// Here "host" is the UI of the plugin (itself in an iframe of Mosaikit): the
// GeoLibre bridge and the bridge to Mosaikit are independent, and every
// message is recognized by its origin and source window.
//
// ── Why three phases and not "load at ready" ────────────────────────────────
// A `load-project` sent too early is applied and then overwritten by the start
// of the app: the layer shows up and disappears, and if that empty state is
// saved the work is lost. So:
//   probing    — only `request-state` (harmless), repeated: the first answer
//                proves the start is over;
//   restoring  — `load-project` + request of a confirmation; the confirmation
//                checks the ids of the layers (GeoLibre normalizes the JSON),
//                with new attempts up to a ceiling;
//   live       — only from here the snapshots are saved.
// For 5 s after the restore, a snapshot that loses the restored layers is read
// as the start overwriting them: it is not saved and the project is loaded again.

import { getLang, t } from './i18n.ts'

/** GeoLibre instance to embed. Hosted = no configuration; for a self-hosted
 * instance change this (and `frame_src` in the manifest). */
export const GEOLIBRE_URL = 'https://web.geolibre.app/'
const THEME = 'dark'

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

/** GeoLibre project (.geolibre.json): only the layers matter here. */
export type Project = { layers?: unknown[]; [k: string]: unknown }

export type Phase = 'closed' | 'probing' | 'restoring' | 'live'

export interface MapFrameOptions {
  /** state of the bridge ("connecting to GeoLibre…", "GeoLibre connected"...) */
  onStatus?: (text: string) => void
  /** errors reported by GeoLibre */
  onError?: (text: string) => void
}

/**
 * Ids of the layers, sorted: the signature that tells whether a restore took.
 * The JSON cannot be compared because GeoLibre normalizes it when loading; the
 * ids of the layers survive.
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
  /** last known project */
  private _project: Project | null = null
  private restoreAttempts = 0
  private restoreTarget: string[] = []
  private guardUntil = 0
  private probeTimer: ReturnType<typeof setInterval> | undefined
  private confirmTimer: ReturnType<typeof setTimeout> | undefined
  /** called only on the snapshots to persist (live phase) */
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

  /** Harmless probe: asks for a snapshot and lets the bridge know our origin. */
  private probe() {
    if (this._phase !== 'probing') return
    this.post({ type: 'geolibre:request-state' })
  }

  /** Pushes the saved project and schedules the request of a confirmation. */
  private restore() {
    const project = this._project
    if (!project || this.restoreAttempts >= RESTORE_MAX_ATTEMPTS) {
      // Past the ceiling we stop fighting the app: better a visible empty map
      // than a loop of reloads. The project stays in the record.
      if (project) console.warn(`[maps] restore not confirmed after ${RESTORE_MAX_ATTEMPTS} attempts`)
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
    // GeoLibre in the language of the host
    url.searchParams.set('lang', getLang())
    url.searchParams.set('locale', getLang())
    // Turns on the state bridge: without it the project is neither read nor loaded again.
    url.searchParams.set('embed', '1')
    if (readOnly) url.searchParams.set('layout', 'viewer')
    return url.toString()
  }

  /**
   * Opens GeoLibre and restores `project`. `onChange` receives the snapshots to
   * save (only in the live phase); `null` = read only, without saving.
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
    this.status(t('connecting to GeoLibre…'))

    // `geolibre:ready` arrives only once and can be missed: we probe again and again.
    let attempts = 0
    this.probeTimer = setInterval(() => {
      attempts += 1
      if (this._phase !== 'probing' || attempts > PROBE_MAX_ATTEMPTS) {
        clearInterval(this.probeTimer)
        if (this._phase === 'probing') this.status(t('GeoLibre does not answer: check the network or the ad blocker'))
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
   * Adds a layer to the live project and loads it again (`load-project` is the
   * only way in of the state bridge). Refused before the `live` phase: the
   * project at hand is not the final one yet and would be overwritten.
   */
  addLayer(layer: unknown): boolean {
    if (this._phase !== 'live') return false
    const current = this._project ?? {}
    const layers = Array.isArray(current.layers) ? current.layers : []
    const next: Project = { ...current, layers: [...layers, layer] }
    this._project = next
    this.post({ type: 'geolibre:load-project', project: next })
    // Persisted at once: the snapshot coming back will just confirm it.
    this.onChange?.(next)
    return true
  }

  private onBridgeMessage(ev: MessageEvent) {
    // Two checks: the expected origin, and that the message comes from our iframe.
    if (ev.origin !== GEOLIBRE_ORIGIN) return
    if (ev.source !== this.iframe.contentWindow) return
    if (this._phase === 'closed') return
    const data = ev.data as { type?: unknown; project?: unknown; message?: unknown } | null
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') return

    if (data.type === 'geolibre:ready') {
      this.status(t('GeoLibre connected'))
      this.probe()
      return
    }
    if (data.type === 'geolibre:error') {
      this.opts.onError?.('GeoLibre: ' + (typeof data.message === 'string' && data.message ? data.message : t('unknown error')))
      return
    }
    if (data.type !== 'geolibre:state' || !('project' in data)) return
    this.status(t('GeoLibre connected'))
    const project = data.project as Project
    const arrived = layerIds(project)

    if (this._phase === 'probing') {
      // First answer: the start of the app is over.
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
        // Not persisted: it is the project already saved.
        return
      }
      // Our layers are not there: the start overwrote them. Try again.
      this.restore()
      return
    }

    // live, still under watch: losing the layers just restored is not a choice
    // of the user, it is the start of the app.
    if (Date.now() < this.guardUntil && this.restoreTarget.length > 0 && !containsAll(arrived, this.restoreTarget)) {
      this.restore()
      return
    }

    this._project = project
    this.onChange?.(project)
  }

  /** Detaches the bridge and stops the timers (the page is about to close). */
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

/** Project saved in the `config` field; `null` if empty or invalid. */
export function parseProject(raw: unknown): Project | null {
  const s = raw == null ? '' : String(raw)
  if (!s.trim()) return null
  try {
    const p: unknown = JSON.parse(s)
    return p && typeof p === 'object' && !Array.isArray(p) ? (p as Project) : null
  } catch (e) {
    console.error('[maps] invalid config in the record', e)
    return null
  }
}
