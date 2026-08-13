# Changelog

All feature changes to `opencode-vacuum` are documented here.

---

## v0.2.0 — 2026-08-14
- Fixed keyboard selection issues that could cause incorrect session deletions

## v0.1.0 — 2026-08-13

**Features**
- Global session listing across all projects via `/vacuum` command
- Opens filtered to the current project by default
- Multi-select with `Space` and `Ctrl+A` (select all / deselect all) or mouse click
- Delete after confirmation dialog
- Project filter picker (`f`) — switch between All, Current, or any specific project
- Three-column layout: Session title · Full project path · Updated date
- Scrollable list with mouse wheel support and keyboard cursor auto-scroll
- Falls back to All sessions view when the filtered project list becomes empty after deletion
- Retry (`r`) on load failure (if applicable)
- Full theme support — uses OpenCode's active theme colors throughout
- Compatible with macOS, Linux, and Windows (WSL)