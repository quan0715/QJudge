# Copilot Tool Call Confirmation Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw-JSON-first tool approval card with a compact, accessible generic confirmation surface.

**Architecture:** Keep the Copilot approval request contract intact. `HITLCard` derives a deterministic summary directly from each action argument object, renders that summary with Carbon primitives, and keeps the original pretty JSON in an initially collapsed details section. The QJudge slot remains the only application-specific presentation layer; shared Copilot contracts and MCP payloads do not change.

**Tech Stack:** React 19, TypeScript, Carbon React, Sass modules, Vitest, Testing Library, Storybook.

## Global Constraints

- Preserve existing `CopilotApprovalCardProps`, decisions, pending behaviour, and error semantics.
- Use Carbon components and Carbon design tokens; do not override `.cds--*` internals or use `!important`.
- Apply the same presentation to every tool; do not add tool-specific renderers.
- Keep full JSON available only under an initially collapsed `檢視技術明細` disclosure.
- Do not change MCP policies, payloads, backend APIs, or approval execution behaviour.

---

### Task 1: Build generic approval argument summaries

**Files:**

- Modify: `frontend/src/features/chatbot/components/chat-ui/HITLCard.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/HITLCard.test.tsx`

**Interfaces:**

- Consumes: `CopilotApprovalCardProps.request.actions`, where each action has `name: string` and optional `arguments?: Record<string, unknown>`.
- Produces: `summarizeActionArguments(args: Record<string, unknown>): Array<{ key: string; value: string }>` used only by `HITLCard`.

- [ ] **Step 1: Write the failing summary and disclosure test**

```tsx
it("summarizes scalar, array, and nested arguments while keeping JSON collapsed", () => {
  render(
    <HITLCard
      request={{
        actions: [{
          name: "qjudge_grading",
          arguments: { action: "batch_grade", grades: [{ score: 2 }], options: { dry_run: false } },
        }],
        allowedDecisions: ["approve", "reject"],
      }}
      onSubmit={vi.fn()}
    />,
  );

  expect(screen.getByText("action")).toBeInTheDocument();
  expect(screen.getByText("batch_grade")).toBeInTheDocument();
  expect(screen.getByText("grades")).toBeInTheDocument();
  expect(screen.getByText("1 items")).toBeInTheDocument();
  expect(screen.getByText("options")).toBeInTheDocument();
  expect(screen.getByText("1 fields")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "檢視技術明細" })).toHaveAttribute("aria-expanded", "false");
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run src/features/chatbot/components/chat-ui/HITLCard.test.tsx`

Expected: FAIL with missing `action`, `grades`, `options`, or `檢視技術明細` content.

- [ ] **Step 3: Add the generic summary and Carbon disclosure**

```tsx
function summarizeValue(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} items`;
  if (value && typeof value === "object") return `${Object.keys(value).length} fields`;
  if (typeof value === "string") return value;
  return String(value);
}
```

Render one key/value summary row per argument and place the existing `PrettyJsonFallback` in `<Accordion><AccordionItem title="檢視技術明細">...</AccordionItem></Accordion>`. Preserve the existing registered-renderer path.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- --run src/features/chatbot/components/chat-ui/HITLCard.test.tsx`

Expected: PASS.

### Task 2: Establish the approval card hierarchy and verify state behaviour

**Files:**

- Modify: `frontend/src/features/chatbot/components/chat-ui/HITLCard.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/HITLCard.module.scss`
- Modify: `frontend/src/features/chatbot/components/chat-ui/HITLCard.test.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/__stories__/HITLCard.stories.tsx`

**Interfaces:**

- Consumes: existing `onSubmit("approve" | "reject")`, `pending`, `interactionError`, and `allowedDecisions` props.
- Produces: a generic `HITLCard` with Carbon secondary/primary decisions and a Storybook regression fixture.

- [ ] **Step 1: Write the failing hierarchy and pending-state test**

```tsx
it("uses secondary cancel, primary confirm, and an execution label while pending", () => {
  render(
    <HITLCard
      request={{ actions: [{ name: "deploy" }], allowedDecisions: ["approve", "reject"] }}
      pending
      onSubmit={vi.fn()}
    />,
  );

  expect(screen.getByRole("button", { name: "取消" })).toHaveClass("cds--btn--secondary");
  expect(screen.getByRole("button", { name: "處理中…" })).toHaveClass("cds--btn--primary");
  expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "處理中…" })).toBeDisabled();
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run src/features/chatbot/components/chat-ui/HITLCard.test.tsx`

Expected: FAIL with missing `處理中…` button or incorrect Carbon button kind.

- [ ] **Step 3: Implement the Carbon card composition and token-based stylesheet**

```tsx
<div className={styles.footer}>
  {canReject && <Button kind="secondary" disabled={pending} onClick={() => handleDecision("reject")}>{t("ui.cancelAction")}</Button>}
  {canApprove && <Button kind="primary" disabled={pending} onClick={() => handleDecision("approve")}>{pending ? t("ui.processing") : t("ui.confirmAction")}</Button>}
</div>
```

Replace the split-footer rules with right-aligned, standard-size buttons. Add a compact header composition, summary key/value rows, bounded code detail styling, responsive maximum width, and no card-level vertical scrolling. Add a Storybook story with nested and array arguments that mirrors a real approval payload.

- [ ] **Step 4: Run focused tests and validate the Storybook build**

Run: `npm test -- --run src/features/chatbot/components/chat-ui/HITLCard.test.tsx && npm run build-storybook`

Expected: PASS and Storybook exits 0.

- [ ] **Step 5: Run project quality checks**

Run: `npm run check:i18n && npx tsc -b --pretty false && bash ../.codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh`

Expected: all commands exit 0.

- [ ] **Step 6: Commit only task-owned files**

Run: `git add frontend/src/features/chatbot/components/chat-ui/HITLCard.tsx frontend/src/features/chatbot/components/chat-ui/HITLCard.module.scss frontend/src/features/chatbot/components/chat-ui/HITLCard.test.tsx frontend/src/features/chatbot/components/chat-ui/__stories__/HITLCard.stories.tsx docs/superpowers/specs/2026-08-09-copilot-tool-call-confirmation-card-design.md docs/superpowers/plans/2026-08-09-copilot-tool-call-confirmation-card.md && git commit -m "feat(chat): improve tool confirmation card"`

Expected: commit contains only the listed task-owned files.

## Self-review

- Spec coverage: Task 1 implements generic summaries and collapsed technical detail; Task 2 implements hierarchy, pending/error preservation, responsive token-based presentation, Storybook, and quality verification.
- Placeholder scan: no deferred implementation or unspecified tests.
- Type consistency: all tasks consume the unchanged `CopilotApprovalCardProps` contract and `onSubmit` decision union.
