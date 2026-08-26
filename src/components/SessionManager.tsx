// Copyright (c) 2026 Vikas Godara
// SPDX-License-Identifier: MIT
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { DbSession } from "../tui.js"
import type { ScrollBoxRenderable } from "@opentui/core"
import { For, Show, createMemo } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { SessionRow, calcCols } from "./SessionRow.js"
import { shortDir } from "../utils.js"
import pkg from "../../package.json"

// All frequently-changing props are passed as accessor functions (getter pattern)
// so that updates flow reactively *inside* SessionManager without remounting it.
// If they were passed as plain values, the render() call in route.register would
// read signals, become reactive, and re-invoke render() on every change —
// remounting SessionManager (and its scrollbox) each time.
interface Props {
  api: TuiPluginApi
  list: () => DbSession[]
  allCount: () => number
  projectCount: () => number
  cursor: () => number
  selected: () => Set<string>
  loading: () => boolean
  loadError: () => string | null
  deleting: () => boolean
  filterMode: () => string
  currentDir: () => string
  scrollRef?: (ref: ScrollBoxRenderable | undefined) => void
  onRowSelect?: (index: number) => void
}

export function SessionManager(props: Props) {
  const theme = () => props.api.theme.current
  const dimensions = useTerminalDimensions()

  // ── Dynamic column widths — shared memo for the header row only.
  // SessionRow computes its own cols from useTerminalDimensions directly.
  const cols = createMemo(() => calcCols(dimensions().width))

  const total = () => props.list().length
  const selCount = () => props.selected().size

  const filterLabel = () => {
    const mode = props.filterMode()
    if (mode === "all") return `All projects (${props.projectCount()})`
    return shortDir(mode)
  }

  // ── State conditions as createMemo so Show receives a reactive accessor
  // rather than a pre-computed boolean. The @opentui JSX runtime does NOT
  // apply the SolidJS compiler transform that auto-wraps Show's `when` prop
  // in a getter — so we must derive these as memos explicitly.
  const showError = createMemo(() => !!props.loadError())
  const showLoading = createMemo(() => props.loading() && !props.loadError())
  const showEmpty = createMemo(() => !props.loading() && !props.loadError() && total() === 0)
  const showUpdatedCol = createMemo(() => cols().updated > 0)
  const showDeleting = createMemo(() => props.deleting())
  const showSelCount = createMemo(() => selCount() > 0)

  return (
    <box position="absolute" left={0} top={0} width="100%" height="100%" flexDirection="column">

      {/* Header */}
      <box flexShrink={0} paddingLeft={1} paddingRight={1} flexDirection="row">
        <text fg={theme().text}>Session Manager </text>
        <text fg={theme().textMuted}>— {total()} session{total() === 1 ? "" : "s"}</text>
        <text fg={theme().border}> · </text>
        <text fg={theme().accent}>{filterLabel()}</text>
        <box flexGrow={1} />
        <Show when={showDeleting()}>
          <text fg={theme().warning}>Deleting...  </text>
        </Show>
        <text fg={theme().textMuted}>v{pkg.version}</text>
      </box>

      <box flexShrink={0} border={["bottom"]} borderColor={theme().border} />

      {/* Column headers */}
      <box flexShrink={0} flexDirection="row" paddingLeft={1} paddingRight={1}>
        <text fg={theme().textMuted}>    </text>
        <box width={cols().session} overflow="hidden"><text fg={theme().textMuted}>Session</text></box>
        <box width={cols().project} paddingLeft={1} overflow="hidden"><text fg={theme().textMuted}>Project</text></box>
        <Show when={showUpdatedCol()}>
          <box width={cols().updated} paddingLeft={1} overflow="hidden"><text fg={theme().textMuted}>Updated</text></box>
        </Show>
      </box>

      <box flexShrink={0} border={["bottom"]} borderColor={theme().border} />

      {/* Loading / error / empty states — rendered outside the scrollbox so
           that Show conditions are evaluated in a normal reactive scope.
           @opentui's scrollbox may not propagate signal tracking to children,
           which would cause Show blocks inside it to evaluate once and never
           re-run, leaving "Loading sessions..." stuck on screen. */}
      <Show when={showError()}>
        <box flexGrow={1} paddingLeft={1} paddingTop={1} flexDirection="column">
          <text fg={theme().error}>Error: {props.loadError() ?? "Failed to load sessions"}</text>
          <text fg={theme().textMuted}>Press r to retry</text>
        </box>
      </Show>
      <Show when={showLoading()}>
        <box flexGrow={1} paddingLeft={1} paddingTop={1}>
          <text fg={theme().textMuted}>Loading sessions...</text>
        </box>
      </Show>
      <Show when={showEmpty()}>
        <box flexGrow={1} paddingLeft={1} paddingTop={1}>
          <text fg={theme().textMuted}>No sessions found.</text>
        </box>
      </Show>

      {/* Keep the scrollbox mounted so session updates do not reset its scroll
           position. The reactive For accessor updates its children in place. */}
      <scrollbox
        flexGrow={1}
        stickyScroll={false}
        ref={props.scrollRef}
      >
        <For each={props.list()}>
          {(session, index) => (
            <SessionRow
              id={`vacuum-row-${session.id}`}
              session={session}
              isFocused={index() === props.cursor()}
              isSelected={props.selected().has(session.id)}
              theme={theme()}
              onSelect={() => props.onRowSelect?.(index())}
            />
          )}
        </For>
      </scrollbox>

      {/* Footer */}
      <box flexShrink={0} border={["top"]} borderColor={theme().border} paddingLeft={1} paddingRight={1} flexDirection="row">
        <Show when={showSelCount()}>
          <text fg={theme().accent}>{selCount()} selected  </text>
        </Show>
        <text fg={theme().textMuted}>↑↓/jk move</text>
        <text fg={theme().border}> · </text>
        <text fg={theme().textMuted}>Space select</text>
        <text fg={theme().border}> · </text>
        <text fg={theme().textMuted}>Ctrl+A all</text>
        <text fg={theme().border}> · </text>
        <text fg={theme().textMuted}>f filter</text>
        <text fg={theme().border}> · </text>
        <text fg={selCount() > 0 ? theme().error : theme().textMuted}>d delete</text>
        <text fg={theme().border}> · </text>
        <text fg={theme().textMuted}>Esc close</text>
      </box>

    </box>
  )
}
