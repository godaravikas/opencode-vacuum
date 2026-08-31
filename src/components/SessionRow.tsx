// Copyright (c) 2026 Vikas Godara
// SPDX-License-Identifier: MIT
import type { DbSession } from "../tui.js"
import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import { Show, createMemo } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { shortDir, formatUpdated } from "../utils.js"

export type ColWidths = { session: number; project: number; updated: number }

export function calcCols(w: number): ColWidths {
  const overhead = 10
  const available = Math.max(0, w - overhead)
  const updated = available >= 50 ? 14 : 0
  const projectBudget = available - updated
  const project = updated > 0
    ? Math.min(60, Math.max(20, Math.floor(projectBudget * 0.40)))
    : Math.min(60, Math.max(0, Math.floor(projectBudget * 0.50)))
  const session = Math.max(8, available - updated - project)
  return { session, project, updated }
}

interface Props {
  id: string
  session: DbSession
  depth: number
  isSelectable: boolean
  isFocused: boolean
  isSelected: boolean
  theme: TuiThemeCurrent
  onSelect?: () => void
}

export function SessionRow(props: Props) {
  // Each row owns its own reactive column widths — directly tied to the
  // terminal dimensions signal so resize reflows every row independently.
  const dimensions = useTerminalDimensions()
  const cols = createMemo(() => calcCols(dimensions().width))
  // All values derived reactively from props — never destructure in SolidJS.
  const indicator = () => props.isSelected ? "[x]" : "[ ]"
  const indent = () => `${"  ".repeat(props.depth)}${props.depth > 0 ? "> " : ""}`
  const title = () => props.session.title || "(untitled)"
  const project = () => shortDir(props.session.directory) || "(unknown)"
  const updated = () => formatUpdated(props.session.time_updated)

  const bgColor = () => {
    if (props.isFocused && props.isSelected) return props.theme.accent
    if (props.isFocused) return props.theme.backgroundElement
    return props.theme.background
  }

  const rowFg = () => {
    if (props.isFocused && props.isSelected) return props.theme.background
    if (props.isSelected) return props.theme.accent
    return props.theme.text
  }

  const indicatorFg = () => {
    if (props.isFocused && props.isSelected) return props.theme.background
    if (props.isSelected) return props.theme.accent
    return props.theme.textMuted
  }

  return (
    <box
      id={props.id}
      flexDirection="row"
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={bgColor()}
      onMouseDown={(event: any) => {
        if (event.button === 0 && props.isSelectable) {
          event.stopPropagation()
          props.onSelect?.()
        }
      }}
    >
      {/* indicator */}
      <text fg={indicatorFg()}>{props.isSelectable ? indicator() : "   "}</text>

      {/* session title — fixed width */}
      <box width={cols().session} flexShrink={0} flexDirection="row" overflow="hidden">
        <text fg={rowFg()}>{indent()}</text>
        <text fg={rowFg()}>{title()}</text>
      </box>

      {/* project path */}
      <box width={cols().project} flexShrink={0} paddingLeft={1} overflow="hidden">
        <text fg={props.theme.textMuted}>{project()}</text>
      </box>

      {/* date — hidden when terminal is too narrow */}
      <Show when={cols().updated > 0}>
        <box width={cols().updated} flexShrink={0} paddingLeft={1} overflow="hidden">
          <text fg={props.theme.textMuted}>{updated()}</text>
        </box>
      </Show>
    </box>
  )
}
