// Copyright (c) 2026 Vikas Godara
// SPDX-License-Identifier: MIT
import path from "path"

/**
 * Format a Unix timestamp as a compact date string.
 * Accepts milliseconds (13-digit) or seconds (10-digit).
 * Today: "2:30 PM", this year: "Aug 10", older: "Aug 10 2025"
 */
export function formatUpdated(unixMsOrSec: number): string {
  const ms = unixMsOrSec > 1e12 ? unixMsOrSec : unixMsOrSec * 1000
  const date = new Date(ms)
  const now = new Date()

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart.getTime() - 86400000)

  if (date >= todayStart) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }
  if (date >= yesterdayStart) {
    return `Yest ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
  }

  const month = date.toLocaleString("default", { month: "short" })
  const day = date.getDate()
  if (date.getFullYear() !== now.getFullYear()) {
    return `${month} ${day} ${date.getFullYear()}`
  }
  return `${month} ${day}`
}

/**
 * Shorten a directory path for display.
 * Replaces $HOME (or $USERPROFILE on Windows) prefix with ~, falls back to basename.
 */
export function shortDir(dir: string): string {
  try {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? ""
    if (home && dir.startsWith(home)) return "~" + dir.slice(home.length)
    return path.basename(dir) || dir
  } catch {
    return dir
  }
}

/**
 * Clamp a cursor index within [0, length - 1].
 * Returns 0 when length is 0.
 */
export function clampCursor(current: number, delta: number, length: number): number {
  if (length === 0) return 0
  return Math.max(0, Math.min(length - 1, current + delta))
}

/**
 * Toggle an item in a Set, returning a new Set.
 */
export function toggleSetItem<T>(set: Set<T>, item: T): Set<T> {
  const next = new Set<T>(set)
  if (next.has(item)) next.delete(item)
  else next.add(item)
  return next
}

/**
 * Select all items, or deselect all if all are already selected.
 */
export function toggleAllItems<T>(current: Set<T>, all: T[]): Set<T> {
  if (current.size === all.length) return new Set<T>()
  return new Set<T>(all)
}

export type ParentSession = {
  id: string
  parentID?: string | null
}

export type HierarchicalSession<T> = {
  session: T
  depth: number
}

/** Flatten sessions in parent-first order while preserving sibling order. */
export function flattenSessionTree<T extends ParentSession>(sessions: T[]): HierarchicalSession<T>[] {
  const byParent = new Map<string, T[]>()
  const byId = new Set(sessions.map((session) => session.id))

  for (const session of sessions) {
    if (!session.parentID || !byId.has(session.parentID)) continue
    const children = byParent.get(session.parentID) ?? []
    children.push(session)
    byParent.set(session.parentID, children)
  }

  const flattened: HierarchicalSession<T>[] = []
  const visited = new Set<string>()
  const append = (session: T, depth: number) => {
    if (visited.has(session.id)) return
    visited.add(session.id)
    flattened.push({ session, depth })
    for (const child of byParent.get(session.id) ?? []) append(child, depth + 1)
  }

  for (const session of sessions) {
    if (!session.parentID || !byId.has(session.parentID)) append(session, 0)
  }
  for (const session of sessions) append(session, 0)

  return flattened
}

/** Return descendants before their parent for safe deletion ordering. */
export function descendantSessionIds<T extends ParentSession>(sessions: T[], parentID: string): string[] {
  const byParent = new Map<string, T[]>()
  for (const session of sessions) {
    if (!session.parentID) continue
    const children = byParent.get(session.parentID) ?? []
    children.push(session)
    byParent.set(session.parentID, children)
  }

  const descendants: string[] = []
  const visited = new Set<string>()
  const visit = (id: string) => {
    for (const child of byParent.get(id) ?? []) {
      if (visited.has(child.id)) continue
      visited.add(child.id)
      descendants.push(child.id)
      visit(child.id)
    }
  }
  visit(parentID)
  return descendants
}
