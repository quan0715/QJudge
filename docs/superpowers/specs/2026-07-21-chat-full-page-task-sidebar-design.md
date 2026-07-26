# Full-page Chat Task Sidebar Design

## Goal

Make the full-page Chat sidebar a compact, flat task index: users create and switch between tasks without time-group labels, timestamps, or repeated message icons.

## Scope

This change applies only to the persistent sidebar shown on the full `/chat` page. Classroom and exam workspace navigation remain unchanged.

## User-facing language

- Call each conversation a **task** in all Chat sidebar copy.
- Keep `session` as the internal Copilot/API term. It is not shown in the sidebar.
- Replace `新對話` with `新增任務` and replace the empty-state copy with `尚無任務`.

## Layout

```text
Home
Chat
────────────────
＋  新增任務
────────────────
任務
  [active] 量化分析這次 Q1 成績                     ⋯
            搜尋剛剛建立的 Exam 3
            AI 批改・Q6
```

`新增任務` is the first entry of the task panel, not a footer button. It has the same 48px action-row rhythm as sidebar navigation, a single leading Carbon add icon, and no redundant trailing plus icon. When activated, it creates a Copilot session and navigates to `/chat?ai_session_id=<id>`.

The `任務` heading is followed by one flat, most-recently-updated-first list. The ordering is retained but neither timestamps nor time buckets are rendered.

Each task row shows its title only. It has a 44–48px hit target, 12px inline padding, no leading message icon, and an overflow menu exposed on hover, keyboard focus, touch devices, and the active row. The active row uses Carbon selected-layer tokens; it does not gain a large card treatment.

## Components and ownership

- `features/chatbot/components/chat-ui/ChatHistoryPanel` owns task-index rendering, task copy, rename/delete controls, and the task-creation action placement.
- `features/app/components/SideMenu` owns Copilot session lifecycle and routing. It supplies the task callbacks to `ChatHistoryPanel` but does not format or group tasks.
- Existing Copilot session data and URL behavior remain unchanged.
- `ChatFullPage` and the main layout are not changed unless verification reveals a layout regression.

## States

- **Normal:** render the action entry, `任務` heading, and flat task list.
- **Empty:** render the action entry, `任務` heading, and `尚無任務`.
- **Active:** use the existing `currentSessionId`; show the contextual overflow action without a timestamp.
- **Rename/delete:** preserve the existing inline rename and Carbon overflow-menu behavior.
- **Creation failure:** retain the current no-navigation behavior when Copilot does not return a new session ID.

## Visual constraints

- Use Carbon tokens and existing application styles only; do not override Carbon internal classes or use `!important`.
- Preserve one intended scroll owner for the task list inside the Chat sidebar; the creation action and title remain outside that scroller.
- Do not introduce rounded-card, shadow, or decorative icon treatments.

## Acceptance criteria

1. The full-page Chat sidebar contains a top `新增任務` action entry and no bottom creation button.
2. User-visible copy refers to tasks, not chat history or new chats.
3. The task list has no date groups, timestamps, or leading message icons.
4. Creating, selecting, renaming, and deleting a task preserve the existing Copilot session and URL behavior.
5. Storybook demonstrates populated and empty task-index states.
6. Focus, hover, touch access, and keyboard selection remain available.
