// @vitest-environment happy-dom
// The switch between the chats and the channels: which view a place opens, what is remembered, and the tab list itself.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { initialView, loadView, saveView, viewAt, viewByKey, viewKey } from './views-logic.ts'
import { viewSwitch } from './views.ts'

const CH = '0b8e6f5a-1c2d-4e3f-8a9b-0c1d2e3f4a5b'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('places', () => {
  it('the old place of the channels and the id of a channel open the channels', () => {
    expect(viewAt('channels')).toBe('channels')
    expect(viewAt(CH)).toBe('channels')
  })
  it('a chat and the place of the chats open the chats', () => {
    expect(viewAt('chats')).toBe('chats')
    expect(viewAt(`chat/${CH}`)).toBe('chats')
  })
  it('the place wins over the remembered choice; with none the choice, then the chats', () => {
    expect(initialView('channels', 'chats')).toBe('channels')
    expect(initialView(`chat/${CH}`, 'channels')).toBe('chats')
    expect(initialView(undefined, 'channels')).toBe('channels')
    expect(initialView('other', 'bogus')).toBe('chats')
    expect(initialView(undefined, null)).toBe('chats')
  })
})

describe('the choice is remembered per person', () => {
  it('saves and loads, and keeps people apart', () => {
    saveView('u1', 'channels')
    expect(loadView('u1')).toBe('channels')
    expect(loadView('u2')).toBeNull()
    expect(localStorage.getItem(viewKey('u1'))).toBe('channels')
  })
  it('ignores a value that is not a view', () => {
    localStorage.setItem(viewKey('u1'), 'whatever')
    expect(loadView('u1')).toBeNull()
  })
  it('survives a storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(loadView('u1')).toBeNull()
    expect(() => saveView('u1', 'chats')).not.toThrow()
  })
})

describe('keys', () => {
  it('arrows wrap around, Home and End jump, others do nothing', () => {
    expect(viewByKey('ArrowRight', 'chats')).toBe('channels')
    expect(viewByKey('ArrowRight', 'channels')).toBe('chats')
    expect(viewByKey('ArrowLeft', 'chats')).toBe('channels')
    expect(viewByKey('Home', 'channels')).toBe('chats')
    expect(viewByKey('End', 'chats')).toBe('channels')
    expect(viewByKey('a', 'chats')).toBeNull()
  })
})

describe('the tab list', () => {
  const make = (onPick = vi.fn()) => {
    const sw = viewSwitch({ labels: { chats: 'Chats', channels: 'Channels' }, group: 'Chats or channels', value: 'chats', onPick })
    document.body.append(sw.el)
    return { sw, onPick }
  }
  const tab = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('[role=tab]')].find((b) => b.textContent === name)!

  it('has two tabs with icon and label, the chosen one selected and reachable by Tab', () => {
    document.body.replaceChildren()
    make()
    expect(document.querySelector('[role=tablist]')!.getAttribute('aria-label')).toBe('Chats or channels')
    expect(tab('Chats').getAttribute('aria-selected')).toBe('true')
    expect(tab('Chats').tabIndex).toBe(0)
    expect(tab('Channels').getAttribute('aria-selected')).toBe('false')
    expect(tab('Channels').tabIndex).toBe(-1)
    expect(tab('Chats').querySelector('svg')).not.toBeNull()
    expect(tab('Channels').querySelector('svg')).not.toBeNull()
  })
  it('a click picks the other view, a click on the chosen one does nothing', () => {
    document.body.replaceChildren()
    const { onPick } = make()
    tab('Chats').click()
    expect(onPick).not.toHaveBeenCalled()
    tab('Channels').click()
    expect(onPick).toHaveBeenCalledWith('channels')
  })
  it('the arrow keys pick a view; set() changes the mark without picking', () => {
    document.body.replaceChildren()
    const { sw, onPick } = make()
    tab('Chats').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(onPick).toHaveBeenCalledWith('channels')
    onPick.mockClear()
    sw.set('channels')
    expect(tab('Channels').getAttribute('aria-selected')).toBe('true')
    expect(tab('Chats').tabIndex).toBe(-1)
    expect(onPick).not.toHaveBeenCalled()
  })
  it('retitle renames the tabs', () => {
    document.body.replaceChildren()
    const { sw } = make()
    sw.retitle({ chats: 'Chat', channels: 'Canali' }, 'Chat o canali')
    expect(tab('Canali')).toBeDefined()
    expect(document.querySelector('[role=tablist]')!.getAttribute('aria-label')).toBe('Chat o canali')
  })
})
