# Full-page Chat Task Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the full-page Chat history sidebar with a compact, flat task list and a top-level 「新增任務」 action entry.

**Architecture:** `ChatHistoryPanel` stays feature-local and renders Copilot sessions as user-facing tasks. `SideMenu` remains the owner of Copilot session lifecycle and routing. It passes task callbacks to the panel; the panel uses `updatedAt` only to order rows and never renders time metadata.

**Tech Stack:** React 19, TypeScript, SCSS modules, Carbon React, react-i18next, Vitest, Testing Library, Storybook.

## Global Constraints

- Change only the `/chat` full-page sidebar; do not alter classroom or exam navigation.
- Use 「任務」 in Chat sidebar copy; retain `session` in Copilot/API code.
- Use Carbon tokens; never override `.cds--*` internals or use `!important`.
- Keep one scroll owner: task rows scroll, while the action and title stay fixed.
- Task rows remain keyboard-selectable and keep overflow controls usable on hover, focus, active, and touch contexts.

---

### Task 1: Test and implement the flat task index

**Files:**
- Create: `frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.test.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.tsx`

**Interfaces:**
- Consumes: `readonly CopilotSessionSummary[]`, `currentSessionId`, session callbacks, and `onNewTask?: () => void | Promise<void>`.
- Produces: flat newest-first task rows with a top action entry.

- [ ] **Step 1: Write failing tests for the visible contract**

```tsx
it("renders tasks newest first without time labels", () => {
  render(<ChatHistoryPanel {...props} sessions={[olderTask, newestTask]} />);

  expect(screen.getByText("ui.tasks")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /Newest task|Older task/ })
    .map((item) => item.textContent)).toEqual(["Newest task", "Older task"]);
  expect(screen.queryByText("ui.groupToday")).not.toBeInTheDocument();
  expect(screen.queryByText("ui.groupOlder")).not.toBeInTheDocument();
});

it("places and invokes the new-task action before the list", async () => {
  const onNewTask = vi.fn();
  render(<ChatHistoryPanel {...props} onNewTask={onNewTask} />);
  await userEvent.click(screen.getByRole("button", { name: "ui.newTask" }));
  expect(onNewTask).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Verify the test fails**

Run: `npm test -- --run src/features/chatbot/components/chat-ui/ChatHistoryPanel.test.tsx`

Expected: FAIL because the implementation still groups history and exposes `onNewChat`.

- [ ] **Step 3: Implement the component contract**

Remove `HistoryGroup`, `groupSessions`, `formatRelativeTime`, time labels, leading `ChatIcon`, `showNewChatButton`, and the footer. Sort rows internally and add the header:

```tsx
const orderedSessions = useMemo(
  () => [...sessions].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()),
  [sessions],
);

<div className={styles.header}>
  {onNewTask && (
    <button type="button" className={styles.newTaskAction} onClick={onNewTask}>
      <Add size={16} />
      <span>{t("ui.newTask")}</span>
    </button>
  )}
  <h2 className={styles.heading}>{t("ui.tasks")}</h2>
