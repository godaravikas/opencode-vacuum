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
interface Props {
  api: TuiPluginApi
  list: DbSession[]
  allCount: number
  projectCount: number
  cursor: number
  selected: Set<string>
  loading: boolean
  loadError: string | null
  deleting: boolean
  filterMode: string
  currentDir: string
  scrollRef?: (ref: ScrollBoxRenderable | undefined) => void
  onRowSelect?: (index: number) => void
}

export function SessionManager(props: Props) {
  const theme = () => props.api.theme.current
  const dimensions = useTerminalDimensions()

  // ── Dynamic column widths — shared memo for the header row only.
  // SessionRow computes its own cols from useTerminalDimensions directly.
  const cols = createMemo(() => calcCols(dimensions().width))

  const total = () => props.list.length
  const selCount = () => props.selected.size

  const filterLabel = () => {
    const mode = props.filterMode
    if (mode === "all") return `All projects (${props.projectCount})`
    return shortDir(mode)
  }

  return (
    <box position="absolute" left={0} top={0} width="100%" height="100%" flexDirection="column">

      {/* Header */}
      <box flexShrink={0} paddingLeft={1} paddingRight={1} flexDirection="row">
        <text fg={theme().text}>Session Manager </text>
        <text fg={theme().textMuted}>— {total()} session{total() === 1 ? "" : "s"}</text>
        <text fg={theme().border}> · </text>
        <text fg={theme().accent}>{filterLabel()}</text>
        <box flexGrow={1} />
        <Show when={props.deleting}>
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
        <Show when={cols().updated > 0}>
          <box width={cols().updated} paddingLeft={1} overflow="hidden"><text fg={theme().textMuted}>Updated</text></box>
        </Show>
      </box>

      <box flexShrink={0} border={["bottom"]} borderColor={theme().border} />

      {/* Session list */}
        <Show when={props.loadError}>
          <box paddingLeft={1} paddingTop={1} flexDirection="column">
            <text fg={theme().error}>Error: {props.loadError}</text>
            <text fg={theme().textMuted}>Press r to retry</text>
          </box>
        </Show>
        <Show when={props.loading && !props.loadError}>
          <box paddingLeft={1} paddingTop={1}>
            <text fg={theme().textMuted}>Loading sessions...</text>
          </box>
        </Show>
        <Show when={!props.loading && !props.loadError}>
          <Show
            when={total() > 0}
            fallback={
              <box paddingLeft={1} paddingTop={1}>
                <text fg={theme().textMuted}>No sessions found.</text>
              </box>
            }
          >
            <scrollbox
              flexGrow={1}
              stickyScroll={false}
              ref={props.scrollRef}
            >
              <For each={props.list}>
                {(session, index) => (
                   <SessionRow
                    id={`vacuum-row-${session.id}`}
                    session={session}
                    isFocused={index() === props.cursor}
                    isSelected={props.selected.has(session.id)}
                    theme={theme()}
                    onSelect={() => props.onRowSelect?.(index())}
                  />
                )}
              </For>
            </scrollbox>
          </Show>
        </Show>

      {/* Footer */}
      <box flexShrink={0} border={["top"]} borderColor={theme().border} paddingLeft={1} paddingRight={1} flexDirection="row">
        <Show when={selCount() > 0}>
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
