import { describe, expect, it } from 'vitest'
import { canChangeApprovers, canMove, removable, addApprover, approversJson, inTab, listOrder, markOf, modeOf, moveApprover, removeApprover, stateOf, todoCount, waitingNames, type ApproverView, type ItemLike } from './logic.ts'

const i = (id: string, state: ItemLike['state'], o: Partial<ItemLike> = {}): ItemLike => ({ id, ownerId: 'u1', state, todo: false, createdAt: '2026-05-01T10:00:00Z', ...o })
const p = (n: string) => ({ id: `id-${n}`, name: n })

describe('tabs', () => {
  const list = [i('a', 'pending', { todo: true }), i('b', 'approved', { ownerId: 'u2' }), i('c', 'pending')]
  it('shows what waits for me, what I asked, or everything', () => {
    expect(inTab(list, 'todo', 'u1').map((x) => x.id)).toEqual(['a'])
    expect(inTab(list, 'mine', 'u1').map((x) => x.id)).toEqual(['a', 'c'])
    expect(inTab(list, 'all', 'u1')).toHaveLength(3)
    expect(todoCount(list)).toBe(1)
  })
})

describe('listOrder', () => {
  it('puts pending first, then approved, rejected and cancelled, the newest first inside each', () => {
    const list = [i('a', 'cancelled'), i('b', 'pending', { createdAt: '2026-05-01T09:00:00Z' }), i('c', 'rejected'), i('d', 'pending', { createdAt: '2026-05-02T09:00:00Z' }), i('e', 'approved')]
    expect(listOrder(list).map((x) => x.id)).toEqual(['d', 'b', 'e', 'c', 'a'])
  })
  it('does not change the list it is given', () => {
    const list = [i('a', 'cancelled'), i('b', 'pending')]
    listOrder(list)
    expect(list.map((x) => x.id)).toEqual(['a', 'b'])
  })
})

describe('approvers of a new request', () => {
  it('adds at the end, never twice, never more than ten', () => {
    let l = addApprover([], p('a'))
    l = addApprover(l, p('b'))
    expect(addApprover(l, p('a')).map((x) => x.name)).toEqual(['a', 'b'])
    for (let n = 0; n < 12; n++) l = addApprover(l, p(`x${n}`))
    expect(l).toHaveLength(10)
  })
  it('removes and moves, and writes the JSON of the field', () => {
    const l = [p('a'), p('b'), p('c')]
    expect(removeApprover(l, 'id-b').map((x) => x.name)).toEqual(['a', 'c'])
    expect(moveApprover(l, 'id-c', -1).map((x) => x.name)).toEqual(['a', 'c', 'b'])
    expect(moveApprover(l, 'id-a', -1)).toBe(l)
    expect(moveApprover(l, 'id-c', 1)).toBe(l)
    expect(JSON.parse(approversJson([{ id: 'x', name: 'Y', extra: 1 } as never]))).toEqual([{ id: 'x', name: 'Y' }])
  })
})

describe('words of the data', () => {
  it('knows four states and three modes', () => {
    expect(stateOf('approved')).toBe('approved')
    expect(stateOf('?')).toBe('pending')
    expect(modeOf('sequence')).toBe('sequence')
    expect(modeOf('')).toBe('all')
  })
  it('marks an approver by the verdict', () => {
    expect(markOf({ verdict: 'approved' }).mark).toBe('✓')
    expect(markOf({ verdict: 'rejected' }).kind).toBe('rejected')
    expect(markOf({ verdict: null }).mark).toBe('…')
  })
  it('names who is up', () => {
    const a = (name: string, waiting: boolean): ApproverView => ({ id: name, name, verdict: null, comment: '', decided_at: null, waiting })
    expect(waitingNames([a('A', false), a('B', true), a('C', true)])).toEqual(['B', 'C'])
  })
})

describe('changing the approvers', () => {
  const list = [
    { id: 'a', verdict: 'approved' as const },
    { id: 'b', verdict: null },
    { id: 'c', verdict: null },
  ]
  it('is for an open request and a person who can write it', () => {
    expect(canChangeApprovers('pending', 'write')).toBe(true)
    expect(canChangeApprovers('pending', 'manage')).toBe(true)
    expect(canChangeApprovers('pending', 'read')).toBe(false)
    expect(canChangeApprovers('approved', 'manage')).toBe(false)
    expect(canChangeApprovers('cancelled', 'write')).toBe(false)
  })
  it('keeps the people who decided', () => {
    expect(removable(list, 'a')).toBe(false)
    expect(removable(list, 'b')).toBe(true)
  })
  it('moves only the people who did not decide, and only among them', () => {
    expect(canMove(list, 'b', -1)).toBe(false)
    expect(canMove(list, 'b', 1)).toBe(true)
    expect(canMove(list, 'c', 1)).toBe(false)
    expect(canMove(list, 'a', 1)).toBe(false)
  })
})
