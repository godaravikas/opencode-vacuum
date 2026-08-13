// Copyright (c) 2026 Vikas Godara
// SPDX-License-Identifier: MIT
import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { formatUpdated, shortDir, clampCursor, toggleSetItem, toggleAllItems } from "../utils.js"

// ── formatUpdated ─────────────────────────────────────────────────────────────

describe("formatUpdated", () => {
  const now = Date.now() // milliseconds

  it("shows Today for timestamps within today", () => {
    // compact: just time e.g. "8:54 AM"
    expect(formatUpdated(now - 30 * 1000)).toMatch(/\d{1,2}:\d{2}/)
  })

  it("shows Yesterday for timestamps 1 day ago", () => {
    expect(formatUpdated(now - 86400 * 1000)).toMatch(/^Yest /)
  })

  it("shows month and day for older timestamps", () => {
    expect(formatUpdated(now - 86400 * 10 * 1000)).toMatch(/^[A-Z][a-z]+ \d+/)
  })

  it("includes year for timestamps from a different year", () => {
    const pastYear = new Date()
    pastYear.setFullYear(pastYear.getFullYear() - 1)
    expect(formatUpdated(pastYear.getTime())).toMatch(/\d{4}/)
  })
})

// ── shortDir ─────────────────────────────────────────────────────────────────

describe("shortDir", () => {
  const originalHome = process.env.HOME

  beforeEach(() => {
    process.env.HOME = "/Users/vikas"
  })

  it("replaces $HOME prefix with ~", () => {
    expect(shortDir("/Users/vikas/projects/foo")).toBe("~/projects/foo")
  })

  it("returns basename for paths outside $HOME", () => {
    expect(shortDir("/opt/myproject")).toBe("myproject")
  })

  it("returns ~ for the home directory itself", () => {
    expect(shortDir("/Users/vikas")).toBe("~")
  })

  it("returns the path as-is when HOME is not set", () => {
    process.env.HOME = ""
    expect(shortDir("/some/path/to/project")).toBe("project")
  })

  // restore
  afterEach(() => {
    process.env.HOME = originalHome
  })
})

// ── clampCursor ───────────────────────────────────────────────────────────────

describe("clampCursor", () => {
  it("moves forward within bounds", () => {
    expect(clampCursor(2, 1, 5)).toBe(3)
  })

  it("clamps at the last item", () => {
    expect(clampCursor(4, 1, 5)).toBe(4)
  })

  it("moves backward within bounds", () => {
    expect(clampCursor(2, -1, 5)).toBe(1)
  })

  it("clamps at 0", () => {
    expect(clampCursor(0, -1, 5)).toBe(0)
  })

  it("returns 0 when list is empty", () => {
    expect(clampCursor(0, 1, 0)).toBe(0)
  })

  it("handles large positive delta", () => {
    expect(clampCursor(1, 100, 5)).toBe(4)
  })

  it("handles large negative delta", () => {
    expect(clampCursor(3, -100, 5)).toBe(0)
  })
})

// ── toggleSetItem ─────────────────────────────────────────────────────────────

describe("toggleSetItem", () => {
  it("adds an item not in the set", () => {
    const result = toggleSetItem(new Set(["a", "b"]), "c")
    expect(result.has("c")).toBe(true)
    expect(result.size).toBe(3)
  })

  it("removes an item already in the set", () => {
    const result = toggleSetItem(new Set(["a", "b"]), "a")
    expect(result.has("a")).toBe(false)
    expect(result.size).toBe(1)
  })

  it("does not mutate the original set", () => {
    const original = new Set(["a"])
    toggleSetItem(original, "b")
    expect(original.size).toBe(1)
  })

  it("works on an empty set", () => {
    const result = toggleSetItem(new Set<string>(), "x")
    expect(result.has("x")).toBe(true)
  })
})

// ── toggleAllItems ────────────────────────────────────────────────────────────

describe("toggleAllItems", () => {
  const all = ["a", "b", "c"]

  it("selects all when nothing is selected", () => {
    const result = toggleAllItems(new Set<string>(), all)
    expect(result.size).toBe(3)
    expect([...result]).toEqual(all)
  })

  it("selects all when only some are selected", () => {
    const result = toggleAllItems(new Set(["a"]), all)
    expect(result.size).toBe(3)
  })

  it("deselects all when all are already selected", () => {
    const result = toggleAllItems(new Set(all), all)
    expect(result.size).toBe(0)
  })

  it("works with an empty all-items list", () => {
    const result = toggleAllItems(new Set<string>(), [])
    expect(result.size).toBe(0)
  })

  it("does not mutate the original set", () => {
    const original = new Set(["a"])
    toggleAllItems(original, all)
    expect(original.size).toBe(1)
  })
})
