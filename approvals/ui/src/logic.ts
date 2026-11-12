// What the list of requests decides, with no DOM: the tabs, the order, the approvers of a new request and the marks.

export type State = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type Tab = 'todo' | 'mine' | 'all'
export type Mode = 'any' | 'all' | 'sequence'

export interface Person {
  id: string
  name: string
}

export interface ApproverView extends Person {
  verdict: 'approved' | 'rejected' | null
  comment: string
  decided_at: string | null
  waiting: boolean
}

export interface ItemLike {
  id: string
  ownerId: string
  state: State
  todo: boolean
  createdAt: string
}

export const MAX_APPROVERS = 10

/** The state as one of the four (anything else is pending). */
export function stateOf(v: unknown): State {
  return v === 'approved' || v === 'rejected' || v === 'cancelled' ? v : 'pending'
}

export function modeOf(v: unknown): Mode {
  return v === 'any' || v === 'sequence' ? v : 'all'
}

/** The requests of a tab: those waiting for me, those I asked, or all of them. */
export function inTab<T extends ItemLike>(list: T[], tab: Tab, me: string): T[] {
  if (tab === 'todo') return list.filter((i) => i.todo)
  if (tab === 'mine') return list.filter((i) => i.ownerId === me)
  return list
}

const RANK: Record<State, number> = { pending: 0, approved: 1, rejected: 2, cancelled: 3 }

/** Pending first, then the decided ones, then the cancelled; the newest first inside each. A stable order. */
export function listOrder<T extends ItemLike>(list: T[]): T[] {
  return [...list].sort((a, b) => RANK[a.state] - RANK[b.state] || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
}

export function todoCount(list: ItemLike[]): number {
  return list.filter((i) => i.todo).length
}

/** Adds a person to the approvers of a new request (at the end), unless already there or the list is full. */
export function addApprover(list: Person[], p: Person): Person[] {
  if (list.length >= MAX_APPROVERS || list.some((x) => x.id === p.id)) return list
  return [...list, { id: p.id, name: p.name }]
}

export function removeApprover(list: Person[], id: string): Person[] {
  return list.filter((x) => x.id !== id)
}

/** Moves the approver `id` one place up (-1) or down (1); the order matters in a sequence. */
export function moveApprover(list: Person[], id: string, by: -1 | 1): Person[] {
  const i = list.findIndex((x) => x.id === id)
  const j = i + by
  if (i < 0 || j < 0 || j >= list.length) return list
  const out = [...list]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

/** The value of the hidden field `approvers`. */
export function approversJson(list: Person[]): string {
  return JSON.stringify(list.map((p) => ({ id: p.id, name: p.name })))
}

/** The mark drawn on the avatar of an approver: ✓ approved, ✗ rejected, … still to decide or not their turn. */
export function markOf(a: Pick<ApproverView, 'verdict'>): { mark: string; kind: 'approved' | 'rejected' | 'open' } {
  if (a.verdict === 'approved') return { mark: '✓', kind: 'approved' }
  if (a.verdict === 'rejected') return { mark: '✗', kind: 'rejected' }
  return { mark: '…', kind: 'open' }
}

/** The approvers who still have to decide and whose turn it is. */
export function waitingNames(list: ApproverView[]): string[] {
  return list.filter((a) => a.waiting).map((a) => a.name)
}
