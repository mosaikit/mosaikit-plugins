// The address of a room on the meeting service. Pure functions, no DOM.

/** The service that runs the call; it is also the only origin the manifest lets the page embed (`permissions.frame_src`). */
export const SERVICE = 'https://meet.jit.si'

/** The name of the room on the service: made from the id of the item, which nobody can guess, so only the people who see the
 *  room in Mosaikit know where it is. */
export function roomName(id: string): string {
  return 'mosaikit-' + id.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

/** The address that opens the room for `person`: their name on the screen of the call, the pre-join page to check the devices. */
export function joinUrl(id: string, person: string, lang?: string): string {
  const hash = [
    'config.prejoinConfig.enabled=true',
    'config.disableDeepLinking=true',
    `userInfo.displayName=${encodeURIComponent(JSON.stringify(person.slice(0, 80)))}`,
    ...(lang ? [`config.defaultLanguage=${encodeURIComponent(JSON.stringify(lang))}`] : []),
  ].join('&')
  return `${SERVICE}/${roomName(id)}#${hash}`
}

/** The address to share or open in a new tab (no name in it). */
export const plainUrl = (id: string) => `${SERVICE}/${roomName(id)}`
