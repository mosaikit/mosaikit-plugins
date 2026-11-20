// The services that run a group call. A call message says which one it uses (`meta.engine`), so a chat can hold calls of
// different engines and a new engine is one more entry here (plugins-plan §8.5). Only Jitsi Meet is implemented: the
// call opens inside the page from the address built here, in a frame the manifest allows (`permissions.frame_src`).

export interface CallOptions {
  /** voice only: the camera stays off */
  audioOnly: boolean
  lang?: string
}

export interface CallEngine {
  id: string
  label: string
  /** the origin the frame needs in `permissions.frame_src` */
  origin: string
  /** the address that opens the call for `person` in the room named by the call message */
  embedUrl(room: string, person: string, opts: CallOptions): string
  /** what the frame may use: camera, microphone, screen */
  allow: string
}

const JITSI = 'https://meet.jit.si'

export const jitsi: CallEngine = {
  id: 'jitsi',
  label: 'Jitsi Meet',
  origin: JITSI,
  allow: 'camera; microphone; display-capture; fullscreen; autoplay; clipboard-write',
  embedUrl(room, person, opts) {
    const hash = [
      'config.prejoinConfig.enabled=true',
      'config.disableDeepLinking=true',
      `userInfo.displayName=${encodeURIComponent(JSON.stringify(person.slice(0, 80)))}`,
      ...(opts.audioOnly ? ['config.startAudioOnly=true', 'config.startWithVideoMuted=true'] : []),
      ...(opts.lang ? [`config.defaultLanguage=${encodeURIComponent(JSON.stringify(opts.lang))}`] : []),
    ].join('&')
    return `${JITSI}/${room.replace(/[^a-z0-9-]/gi, '')}#${hash}`
  },
}

/** The engines this build can run, by the name stored in the call message. LiveKit would be registered here. */
export const ENGINES: Record<string, CallEngine> = { jitsi }

/** The engine of a call message; none when this build does not know it (the Join button then says so). */
export const engineFor = (id: unknown): CallEngine | null => ENGINES[typeof id === 'string' && id ? id : 'jitsi'] ?? null
