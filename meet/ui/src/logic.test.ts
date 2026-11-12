import { describe, expect, it } from 'vitest'
import { joinUrl, plainUrl, roomName, SERVICE } from './logic.ts'

const ID = '8b0f6f3e-2d6a-4c7e-9a51-0c6a3d2b1f10'

describe('room address', () => {
  it('names the room after the id, without dashes', () => {
    expect(roomName(ID)).toBe('mosaikit-8b0f6f3e2d6a4c7e9a510c6a3d2b1f10')
    expect(plainUrl(ID)).toBe(`${SERVICE}/mosaikit-8b0f6f3e2d6a4c7e9a510c6a3d2b1f10`)
  })
  it('puts the name of the person in the hash, quoted and encoded', () => {
    const u = joinUrl(ID, 'Ada "Countess" Lovelace')
    expect(u.startsWith(plainUrl(ID) + '#')).toBe(true)
    expect(u).toContain('config.prejoinConfig.enabled=true')
    const hash = decodeURIComponent(new URL(u).hash.slice(1).split('&').find((p) => p.startsWith('userInfo.displayName='))!.split('=')[1]!)
    expect(JSON.parse(hash)).toBe('Ada "Countess" Lovelace')
  })
  it('cannot be turned into another address by a name', () => {
    const u = joinUrl(ID, '/../x?y=1#z&config.foo=bar')
    expect(new URL(u).origin).toBe(SERVICE)
    expect(new URL(u).pathname).toBe('/' + roomName(ID))
    expect(u.split('#').length).toBe(2)
    expect(u).not.toContain('config.foo=bar&')
  })
  it('passes the language of the host', () => {
    expect(joinUrl(ID, 'A', 'it')).toContain('config.defaultLanguage=%22it%22')
  })
})
