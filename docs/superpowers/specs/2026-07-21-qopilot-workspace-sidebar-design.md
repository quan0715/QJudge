# Qopilot Workspace Sidebar Design

## Goal

Treat the full-page Chat sidebar as the Qopilot workspace, not as a duplicate of global page navigation.

## Expanded sidebar

```text
[agent icon] Qopilot       Q uses the primary interactive color
← 返回首頁                 action
＋ 新增任務                action
任務
  task list
```

- Remove the Home link and the selected Chat route link from the Chat sidebar only.
- The Qopilot brand is an informational header, not a navigable route.
- `返回首頁` navigates to `/dashboard` and is styled as a low-emphasis action.
- `新增任務` continues to create and select a Copilot session using the existing callback.
- The existing task list remains below the two actions.

## Collapsed sidebar

- Hide the Qopilot wordmark and task list.
- Retain exactly two accessible icon actions: back to home and new task.
- Tooltips and aria labels use the same translated labels as their expanded counterparts.

## Visual constraints

- The `Q` glyph is primary-colored; the rest of `opilot` uses primary text color.
- Pair the wordmark with a Carbon agent icon.
- Use the expanded action icon's left edge as the shared alignment axis for the `任務` heading and every session title. The action labels continue after their icons; the task hierarchy does not introduce a second text column.
- Use Carbon tokens, retain keyboard focus treatment, and do not override Carbon internal classes or use `!important`.
- This shell applies only when rendering the teacher/admin full-page Chat sidebar; classroom, contest, and other side nav variants are unchanged.

## Acceptance criteria

1. Chat sidebar contains no Home or Chat link.
2. Expanded mode exposes Qopilot branding, Back to Home, New Task, then the task list.
3. Compact mode exposes Back to Home and New Task icon actions only.
4. Back action navigates to `/dashboard`; New Task preserves the existing session creation and routing behavior.
