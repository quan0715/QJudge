---
name: qjudge-carbon-overflow-ux-fix
description: Use when QJudge pages show unintended double scrollbars, clipped content, split-pane height problems, or mobile viewport jumps.
---

# QJudge Overflow Fix

1. Reproduce the affected page and viewport. Inspect which element actually scrolls and which content is clipped.
2. Trace height constraints from the shell to that element. Add `min-height: 0` or `min-width: 0` where a flex/grid item must shrink; do not apply them mechanically to every ancestor.
3. Choose scroll ownership per content region. Independent panes, editors, and lists may each scroll. Avoid redundant parent/child scrolling for the same content.
4. Keep the existing shell unless its geometry causes the bug. Use `100dvh` when dynamic viewport height is relevant; fixed positioning is an option, not the default fix.
5. Verify content remains reachable, keyboard focus is visible, and headers/footers do not overlap it. Test the reproduced viewport and one relevant responsive boundary; add theme or virtual-keyboard checks when affected.

Use app-owned classes and Carbon public APIs. Do not hide overflow indiscriminately: it can clip menus, focus rings, and content. Lock body scroll only for shells/dialogs that need it, restoring the previous value on unmount.

Shared layout examples live in `../qjudge-ui-carbon-owner/references/overflow-layout-playbook.md`. Use `qjudge-ui-carbon-owner` for Carbon guidance and `qjudge-env-compose-owner` for runtime commands. Select focused tests or build checks according to what changed.
