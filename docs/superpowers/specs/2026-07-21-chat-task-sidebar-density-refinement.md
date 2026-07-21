# Chat Task Sidebar Density Refinement

## Goal

Reduce sidebar visual competition so page navigation remains the primary selected state and tasks remain a compact index.

## Approved interaction hierarchy

- **Chat** remains the only high-emphasis page-navigation selection.
- The active task uses a restrained selected-layer background. It must not use the same visual weight as the Chat entry.
- **新增任務** is an action, not a selected destination: it has a transparent resting state and a Carbon hover/focus layer only.

## Density changes

- `新增任務`: compact action row with no persistent background, preserving a keyboard-visible focus outline.
- Task rows: target a 40px row with 8px horizontal padding and a compact text line-height.
- Overflow action: reduce its reserved and interactive footprint; show it on hover, keyboard focus, touch devices, and the active task so rename/delete remain discoverable.

## Constraints

- Keep the existing flat, most-recently-updated task order and creation routing behavior.
- Use Carbon tokens, do not override Carbon internal classes, and do not use `!important`.
- Preserve a single scrolling owner for the task list.

## Acceptance criteria

1. `新增任務` is visually flat until hover or focus.
2. Chat and the active task are no longer equally prominent.
3. Task rows and their overflow controls occupy visibly less vertical and horizontal space while remaining keyboard and touch accessible.
