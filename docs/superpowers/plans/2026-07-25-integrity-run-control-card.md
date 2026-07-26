# Integrity Run Control Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the nested confirmation modal and render one compact Integrity Worker lifecycle card with one next action.

**Architecture:** Keep `IntegrityRunControlCard` as the contest-admin feature component and continue using the existing repository and Toast feedback. Derive a state presentation from the existing run state, render only that presentation, and use an inline purge confirmation rather than a Carbon Modal inside `SettingsModal`.

**Tech Stack:** React 19, TypeScript, Carbon React, CSS Modules, Vitest, Testing Library.

## Global Constraints

- Do not change lifecycle API, entity, repository, or backend behavior.
- Do not render a Carbon `Modal` from `IntegrityRunControlCard`.
- Use Carbon components and tokens; do not override `.cds--*` selectors or use `!important`.
- Keep all controls in `features/contest/components/admin`; shared `SettingsModal` remains unchanged.
- Keep purge confirmation; it requires an exact contest-name match before `purgeRun` is called.
- Do not modify unrelated dirty-worktree files.

---

### Task 1: Test the compact state presentation

**Files:**
- Modify: `frontend/src/features/contest/components/admin/IntegrityRunControlCard.test.tsx`
- Modify: `frontend/src/features/contest/components/admin/IntegrityRunControlCard.tsx`

**Interfaces:**
- Consumes: `ExamIntegrityRun` and `ExamIntegrityRepository` lifecycle methods.
- Produces: A rendered card with one primary lifecycle action and no nested dialog.

- [ ] **Step 1: Write failing state-card tests**

```tsx
it("shows only the stop action for a running run", async () => {
  renderCard({ ...run, computeState: "running", health: "healthy", warnings: [] });
  expect(await screen.findByText("執行中")).toBeVisible();
  expect(screen.getByRole("button", { name: "停止並封存" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "啟動 Integrity Worker" })).not.toBeInTheDocument();
  expect(screen.queryByText("最後 heartbeat")).not.toBeInTheDocument();
});

it("does not render a dialog when requesting purge", async () => {
  renderCard({ ...run, computeState: "destroyed", dataState: "archived" });
  fireEvent.click(await screen.findByRole("button", { name: "清除保留資料" }));
  expect(screen.getByLabelText("輸入考試名稱以確認")).toBeVisible();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
docker compose -f docker-compose.dev.yml exec -T frontend npm exec vitest run src/features/contest/components/admin/IntegrityRunControlCard.test.tsx
```

Expected: the tests fail because the current UI exposes multiple buttons, metrics, and a nested dialog.

- [ ] **Step 3: Implement the minimal state presentation**

```tsx
const presentation = getRunPresentation(run, t);

<Tile className={styles.card}>
  <Tag type={presentation.tagType}>{presentation.label}</Tag>
  <p>{presentation.description}</p>
  {run?.lastError ? <p className={styles.error}>{run.lastError}</p> : null}
  <Button kind={presentation.buttonKind} onClick={presentation.onClick}>
    {presentation.actionLabel}
  </Button>
</Tile>
```

Delete the inner `Modal`, metrics, duplicated state tags, preparation copy, disabled lifecycle buttons, and definition tooltip. Use an inline `TextInput` plus cancel/confirm buttons when purge confirmation is expanded.

- [ ] **Step 4: Verify GREEN**

Run the focused Vitest command from Step 2 and confirm all existing and new card tests pass.

### Task 2: Cover inline purge confirmation and preserve replacement creation

**Files:**
- Modify: `frontend/src/features/contest/components/admin/IntegrityRunControlCard.test.tsx`
- Modify: `frontend/src/features/contest/components/admin/IntegrityRunControlCard.tsx`

**Interfaces:**
- Consumes: `repository.purgeRun(contestId, runId)` and `contestName`.
- Produces: An inline confirmation flow that cannot purge before the exact contest name is entered.

- [ ] **Step 1: Write the failing purge interaction test**

```tsx
it("purges only after the inline contest-name confirmation matches", async () => {
  const purgeRun = vi.fn(async () => ({ ...run, computeState: "destroyed", dataState: "purged" }));
  renderDestroyedArchivedCard({ purgeRun });
  fireEvent.click(await screen.findByRole("button", { name: "清除保留資料" }));
  expect(screen.getByRole("button", { name: "確認清除" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("輸入考試名稱以確認"), { target: { value: "Midterm" } });
  fireEvent.click(screen.getByRole("button", { name: "確認清除" }));
  await waitFor(() => expect(purgeRun).toHaveBeenCalledWith("contest", "run-1"));
});
```

- [ ] **Step 2: Verify RED**

Run the focused Vitest command from Task 1 Step 2. Expected: failure because the current nested Modal owns purge confirmation.

- [ ] **Step 3: Implement inline destructive confirmation**

```tsx
{purgePending ? (
  <div className={styles.purgeConfirmation}>
    <TextInput id="integrity-run-purge-confirmation" ... />
    <Button kind="secondary" onClick={() => setPurgePending(false)}>取消</Button>
    <Button kind="danger" disabled={purgeConfirmation !== contestName} onClick={() => void execute("purge")}>
      確認清除
    </Button>
  </div>
) : (
  <Button kind="danger--tertiary" onClick={() => setPurgePending(true)}>清除保留資料</Button>
)}
```

- [ ] **Step 4: Verify GREEN**

Run the focused Vitest command and confirm the replacement-run test continues to pass.

### Task 3: Finish UI quality checks

**Files:**
- Modify: `frontend/src/features/contest/components/admin/IntegrityRunControlCard.module.scss`
- Modify: `frontend/src/features/contest/components/admin/IntegrityRunControlCard.stories.tsx`

**Interfaces:**
- Consumes: The compact card’s state presentations.
- Produces: Token-based spacing for a concise card and a Storybook state covering the inline purge form.

- [ ] **Step 1: Update the state-story fixture**

```tsx
export const ArchivedAfterDestroy: Story = {
  args: { repository: { ...meta.args.repository!, listRuns: async () => [makeRun({ computeState: "destroyed", dataState: "archived" })] } },
};
```

- [ ] **Step 2: Update CSS Module rules**

```scss
.card { display: grid; gap: var(--cds-spacing-05); margin: var(--cds-spacing-05); }
.status { display: flex; align-items: center; gap: var(--cds-spacing-03); }
.purgeConfirmation { display: grid; gap: var(--cds-spacing-04); }
```

Remove rules that only supported metrics, tag groups, and multi-button actions.

- [ ] **Step 3: Run final verification**

```bash
docker compose -f docker-compose.dev.yml exec -T frontend npm exec vitest run src/features/contest/components/admin/IntegrityRunControlCard.test.tsx src/features/contest/components/admin/settings/ContestSettingsModal.test.tsx src/shared/ui/modal/SettingsModal.test.tsx
docker compose -f docker-compose.dev.yml exec -T frontend npm run build
bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh
git diff --check
```

Expected: all targeted tests and build exit successfully; Carbon checker and diff check are clean.
