# Carbon UI Library Remediation Plan

> **For implementation:** Execute this plan in the current task with test-first checkpoints. No brainstorming or delegated execution is required.

**Goal:** Remove Carbon hard blockers across `frontend/src`, consolidate proven duplicate UI primitives, and leave the shared UI architecture with one canonical implementation per behavior.

**Architecture:** Feature screens compose domain behavior. `shared/ui`, `shared/layout`, and `shared/components/dashboard` own reusable presentation only and must not depend on feature code or Carbon implementation classes. Prefer Carbon public components and props; keep app-owned layout classes local.

**Tech Stack:** React 19, TypeScript, Carbon React, Sass modules, Vitest, Storybook, Docker Compose.

---

### Task 1: Lock the first remediation batch with failing checks

**Files:**
- Inspect: `frontend/src/shared/ui/**`
- Inspect: `frontend/src/shared/layout/**`
- Inspect: `frontend/src/shared/components/dashboard/**`
- Test: `.codex/skills/qjudge-quality-gates-owner/scripts/audit-carbon-practices.test.js`

1. Run the strict Carbon audit and record blocker files/counts.
2. Run focused searches for internal `.cds--*`/`.bx--*` selectors and `!important` in the first batch; confirm they fail before edits.
3. Preserve unrelated dirty files and exclude them from speculative cleanup.

### Task 2: Repair shared Carbon primitives

**Files:**
- Modify: `frontend/src/shared/ui/filter/FilterPopover.tsx`
- Modify: `frontend/src/shared/ui/filter/FilterPopover.module.scss`
- Modify: `frontend/src/shared/ui/navigation/StickyTabs.tsx`
- Modify: `frontend/src/shared/ui/navigation/StickyTabs.scss`
- Modify: other blocker files under `frontend/src/shared/ui/**` as verified

1. Replace copied Carbon class names with public Carbon components.
2. Remove selectors that reach into Carbon implementation markup.
3. Add or update focused component tests where behavior changes.
4. Re-run focused tests and the strict audit.

### Task 3: Consolidate duplicate testcase UI

**Files:**
- Modify: `frontend/src/shared/ui/solver/result/testcases/EditTestCasesPanel.tsx`
- Modify: `frontend/src/shared/ui/testcase/TestCaseDetail.tsx`
- Delete: `frontend/src/shared/ui/solver/result/testcases/TestCaseDetail.tsx`
- Delete: `frontend/src/shared/ui/solver/result/testcases/TestCaseDetail.module.scss`
- Modify: related barrel exports

1. Add a focused test for sample duplication, custom editing, deletion, and selection.
2. Map solver `TestCaseItem` to the canonical shared `TestCaseData` contract.
3. Replace the solver-local detail with the canonical shared component.
4. Remove the duplicate files and obsolete export.
5. Run focused unit and Storybook tests.

### Task 4: Remove compatibility-only exports and dead primitives

**Files:**
- Inspect/modify: `frontend/src/shared/ui/**/index.ts`
- Inspect/modify: `frontend/src/shared/layout/**`
- Inspect/modify: `frontend/src/shared/components/dashboard/**`

1. Prove every candidate has no runtime, test, story, barrel, or dynamic-string consumer.
2. Replace import paths for live consumers when one canonical component exists.
3. Delete only zero-consumer or fully replaced compatibility files/exports.
4. Run TypeScript/lint checks after each deletion batch.

### Task 5: Repair feature-level Carbon blockers

**Files:**
- Modify: blocker files listed in `docs/audits/carbon-frontend-audit-2026-08-12.md`

1. Process TypeScript copied-class blockers first.
2. Process Sass internal selectors by feature in small batches.
3. Replace `!important` with correct ownership/specificity or remove redundant overrides.
4. Run affected feature tests after each batch.

### Task 6: Verify and update the audit ledger

**Files:**
- Modify: `docs/audits/carbon-frontend-audit-2026-08-12.md`

1. Run quality-gate script tests.
2. Run frontend unit tests and lint through the development compose service.
3. Build Storybook when shared stories changed.
4. Run the strict Carbon audit and record the new counts plus remaining exceptions.
