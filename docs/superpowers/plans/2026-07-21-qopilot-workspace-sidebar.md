# Qopilot Workspace Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the full-page Chat navigation rows with a branded Qopilot workspace header and two explicit actions.

**Architecture:** `SideMenu` continues to own routes and session creation; it renders a Chat-only workspace shell in expanded and compact forms. `ChatHistoryPanel` remains responsible only for the task index.

**Tech Stack:** React, TypeScript, React Router, Carbon icons, SCSS, Vitest, React Testing Library.

## Global Constraints

- Apply only to the teacher/admin full-page Chat branch in `SideMenu`.
- Use the Carbon `Bot` icon and token-driven styles; do not override `.cds--*` or use `!important`.
- Expanded mode is Qopilot brand, Back to Home, New Task, then task list.
- Compact mode is Back to Home and New Task icon actions only.
- Preserve existing task creation, selection, and `/chat?ai_session_id=<id>` routing.

---

### Task 1: Add the Qopilot workspace shell and actions

**Files:**
- Modify: `frontend/src/features/app/components/SideMenu.tsx:1-24, 382-418`
- Modify: `frontend/src/features/app/components/SideMenu.scss:80-170, 230-300`
- Test: `frontend/src/features/app/components/SideMenu.test.tsx`

**Interfaces:**
- Consumes: `go("/dashboard")`, `handleNewTask`, `compact`, and the existing `ChatHistoryPanel` props.
- Produces: Qopilot brand markup, Back to Home action, and New Task action with accessible labels.

- [ ] **Step 1: Write failing Chat-shell tests**

```tsx
expect(screen.queryByRole("button", { name: "Home" })).not.toBeInTheDocument();
expect(screen.getByText("Qopilot")).toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: /back to home/i }));
expect(screen.getByTestId("location-search")).toHaveTextContent("");
```

Render a second `SideMenu variant="panel" compact` at `/chat` and assert that Back and New Task exist while `Qopilot` and the task-index mock are absent.

- [ ] **Step 2: Run the SideMenu test to verify the new assertions fail**

Run: `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm test -- src/features/app/components/SideMenu.test.tsx`

Expected: FAIL because the old Home/Chat route links still render.

- [ ] **Step 3: Replace the Chat-only route links with the workspace shell**

```tsx
<div className="side-menu__qopilot-header"><Bot size={20} /><span><span>Q</span>opilot</span></div>
<button onClick={() => go("/dashboard")}><ArrowLeft size={16} /><span>{backToHomeLabel}</span></button>
<button onClick={handleNewTask}><Add size={16} /><span>{t("chatbot:ui.newTask")}</span></button>
```

Use compact CSS to hide the brand and task panel and retain the two icon actions.

- [ ] **Step 4: Run the SideMenu test and Carbon style gate**

Run: `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm test -- src/features/app/components/SideMenu.test.tsx && bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh`

Expected: both commands exit 0.

- [ ] **Step 5: Commit the workspace shell**

Run: `git add frontend/src/features/app/components/SideMenu.tsx frontend/src/features/app/components/SideMenu.scss frontend/src/features/app/components/SideMenu.test.tsx && git commit -m "feat(chat): add Qopilot workspace sidebar"`

### Task 2: Verify session behavior and both sidebar densities

**Files:**
- Verify only: `frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.test.tsx`
- Verify only: `frontend/src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx`

**Interfaces:**
- Consumes: existing `ChatHistoryPanel` and `QJudgeChatPanel` integration behavior.
- Produces: evidence that the shell redesign does not change task lifecycle behavior.

- [ ] **Step 1: Run the focused integration suite**

Run: `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm test -- src/features/app/components/SideMenu.test.tsx src/features/chatbot/components/chat-ui/ChatHistoryPanel.test.tsx src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx`

Expected: all selected tests pass.

- [ ] **Step 2: Inspect `/chat` at expanded and compact widths**

Verify expanded mode has the Qopilot wordmark and two text actions without Home/Chat links. Verify compact mode has only Back and New Task icon actions and no task list.

### Task 3: Align the expanded task hierarchy to the action icon axis

**Files:**
- Modify: `frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.module.scss:35-80`
- Test: `frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.test.tsx`

**Interfaces:**
- Consumes: the Qopilot shell action icon at the 1rem inline offset.
- Produces: an `任務` heading and session titles whose visible text begins at the same 1rem inline offset in the expanded sidebar.

- [ ] **Step 1: Add a layout contract test hook**

Add `data-testid="chat-history-heading"` to the task heading and `data-testid="chat-history-session-title"` to each non-renaming session title. Assert the heading and session title remain present in the flat task list; their visual axis is owned by the module stylesheet rather than JavaScript layout measurement.

- [ ] **Step 2: Update the shared inline offset**

```scss
.heading {
  padding: 0.625rem 1rem 0.125rem;
}

.item {
  margin: 0 0.5rem;
  padding: 0.25rem 0.5rem;
}
```

The resulting heading and item-name text start at `0.5rem + 0.5rem = 1rem`, matching the Qopilot action icon's `0.5rem` action-container padding plus `0.5rem` button padding. Do not change the compact layout; it hides the task panel.

- [ ] **Step 3: Run focused verification**

Run: `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm test -- src/features/chatbot/components/chat-ui/ChatHistoryPanel.test.tsx src/features/app/components/SideMenu.test.tsx && bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh`

Expected: all focused tests and the Carbon style gate exit 0.

- [ ] **Step 4: Commit the alignment correction**

Run: `git add frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.tsx frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.module.scss frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.test.tsx && git commit -m "style(chat): align Qopilot task hierarchy"`
