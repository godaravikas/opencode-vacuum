// Copyright (c) 2026 Vikas Godara
// SPDX-License-Identifier: MIT
import type { TuiPlugin } from "@opencode-ai/plugin/tui"
import type { ScrollBoxRenderable } from "@opentui/core"
import { Database } from "bun:sqlite"
import { createSignal, createMemo, createEffect, on } from "solid-js"
import { SessionManager } from "./components/SessionManager.js"
import { clampCursor, toggleSetItem, toggleAllItems, shortDir } from "./utils.js"

// Minimal session shape read directly from the OpenCode SQLite database.
// This is a subset of the full SDK Session type — only what the UI needs.
export type DbSession = {
  id: string
  directory: string
  title: string
  slug: string
  cost: number
  time_created: number
  time_updated: number
}

const ROUTE = "vacuum"

export const tui: TuiPlugin = async (api) => {

  // ── Session data ──────────────────────────────────────────────────────────
  const [sessions, setSessions] = createSignal<DbSession[]>([])
  const [loading, setLoading] = createSignal(false)
  const [loadError, setLoadError] = createSignal<string | null>(null)

  const fetchSessions = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      // Attempt to read sessions directly from the OpenCode SQLite database
      // in read-only mode so we get all sessions across all projects.
      // Falls back to the v2 API (current-project only) if the db is unavailable.
      const dbPath = `${api.state.path.state}/opencode.db`
      let rows: DbSession[] | null = null
      try {
        const { Database } = await import("bun:sqlite")
        // WAL mode: open with readonly + wal flags so we don't block the writer
        const db = new Database(dbPath, { readonly: true, create: false })
        rows = db.query<DbSession, []>(
          `SELECT id, directory, title, slug, cost, time_created, time_updated
           FROM session
           WHERE time_archived IS NULL
           ORDER BY time_updated DESC
           LIMIT 500`
        ).all()
        db.close()
      } catch (dbErr: any) {
        // bun:sqlite unavailable or db locked — fall back to API.
        // Log so the error is visible in OpenCode's debug console.
        console.warn(`[vacuum] db read failed (${dbPath}): ${dbErr?.message ?? dbErr} — falling back to API`)
      }

      if (rows !== null) {
        setSessions(rows)
      } else {
        // API fallback: returns only current-project sessions but is always available.
        // Normalize the API shape into our flat DbSession shape.
        const result = await (api.client.session as any).list({ scope: "project", limit: 500 })
        const raw: any[] = Array.isArray(result?.data)
          ? result.data
          : Array.isArray(result?.data?.data) ? result.data.data : []
        setSessions(raw.map((s: any): DbSession => ({
          id: s.id,
          directory: s.directory ?? s.location?.directory ?? "",
          title: s.title ?? "",
          slug: s.slug ?? "",
          cost: s.cost ?? 0,
          time_created: s.time?.created ?? s.time_created ?? 0,
          time_updated: s.time?.updated ?? s.time_updated ?? 0,
        })))
      }
    } catch (e: any) {
      setLoadError(e?.message ?? "Failed to load sessions")
      setSessions([])
    } finally {
      setLoading(false)
    }
  }

  // ── Cursor & selection ────────────────────────────────────────────────────
  const [filterMode, setFilterMode] = createSignal<"all" | "current" | string>("current")
  const [cursor, setCursor] = createSignal(0)
  const [selected, setSelected] = createSignal(new Set<string>())
  const [deleting, setDeleting] = createSignal(false)

  // scrollbox ref as a signal so createEffect can react when it mounts/remounts
  const [scrollBox, setScrollBox] = createSignal<ScrollBoxRenderable | undefined>(undefined)

  // When the scrollbox ref is set (or replaced on remount), do nothing extra —
  // mouse scroll moves the viewport freely and independently of the cursor.
  // We only need to re-apply the cursor's scroll position if the scrollbox is
  // remounted (which resets scrollTop to 0), handled by the effect below.

  const currentDir = () => api.state.path.directory

  const list = createMemo<DbSession[]>(() => {
    const all = sessions()
    const mode = filterMode()
    if (mode === "all") return all
    if (mode === "current") return all.filter((s) => sessionDir(s) === currentDir())
    return all.filter((s) => sessionDir(s) === mode)
  })

  // Scroll to keep the cursor row visible only when the cursor changes via
  // keyboard or mouse click — not when the user is freely scrolling.
  const scrollToCursor = () => {
    const sb = scrollBox()
    const c = cursor()
    if (!sb) return
    queueMicrotask(() => {
      const viewportHeight = sb.viewport?.height ?? 10
      if (viewportHeight <= 0) return
      const currentTop = sb.scrollTop
      if (c < currentTop) {
        sb.scrollTo(c)
      } else if (c >= currentTop + viewportHeight) {
        sb.scrollTo(c - viewportHeight + 1)
      }
    })
  }

  const moveCursor = (delta: number) => {
    setCursor((c) => clampCursor(c, delta, list().length))
    scrollToCursor()
  }

  const toggleSelected = () => {
    const sess = list()[cursor()]
    if (sess) setSelected((prev) => toggleSetItem(prev, sess.id))
  }

  const toggleAll = () => {
    const items = list()
    if (!items.length) return
    setSelected((prev) => toggleAllItems(prev, items.map((s) => s.id)))
  }

  // ── Deletion ──────────────────────────────────────────────────────────────
  const confirmDelete = () => {
    // Only delete sessions that are currently visible in the filtered list.
    // This prevents stale selections from a previous filter mode from being
    // deleted when the filter changes.
    const visible = new Set(list().map((s) => s.id))
    const ids = Array.from(selected()).filter((id) => visible.has(id))
    if (!ids.length) return
    api.ui.dialog.replace(() => (
      <api.ui.DialogConfirm
        title={`Delete ${ids.length} session${ids.length === 1 ? "" : "s"}?`}
        message="This cannot be undone."
        onConfirm={() => executeDeletion(ids)}
        onCancel={() => { api.ui.dialog.clear(); setSelected(new Set<string>()) }}
      />
    ))
  }

  const executeDeletion = async (ids: string[]) => {
    api.ui.dialog.clear()
    setDeleting(true)
    const failed: string[] = []
    for (const sessionID of ids) {
      try { await (api.client.session as any).delete({ sessionID }) }
      catch { failed.push(sessionID) }
    }
    const deleted = ids.length - failed.length
    setDeleting(false)
    setSelected(new Set<string>())
    await fetchSessions()
    // If the current filter now shows no sessions but there are sessions from
    // other projects, fall back to "all" so the user sees the full list.
    // This is safe: selected is already cleared above before we switch mode.
    if (list().length === 0 && sessions().length > 0 && filterMode() !== "all") {
      setFilterMode("all")
    }
    setCursor((c) => Math.min(c, Math.max(0, list().length - 1)))
    if (failed.length === 0)
      api.ui.toast({ variant: "success", message: `Deleted ${deleted} session${deleted === 1 ? "" : "s"}` })
    else
      api.ui.toast({ variant: "warning", message: `Deleted ${deleted}/${ids.length} session${ids.length === 1 ? "" : "s"}. ${failed.length} failed.` })
  }

  // ── Filter picker ─────────────────────────────────────────────────────────
  const openFilter = () => {
    const dirs = Array.from(new Set(sessions().map(sessionDir).filter(Boolean))).sort()
    const cur = currentDir()
    api.ui.dialog.replace(() => (
      <api.ui.DialogSelect
        title="Filter by project"
        options={[
          { title: "All sessions", value: "all", description: `${sessions().length} sessions across ${dirs.length} project${dirs.length === 1 ? "" : "s"}` },
          ...dirs.map((d) => ({
            title: shortDir(d),
            value: d,
            description: d === cur ? "(current)" : undefined,
          })),
        ]}
        current={filterMode()}
        onSelect={(opt) => {
          setFilterMode(opt.value as string)
          setCursor(0)
          setSelected(new Set<string>())
          api.ui.dialog.clear()
        }}
      />
    ))
  }

  // ── Nav keymap — registered only while on the vacuum route ──────────────
  // Kept as a variable so we can unregister it when closing and re-register
  // when opening. This ensures the bindings never consume keystrokes in the
  // chat window.
  let unregisterNav: (() => void) | undefined

  const NAV_LAYER = {
    commands: [
      { name: "vacuum.cursor.down",   title: "Move down",             run() { moveCursor(1) } },
      { name: "vacuum.cursor.up",     title: "Move up",               run() { moveCursor(-1) } },
      { name: "vacuum.select.toggle", title: "Toggle selection",      run() { toggleSelected() } },
      { name: "vacuum.select.all",    title: "Select / deselect all", run() { toggleAll() } },
      { name: "vacuum.filter",        title: "Filter by project",     run() { openFilter() } },
      { name: "vacuum.retry",         title: "Retry loading",         run() { fetchSessions() } },
      { name: "vacuum.delete",        title: "Delete selected",       run() { if (!deleting()) confirmDelete() } },
      { name: "vacuum.close",         title: "Close",                 run() { closeManager() } },
    ],
    bindings: [
      { key: "down,j",   cmd: "vacuum.cursor.down" },
      { key: "up,k",     cmd: "vacuum.cursor.up" },
      { key: "space",    cmd: "vacuum.select.toggle" },
      { key: "ctrl+a",   cmd: "vacuum.select.all" },
      { key: "f",        cmd: "vacuum.filter" },
      { key: "r",        cmd: "vacuum.retry" },
      { key: "d,delete", cmd: "vacuum.delete" },
      { key: "escape,q", cmd: "vacuum.close" },
    ],
  } as const

  // ── State reset — called on open and close to guarantee a clean slate ──────
  const resetState = () => {
    setSelected(new Set<string>())
    setCursor(0)
    setFilterMode("current")
    setSessions([])
    setLoadError(null)
  }

  const openManager = () => {
    resetState()
    fetchSessions()
    unregisterNav = api.keymap.registerLayer(NAV_LAYER)
    api.route.navigate(ROUTE)
    api.ui.dialog.clear()
  }

  const closeManager = () => {
    resetState()                    // clears sessions → scrollbox renders empty list
    unregisterNav?.()
    unregisterNav = undefined
    // Defer navigation one tick so the empty-list re-render flushes to the
    // terminal before the route switches, preventing scrollback ghost rows.
    setTimeout(() => api.route.navigate("home"), 0)
  }

  // ── Route ─────────────────────────────────────────────────────────────────
  const unregisterRoute = api.route.register([
    {
      name: ROUTE,
      render: () => (
        <SessionManager
          api={api}
          list={list()}
          allCount={sessions().length}
          projectCount={Array.from(new Set(sessions().map(sessionDir).filter(Boolean))).length}
          cursor={cursor()}
          selected={selected()}
          loading={loading()}
          loadError={loadError()}
          deleting={deleting()}
          filterMode={filterMode()}
          currentDir={currentDir()}
          scrollRef={(ref) => setScrollBox(ref)}
          onRowSelect={(index) => {
            setCursor(index)
            scrollToCursor()
            const sess = list()[index]
            if (sess) setSelected((prev) => toggleSetItem(prev, sess.id))
          }}
        />
      ),
    },
  ])

  // ── /vacuum command ───────────────────────────────────────────────────────
  const unregisterOpen = api.keymap.registerLayer({
    commands: [
      {
        name: "vacuum.open",
        title: "Manage and delete sessions",
        slashName: "vacuum",
        category: "Sessions",
        namespace: "palette",
        run() { openManager() },
      },
    ],
  })

  api.lifecycle.onDispose(() => {
    unregisterNav?.()
    unregisterRoute()
    unregisterOpen()
  })
}

function sessionDir(s: DbSession): string {
  return s.directory ?? ""
}
