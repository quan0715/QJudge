# Chat Task Sidebar Density Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Chat task sidebar visually subordinate to page navigation while reducing the density of task rows and controls.

**Architecture:** Keep data flow and the `ChatHistoryPanel` public API unchanged. Make the hierarchy entirely through local CSS tokens, and remove the redundant icon from the independent `ChatTopBar` session dropdown.

**Tech Stack:** React, TypeScript, Carbon React, CSS Modules, Vitest, React Testing Library.

## Global Constraints

- Keep the flat newest-first task order and the existing session create/select/rename/delete behavior.
- Use Carbon tokens only; do not override `.cds--*` internals or use `!important`.
- `新增任務` has no resting background and only gains a layer on hover or keyboard focus.
- Chat remains the high-emphasis page selection; the current task gets only a restrained local indicator.
- Preserve one scroll owner for the task list and touch/keyboard access to overflow actions.

---

### Task 1: Compact the persistent task sidebar

**Files:**
- Modify: `frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.module.scss`
- Test: `frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.test.tsx`

**Interfaces:**
- Consumes: existing `ChatHistoryPanel` props and `styles.newTaskAction`, `styles.item`, `styles.active`, and `styles.overflow` class bindings.
- Produces: a transparent resting task-creation row, a 40px task row, and a low-emphasis active-task indicator.

- [ ] **Step 1: Extend the rendering test for the unchanged compact action hierarchy**

```tsx
expect(screen.getByRole("button", { name: "ui.newTask" })).toBeInTheDocument();
expect(screen.getByText("ui.tasks")).toBeInTheDocument();
```

- [ ] **Step 2: Run the focused test before changing styles**

Run: `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm test -- src/features/chatbot/components/chat-ui/ChatHistoryPanel.test.tsx`

Expected: PASS, establishing behavior before the visual-only refinement.

- [ ] **Step 3: Apply token-based density and hierarchy styles**

```scss
.newTaskAction {
  min-height: 2.5rem;
  background: transparent;

  &:hover { background: var(--cds-layer-hover-01); }
  &:focus-visible { outline: 2px solid var(--cds-focus); }
}

.item { min-height: 2.5rem; padding: 0.25rem 0.5rem; }
.active { background: transparent; box-shadow: inset 0.125rem 0 0 var(--cds-border-interactive); }
```

Keep the overflow visible on touch devices and only reveal it on hover or focus on desktop.

- [ ] **Step 4: Run the focused test and Carbon style gate**

Run: `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm test -- src/features/chatbot/components/chat-ui/ChatHistoryPanel.test.tsx && bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh`

Expected: both commands exit 0.

- [ ] **Step 5: Commit the sidebar refinement**

```bash
git add frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.module.scss frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.test.tsx
git commit -m "style(chat): refine task sidebar hierarchy"
```

### Task 2: Remove redundant icons from the session dropdown

**Files:**
- Modify: `frontend/src/features/chatbot/components/chat-ui/ChatTopBar.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/ChatTopBar.module.scss`
- Test: `frontend/src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx`

**Interfaces:**
- Consumes: existing full-page `ChatTopBar` session dropdown.
- Produces: title-and-time dropdown rows without the `Chat` icon or its styling hook.

- [ ] **Step 1: Run the existing full-page panel test before the implementation**

Run: `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm test -- src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx`

Expected: PASS, establishing that the dropdown's selection behavior is already covered before its purely visual icon is removed.

- [ ] **Step 2: Remove the icon import, dropdown icon element, and CSS rule**

```tsx
import { Add, Close, ChevronDown, RecentlyViewed } from "@carbon/icons-react";

<span className={styles.dropdownItemTitle}>{s.title || t("ui.newTask")}</span>
```

Delete `.dropdownItemIcon` and reduce `.dropdownItem` spacing to its title/time-only rhythm.

- [ ] **Step 3: Run the full-page chat test**

Run: `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm test -- src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx`

Expected: the session dropdown still supports selection and session management.

- [ ] **Step 4: Commit the dropdown refinement**

```bash
git add frontend/src/features/chatbot/components/chat-ui/ChatTopBar.tsx frontend/src/features/chatbot/components/chat-ui/ChatTopBar.module.scss
git commit -m "style(chat): simplify session dropdown rows"
```

### Task 3: Verify the integrated full-page Chat view

**Files:**
- Verify only: `frontend/src/features/app/components/SideMenu.tsx`
- Verify only: `frontend/src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx`

**Interfaces:**
- Consumes: the existing `onNewTask` callback and current-session selection supplied by `SideMenu`.
- Produces: proof that density changes do not alter task lifecycle or routing behavior.

- [ ] **Step 1: Run sidebar and full-page integration tests**

Run: `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm test -- src/features/chatbot/components/chat-ui/ChatHistoryPanel.test.tsx src/features/app/components/SideMenu.test.tsx src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx`

Expected: all selected tests pass.

- [ ] **Step 2: Inspect the local `/chat` page**

Check that Chat is the only broad selected row, `新增任務` is transparent before hover, the active task uses a narrow indicator, task rows are compact, and the title dropdown has no icons.
