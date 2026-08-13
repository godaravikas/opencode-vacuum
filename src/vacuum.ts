// Copyright (c) 2026 Vikas Godara
// SPDX-License-Identifier: MIT
import { tui } from "./tui.js"

// Default export required by OpenCode's plugin loader.
// For file-based plugins: { id, tui }
// For npm plugins: same shape, id is optional (falls back to package.json name)
export default {
  id: "opencode-vacuum",
  tui,
}
