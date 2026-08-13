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
