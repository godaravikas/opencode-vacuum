// Copyright (c) 2026 Vikas Godara
// SPDX-License-Identifier: MIT
import type { TuiPlugin, TuiRouteCurrent } from "@opencode-ai/plugin/tui"
import type { ScrollBoxRenderable } from "@opentui/core"
import path from "path"
import { createSignal, createMemo } from "solid-js"
import { SessionManager } from "./components/SessionManager.js"
import {
  clampCursor,
  descendantSessionIds,
  flattenSessionTree,
  toggleSetItem,
  toggleAllItems,
  shortDir,
  type HierarchicalSession,
} from "./utils.js"

// Minimal session shape read directly from the OpenCode SQLite database.
// This is a subset of the full SDK Session type — only what the UI needs.
export type DbSession = {
  id: string
  directory: string
  title: string
  slug: string
  cost: number
  parentID?: string | null
  time_created: number
  time_updated: number
}

export type DisplaySession = HierarchicalSession<DbSession>

const ROUTE = "vacuum"
const GLOBAL_FILTER = "__global__"

export const tui: TuiPlugin = async (api) => {

  // ── Session data ──────────────────────────────────────────────────────────
  const [sessions, setSessions] = createSignal<DbSession[]>([])
  const [loading, setLoading] = createSignal(false)
  const [loadError, setLoadError] = createSignal<string | null>(null)

  const fetchSessions = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      // OpenCode stores session data in the XDG data directory, not the state
      // directory exposed by the TUI API. The state path is .../.local/state/opencode,
      // so move up to .../.local before selecting share/opencode/opencode.db.
      const dbPath = path.join(
        path.dirname(path.dirname(api.state.path.state)),
        "share",
        "opencode",
        "opencode.db",
      )
      const { Database } = await import("bun:sqlite")
      const db = new Database(dbPath, { readonly: true, create: false })
      try {
        // This only affects this read-only connection and lets SQLite wait
        // briefly for OpenCode to finish a write transaction.
        db.exec("PRAGMA busy_timeout = 1000")
        setSessions(db.query<DbSession, []>(
          `SELECT id, directory, title, slug, cost, parent_id AS parentID, time_created, time_updated
           FROM session
           WHERE time_archived IS NULL
           ORDER BY time_updated DESC`
        ).all())
      } finally {
        db.close()
      }
    } catch (e: any) {
      console.warn(`[vacuum] session load failed: ${e?.message ?? e}`)
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

  const list = createMemo<DisplaySession[]>(() => {
    const all = sessions()
    const mode = filterMode()
    const filtered = mode === "all"
      ? all
      : mode === "current"
        ? all.filter((s) => sessionDir(s) === currentDir())
        : mode === GLOBAL_FILTER
          ? all.filter((s) => !sessionDir(s))
          : all.filter((s) => sessionDir(s) === mode)
    return flattenSessionTree(filtered)
  })

  const parentRows = (items: DisplaySession[]) => items.filter(({ session }) => !session.parentID)

  // Scroll to keep the target row visible. Delegates to the scrollbox's own
  // scrollChildIntoView, which measures the row's real laid-out geometry against
  // the viewport's inner content area. Computing this manually from
  // `scrollTop + viewport.height` overestimates the visible row count (the
  // viewport box height includes borders/padding), so the downward bound fires
  // too late and the cursor row slips below the fold.
  // The index is passed directly (not read from the cursor() signal) to avoid
  // stale signal reads before SolidJS flushes updates.
  const scrollToCursor = (targetIndex: number) => {
    const sb = scrollBox()
    if (!sb) return
    const item = list()[targetIndex]
    if (!item) return
    sb.scrollChildIntoView(`vacuum-row-${item.session.id}`)
  }

  const moveCursor = (delta: number) => {
    const next = clampCursor(cursor(), delta, list().length)
    setCursor(next)
    scrollToCursor(next)
  }

  const toggleSelected = () => {
    const sess = list()[cursor()]
    if (sess?.session.parentID) return
    if (sess) setSelected((prev) => toggleSetItem(prev, sess.session.id))
  }

  const toggleAll = () => {
    const items = list()
    if (!items.length) return
    setSelected((prev) => toggleAllItems(prev, parentRows(items).map(({ session }) => session.id)))
  }

  // ── Deletion ──────────────────────────────────────────────────────────────
  const confirmDelete = () => {
    // Only delete sessions that are currently visible in the filtered list.
    // This prevents stale selections from a previous filter mode from being
    // deleted when the filter changes.
    const visible = new Set(parentRows(list()).map(({ session }) => session.id))
    const roots = Array.from(selected()).filter((id) => visible.has(id))
    const ids = roots.flatMap((id) => [...descendantSessionIds(sessions(), id), id])
    if (!ids.length) return
    const subagentCount = ids.length - roots.length
    const rootLabel = `${roots.length} session${roots.length === 1 ? "" : "s"}`
    const subagentLabel = roots.length === 1 ? "its subagents" : "their subagents"
    const totalLabel = `${ids.length} session${ids.length === 1 ? "" : "s"}`
    api.ui.dialog.replace(() => (
      <api.ui.DialogConfirm
        title={`Delete ${rootLabel}${subagentCount > 0 ? ` and ${subagentLabel}` : ""}?`}
        message={`${totalLabel} will be deleted. This cannot be undone.`}
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
    try {
      const dirs = Array.from(new Set(sessions().map(sessionDir).filter(Boolean))).sort()
      const cur = currentDir()
      const counts = new Map<string, number>()
      for (const session of sessions()) {
        if (!session.parentID) counts.set(sessionDir(session), (counts.get(sessionDir(session)) ?? 0) + 1)
      }
      const parentCount = parentRows(flattenSessionTree(sessions())).length
      api.ui.dialog.replace(() => (
        <api.ui.DialogSelect
          title="Filter by project"
          options={[
            { title: "All sessions", value: "all", description: `${parentCount} session${parentCount === 1 ? "" : "s"} across ${dirs.length} project${dirs.length === 1 ? "" : "s"}` },
            ...(counts.has("") ? [{
              title: "Global sessions",
              value: GLOBAL_FILTER,
              description: `${counts.get("")} session${counts.get("") === 1 ? "" : "s"}`,
            }] : []),
            ...dirs.map((d) => ({
              title: shortDir(d),
              value: d,
              description: `${counts.get(d) ?? 0} session${counts.get(d) === 1 ? "" : "s"}${d === cur ? " · current" : ""}`,
            })),
          ]}
          current={filterMode() === "current" ? currentDir() : filterMode()}
          onSelect={(opt) => {
            setFilterMode(opt.value as string)
            setCursor(0)
            setSelected(new Set<string>())
            api.ui.dialog.clear()
          }}
        />
      ))
      api.ui.dialog.setSize("xlarge")
    } catch (e: any) {
      console.error(`[vacuum] openFilter failed: ${e?.message ?? e}`)
      api.ui.toast({ variant: "warning", message: `Filter error: ${e?.message ?? "unknown error"}` })
    }
  }

  // ── Nav keymap — registered only while on the vacuum route ──────────────
  // Kept as a variable so we can unregister it when closing and re-register
  // when opening. This ensures the bindings never consume keystrokes in the
  // chat window.
  let unregisterNav: (() => void) | undefined
  let previousRoute: TuiRouteCurrent | undefined

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
    previousRoute = api.route.current   // capture before navigating away
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
    const prev = previousRoute
    previousRoute = undefined
    // Defer navigation one tick so the empty-list re-render flushes to the
    // terminal before the route switches, preventing scrollback ghost rows.
    setTimeout(() => {
      if (prev && prev.name === "session") {
        const p = prev as { name: "session"; params: { sessionID: string; prompt?: unknown } }
        api.route.navigate("session", { sessionID: p.params.sessionID })
      } else if (prev && prev.name !== "home") {
        const p = prev as { name: string; params?: Record<string, unknown> }
        api.route.navigate(p.name, p.params)
      } else {
        api.route.navigate("home")
      }
    }, 0)
  }

  // ── Route ─────────────────────────────────────────────────────────────────
  const unregisterRoute = api.route.register([
    {
      name: ROUTE,
      render: () => (
        <SessionManager
          api={api}
          list={list}
          allCount={() => parentRows(flattenSessionTree(sessions())).length}
          projectCount={() => Array.from(new Set(sessions().map(sessionDir).filter(Boolean))).length}
          cursor={cursor}
          selected={selected}
          loading={loading}
          loadError={loadError}
          deleting={deleting}
          filterMode={filterMode}
          currentDir={currentDir}
          scrollRef={(ref) => setScrollBox(ref)}
          onRowSelect={(index) => {
            setCursor(index)
            scrollToCursor(index)
            const sess = list()[index]
            if (sess?.session.parentID) return
            if (sess) setSelected((prev) => toggleSetItem(prev, sess.session.id))
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