</div>
```

Render `orderedSessions` directly. Use `ui.defaultTaskTitle` as the fallback title. Preserve inline rename/delete and the div-based task row to avoid nesting Carbon overflow-menu buttons inside a button.

- [ ] **Step 4: Verify the component test passes**

Run: `npm test -- --run src/features/chatbot/components/chat-ui/ChatHistoryPanel.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.tsx frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.test.tsx
git commit -m "feat(chat): present sessions as tasks"
```

### Task 2: Apply compact Carbon styling and preserve session routing

**Files:**
- Modify: `frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.module.scss`
- Modify: `frontend/src/features/app/components/SideMenu.tsx`
- Modify: `frontend/src/features/app/components/SideMenu.test.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/QJudgeCopilotSlotComponents.tsx`

**Interfaces:**
- Consumes: `ChatHistoryPanel` from Task 1 with `onNewTask`.
- Produces: existing Copilot create/select/rename/delete behavior, without a bottom creation button.

- [ ] **Step 1: Update the SideMenu mock test first**

Make the mocked panel accept `onNewTask` and expose a `ui.newTask` button. Change the creation test to click it while retaining the current URL assertion:

```tsx
fireEvent.click(await screen.findByText("ui.newTask"));
await waitFor(() => expect(mockCopilotSessions.create).toHaveBeenCalledTimes(1));
expect(screen.getByTestId("location-search")).toHaveTextContent(
  "?ai_session_id=session-new",
);
```

- [ ] **Step 2: Verify the routing test fails**

Run: `npm test -- --run src/features/app/components/SideMenu.test.tsx -t "creates a Copilot session"`

Expected: FAIL because `SideMenu` still passes `onNewChat`.

- [ ] **Step 3: Wire the new presentation callback**

In `SideMenu.tsx`, rename `handleNewChat` to `handleNewTask`, keep its existing `createSession()` and `goToChatSession()` logic, and pass it as `onNewTask`. Update `QJudgeCopilotSlotComponents.tsx` to pass `onNewTask={onCreate}`. Do not change URL query naming or Copilot session data.

- [ ] **Step 4: Replace visual grouping with a fixed header and scrollable rows**

Implement these layout invariants in `ChatHistoryPanel.module.scss` using only existing Carbon tokens:

```scss
.header { flex-shrink: 0; padding: 0.375rem 0; }
.newTaskAction { min-height: 3rem; width: calc(100% - 1rem); margin: 0 0.5rem; }
.heading { margin: 0; padding: 0.75rem 0.75rem 0.25rem; }
.list { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.item { min-height: 2.75rem; margin: 0 0.25rem; padding: 0.25rem 0.75rem; }
```

Keep the existing selected, hover, focus, and desktop/touch overflow-menu behavior. Do not add a right-side plus, shadows, card chrome, or a task-message icon.

- [ ] **Step 5: Run focused UI and routing tests**

Run: `npm test -- --run src/features/chatbot/components/chat-ui/ChatHistoryPanel.test.tsx src/features/app/components/SideMenu.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.module.scss frontend/src/features/app/components/SideMenu.tsx frontend/src/features/app/components/SideMenu.test.tsx frontend/src/features/chatbot/components/chat-ui/QJudgeCopilotSlotComponents.tsx
git commit -m "style(chat): compact the task sidebar"
```

### Task 3: Convert Chat copy and Storybook to task terminology

**Files:**
- Create: `frontend/src/features/chatbot/adapters/qJudgeCopilotTranslations.test.ts`
- Modify: `frontend/src/i18n/locales/zh-TW/chatbot.json`
- Modify: `frontend/src/i18n/locales/en/chatbot.json`
- Modify: `frontend/src/i18n/locales/ja/chatbot.json`
- Modify: `frontend/src/i18n/locales/ko/chatbot.json`
- Modify: `frontend/src/features/chatbot/adapters/qJudgeCopilotTranslations.ts`
- Modify: `frontend/src/features/chatbot/components/chat-ui/ChatTopBar.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/__stories__/ChatHistoryPanel.stories.tsx`

**Interfaces:**
- Consumes: `ui.newTask`, `ui.noTasks`, `ui.tasks`, and `ui.defaultTaskTitle`.
- Produces: task terminology in Chat sidebar, Copilot session labels, top bar defaults, and stories.

- [ ] **Step 1: Write a failing translation-adapter test**

Inject a `translate` spy into `QJudgeCopilotTranslations`; call `t("session.new")` and `t("session.empty")`; then assert:

```tsx
expect(translate).toHaveBeenCalledWith(
  "chatbot:ui.newTask",
  expect.objectContaining({ defaultValue: expect.any(String) }),
);
```

- [ ] **Step 2: Verify the translation test fails**

Run: `npm test -- --run src/features/chatbot/adapters/qJudgeCopilotTranslations.test.ts`

Expected: FAIL because session keys still map to `ui.newChat` and `ui.noHistory`.

- [ ] **Step 3: Add and use locale keys**

Add the following `ui` keys in all four chatbot locale files, with language-equivalent values:

```json
"newTask": "新增任務",
"noTasks": "尚無任務",
"tasks": "任務",
"defaultTaskTitle": "任務 {{id}}…"
```

Map Copilot `session.new` and `session.empty` to the new keys. Update `ChatTopBar.tsx` fallbacks from `ui.newChat` to `ui.newTask`. Update the Storybook import metadata, description, and populated/empty stories so they pass `onNewTask` and describe a flat task index.

- [ ] **Step 4: Verify translations and stories compile through tests**

Run: `npm test -- --run src/features/chatbot/adapters/qJudgeCopilotTranslations.test.ts src/features/chatbot/components/chat-ui/ChatHistoryPanel.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/i18n/locales/zh-TW/chatbot.json frontend/src/i18n/locales/en/chatbot.json frontend/src/i18n/locales/ja/chatbot.json frontend/src/i18n/locales/ko/chatbot.json frontend/src/features/chatbot/adapters/qJudgeCopilotTranslations.ts frontend/src/features/chatbot/adapters/qJudgeCopilotTranslations.test.ts frontend/src/features/chatbot/components/chat-ui/ChatTopBar.tsx frontend/src/features/chatbot/components/chat-ui/__stories__/ChatHistoryPanel.stories.tsx
git commit -m "feat(chat): use task terminology"
```

### Task 4: Verify the complete full-page Chat change

**Files:**
- Modify: `docs/superpowers/plans/2026-07-21-chat-full-page-task-sidebar.md`

**Interfaces:**
- Consumes: the completed component, sidebar, copy, tests, and stories.
- Produces: verification evidence for the full-page Chat task sidebar.

- [ ] **Step 1: Run full focused tests**

Run: `npm test -- --run src/features/chatbot/components/chat-ui/ChatHistoryPanel.test.tsx src/features/app/components/SideMenu.test.tsx src/features/chatbot/components/chat-ui/QJudgeChatPanel.test.tsx`

Expected: PASS.

- [ ] **Step 2: Run static and quality gates**

```bash
npm run build
npm run check:i18n
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-naming.js --root frontend/src
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-architecture.js --root frontend/src --policy compat
bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh
npm run build-storybook
```

Expected: every command exits successfully, or any pre-existing unrelated failure is recorded without widening the change.

- [ ] **Step 3: Mark completed steps and commit the plan**

```bash
git add docs/superpowers/plans/2026-07-21-chat-full-page-task-sidebar.md
git commit -m "docs(chat): plan task sidebar implementation"
```

## Plan self-review

- Spec coverage: Tasks 1–3 cover the action entry, flat terminology, removal of time and icon metadata, preserved session behavior, and Storybook. Task 4 covers full integration and quality gates.
- Placeholder scan: no unresolved markers or generic implementation steps remain.
- Type consistency: `onNewTask` is the presentation callback in component, sidebar, Copilot slot, tests, and stories; Copilot data remains `session` internally.
