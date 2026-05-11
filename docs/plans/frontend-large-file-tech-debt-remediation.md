# Frontend Large File Tech Debt Remediation Plan

Status: In progress  
Created: 2026-05-09  
Last updated: 2026-05-10  
Scope: `frontend/src`

## Background

Frontend large files have accumulated in contest runtime, contest admin, grading, and infrastructure repository code. The main cost is not line count by itself, but mixed responsibilities: data loading, domain policy, UI composition, formatting, mutation orchestration, and local interaction state often live in the same file.

This plan defines a staged remediation path that reduces file size while preserving behavior and avoiding broad rewrites.

## Completed Work

| Slice | PR | Result |
| --- | --- | --- |
| Contest mapper modularization | #178 (dev → main) | `contest.mapper.ts` 1137 → 422 lines (-63%); extracted `contest.anticheat.mapper.ts` (442) and `contest.participant.mapper.ts` (264). `contest.mapper.ts` re-exports `mapContestAnticheatConfigDto`, `mapContestParticipantDto`, `mapParticipantDashboardDto` for backward compatibility. Public DTO types tightened from `any` to typed DTOs in `examQuestions.repository.ts` and the new mapper modules. |
| Inline `DynamicFooter` thin wrapper | follow-up | Removed `frontend/src/features/contest/screens/attendance/components/DynamicFooter.tsx` (50 lines). Footer JSX now lives directly in `StudentAttendanceScanScreen.tsx` using `MobileButtonSet` + Carbon `Button`/`InlineLoading`. The wrapper was a single-caller pass-through with no reuse. |
| Contest time formatting helper | local cleanup | Added `features/contest/utils/contestTimeFormat.ts` and moved repeated clock/date/duration helpers out of attendance projection, attendance scan, incident detail/card, proctoring modal, and countdown progress. Also moved paper exam progress summary from `StudentContestDashboardView.tsx` into `studentDashboardState.ts` with focused tests. |
| Contest scope role type fix | local cleanup | Replaced `currentUserRole?: UserRole` with `ContestScopeRole` (`platform_admin \| owner \| co_owner \| participant \| outsider \| anonymous`) in `contest.entity.ts` and `contest.dto.ts`, matching backend `get_contest_scope_role`. Added `isContestManagerScopeRole` helper; migrated raw string comparisons in `ContestExitModal`, `useContestLayoutState`, and `AdminDashboardScreen` to the helper. Removed obsolete `is_exam_questions_frozen` field from `ContestDetailDto` (backend already dropped it). |

This was an infrastructure-layer slice that did not touch the Phase 1–6 hotspots; the Phase table below still tracks the screen/component/repository hotspots that remain.

## Current Hotspots

Recent scan by line count:

| File | Lines | Primary issue |
| --- | ---: | --- |
| `frontend/src/features/contest/components/admin/statistics/ContestResultDashboardPanel.tsx` | 1428 | Dashboard view, chart state, data transforms, and export UI are coupled. |
| `frontend/src/features/contest/components/admin/AdminOverviewCommandCenter.tsx` | 1427 | Admin command UI mixes polling, derived status, actions, and widgets. |
| `frontend/src/features/contest/screens/admin/panels/AdminProctoringPanel.tsx` | 1392 | Incident list, event timeline, evidence display, image viewer, and selection state are coupled. |
| `frontend/src/features/contest/components/studentDashboard/StudentContestDashboardView.tsx` | 1328 | Student dashboard view mixes status policy, CTA policy, attendance actions, records, and layout. |
| `frontend/src/features/contest/screens/admin/panels/adminOverviewDashboard.model.ts` | 1153 | Model layer is too broad and contains multiple dashboard concerns. |
| `frontend/src/features/contest/components/ExamModeWrapper.tsx` | 1042 | Runtime shell, monitoring state, navigation lock, timer, submit flow, and question panel behavior are coupled. |
| `frontend/src/features/contest/screens/settings/ContestAiGradingScreen.tsx` | 1035 | Screen orchestration, grading mutations, and panel UI are coupled. |
| `frontend/src/features/contest/components/admin/examEditor/ExamQuestionEditCard.tsx` | 956 | One editor card owns too many question-type editing modes. |
| `frontend/src/features/contest/components/participants/ParticipantDashboardPane.tsx` | 938 | Participant status, filters, table/list UI, and operations are coupled. |

## High-Similarity Extraction Candidates

These items are better targets than generic file splitting because they remove repeated behavior or repeated visual patterns. Start with the low-risk pure helpers, then move to shared UI primitives only after the behavior is stable.

| Candidate | Similar locations | Suggested extraction | Risk | Expected result |
| --- | --- | --- | --- | --- |
| Contest time formatting and duration labels | `studentDashboard/studentDashboardState.ts`, `admin/overviewMetrics.utils.ts`, `admin/panels/adminOverviewDashboard.model.ts`, `attendance/StudentAttendanceScanScreen.tsx`, `attendance/AttendanceProjectionScreen.tsx`, `admin/IncidentDetail.tsx`, `admin/panels/AdminProctoringPanel.tsx` | `features/contest/utils/contestTimeFormat.ts` with `formatContestDuration`, `formatContestClockTime`, `formatContestDateTime` | Low | Removes repeated `formatTime` / `formatDuration` variants and fixes future locale/time overlap bugs in one place. |
| Countdown and completion progress blocks | `CountdownProgress.tsx`, `OverviewActionWidgets.tsx`, `OverviewInsightsPanel.tsx`, `AdminInsightRail.tsx`, `StudentContestDashboardView.tsx`, `AttendanceProjectionScreen.tsx` | Feature-level `ContestProgressMetric` / `ContestProgressBlock` component using Carbon `ProgressBar` | Low-medium | Dashboard, solve, projection, and admin panels use one progress hierarchy and spacing rule. |
| Incident detail and evidence rendering | `IncidentDetail.tsx`, `IncidentCard.tsx`, `AdminProctoringPanel.tsx`, event timeline evidence strip | Keep `IncidentDetail` as the single detail component; extract `IncidentEvidenceList` and `IncidentEvidenceGrid` | Medium | Panel and modal evidence display share behavior; image click/open/next/previous stays consistent. |
| Incident event labels, icons, and severity color | `IncidentCard.tsx`, `EventIncidentCard.tsx`, `AdminProctoringPanel.tsx`, `incidentEvents.ts` | `features/contest/components/admin/incidentPresentation.ts` | Low | Removes repeated label/icon decisions and prevents P-level labels from reappearing inconsistently. |
| Mobile/desktop action groups | `StudentContestDashboardView.tsx`, paper exam submit modal/footer paths | Use existing `MobileActionFooter` + `MobileButtonSet` directly; extract contest-specific action policy where it diverges, not a new button wrapper | Low | Bottom CTA layout stays consistent; no tertiary bottom buttons; route-like buttons consistently get arrow icons. |
| Question progress / question mini list | `ExamModeWrapper.tsx`, grading `QuestionSidebarScreen.tsx`, `GradingMatrixViewScreen.tsx`, paper exam question list UI | `ContestQuestionMiniList` with status color, selected state, and compact/expanded variants | Medium | Solve side panel and grading navigation stop duplicating status bars, Q labels, and selected-row treatment. |
| Dashboard section/card styling | `ContestParticipantsDashboard.module.scss`, `ContestResultDashboardPanel.module.scss`, `AdminOverviewCommandCenter.module.scss`, `GradingCardViewOnly.module.scss`, `AdminSplitLayout.module.scss` | Prefer existing `shared/components/dashboard` primitives; add a feature-level `ContestDashboardSection` only if shared primitives are insufficient | Medium | Reduces repeated panel borders, section headers, empty states, and dark surface spacing. |
| Submission progress modal/action flow | `useContestExamActions.ts`, `PaperExamAnsweringScreen.tsx`, `ExamModeWrapper.tsx`, `useForceSubmitArbiter.ts` | Keep `useExamSubmissionProgress`; extract submit CTA policy and progress modal wiring into one runtime helper | Medium | Manual submit, force submit, and paper exam submit use the same progress state machine. |

Recommended first quick wins:

1. Extract contest time formatting helpers.
2. Extract incident presentation labels/icons.
3. Extract student dashboard CTA policy.
4. Normalize progress blocks after the time helper extraction.

## Goals

- Reduce high-churn frontend files into smaller, named modules with clear ownership.
- Keep feature behavior stable while improving maintainability.
- Preserve architecture boundaries:
  - `core`: pure domain/entity logic only.
  - `infrastructure`: external API and DTO mapping only.
  - `shared`: reusable UI/utilities with no feature runtime dependency.
  - `features`: feature-specific workflow and composition.
- Add or preserve focused tests around extracted pure logic and action policy.
- Make future UI changes localized to a section component instead of large screen files.

## Non-Goals

- No visual redesign as part of this remediation.
- No route restructuring unless required by extraction.
- No domain behavior changes.
- No mass rename or formatting-only PR.
- No new abstraction layer unless it removes real duplication or clarifies ownership.

## Target File Size Guidelines

These are soft limits for new or refactored files:

| File type | Target |
| --- | ---: |
| Screen/page composition | `< 500` lines |
| Feature component | `< 300` lines |
| Hook | `< 250` lines |
| Pure model/selectors | `< 400` lines, with focused tests |
| Repository module | `< 400` lines per API domain |

Files above `700` lines should have a split plan or a clear reason to remain large.

## Remediation Strategy

Use vertical slices, not one large migration. Each PR should extract one responsibility and keep the original screen as the composition root.

Preferred extraction order:

1. Extract pure logic first.
2. Extract action/CTA policy.
3. Extract repeated UI sections.
4. Extract hooks only when they own a single concern.
5. Split repositories by backend API domain.

Avoid moving all code into one large `useSomething` hook. That only changes where the complexity lives.

## Phase 1: Student Contest Dashboard

Target:
`frontend/src/features/contest/components/studentDashboard/StudentContestDashboardView.tsx`

Suggested modules:

```text
frontend/src/features/contest/components/studentDashboard/
  StudentContestDashboardView.tsx
  StudentContestHero.tsx
  StudentContestStatusGrid.tsx
  StudentContestActionPanel.tsx
  StudentContestAttendanceActions.tsx
  StudentContestAnswerRecords.tsx
  studentContestDashboard.actions.ts
  studentContestDashboard.selectors.ts
```

Tasks:

- [ ] Move CTA visibility and button policy into `studentContestDashboard.actions.ts`.
- [ ] Move derived status labels and computed dashboard state into selectors/model helpers.
- [ ] Extract attendance-related CTA rendering into `StudentContestAttendanceActions.tsx`.
- [ ] Extract answer proof / back-to-exam / join-again action group into `StudentContestActionPanel.tsx`.
- [ ] Keep `StudentContestDashboardView.tsx` as data and layout composition only.
- [ ] Preserve existing tests and add focused tests for action policy.

Expected outcome:

- `StudentContestDashboardView.tsx` reduced from about `1328` lines to under `600` lines in the first pass.
- Future mobile button set and attendance CTA changes are localized.
- Tests cover action policy without requiring full screen render.

## Phase 2: Admin Proctoring Panel

Target:
`frontend/src/features/contest/screens/admin/panels/AdminProctoringPanel.tsx`

Suggested modules:

```text
frontend/src/features/contest/screens/admin/panels/proctoring/
  AdminProctoringPanel.tsx
  EventTimelinePane.tsx
  IncidentListPane.tsx
  IncidentDetailPanel.tsx
  EvidenceList.tsx
  EvidenceGrid.tsx
  useIncidentSelection.ts
  proctoringViewModel.ts
```

Tasks:

- [ ] Extract event timeline rendering from detail rendering.
- [ ] Use one incident detail component for overview and proctoring contexts.
- [ ] Keep evidence display mode configurable: list in panel, grid in modal.
- [ ] Move incident grouping and sorting into `proctoringViewModel.ts`.
- [ ] Move selected incident/image state into `useIncidentSelection.ts`.
- [ ] Add tests for grouping, key generation, and evidence selection.

Expected outcome:

- `AdminProctoringPanel.tsx` reduced from about `1392` lines to under `650` lines.
- Duplicate incident detail UI is removed.
- Evidence image viewer behavior becomes consistent across admin surfaces.

## Phase 3: Contest Runtime Shell

Target:
`frontend/src/features/contest/components/ExamModeWrapper.tsx`

Suggested modules:

```text
frontend/src/features/contest/components/runtime/
  ExamModeWrapper.tsx
  ContestRuntimeNavbar.tsx
  ContestRuntimeSidePanel.tsx
  ContestRuntimeQuestionList.tsx
  ContestRuntimeSubmitActions.tsx
  useContestRuntimeNavigationLock.ts
  useContestRuntimeTimers.ts
  contestRuntimeLayoutModel.ts
```

Tasks:

- [ ] Extract navbar and navigation-lock display logic.
- [ ] Extract side panel question list and mini view rendering.
- [ ] Extract submit action placement and runtime CTA policy.
- [ ] Keep anti-cheat, fullscreen, and screen-share behavior behind existing runtime hooks.
- [ ] Add tests around navigation lock and runtime route policy.

Expected outcome:

- Runtime shell changes no longer require editing one 1000-line wrapper.
- Student dashboard / solve / paper exam runtime behavior remains unified.
- Anti-cheat behavior remains unchanged and easier to audit.

## Phase 4: Admin Overview Command Center

Targets:

- `frontend/src/features/contest/components/admin/AdminOverviewCommandCenter.tsx`
- `frontend/src/features/contest/screens/admin/panels/adminOverviewDashboard.model.ts`

Suggested modules:

```text
frontend/src/features/contest/components/admin/overview/
  AdminOverviewCommandCenter.tsx
  AdminOverviewHeader.tsx
  AdminOverviewProgressSection.tsx
  AdminOverviewPublishSection.tsx
  AdminOverviewActionWidgets.tsx
  adminOverviewPolling.ts
  adminOverviewStatusModel.ts
  adminOverviewMetricsModel.ts
```

Tasks:

- [ ] Split polling and refresh orchestration from rendering.
- [ ] Split status/metrics derivation from action widget rendering.
- [ ] Keep publish/revoke grade UI in one section component.
- [ ] Reduce `adminOverviewDashboard.model.ts` into status, metrics, and participant-specific model files.
- [ ] Preserve current overview tests and add pure model tests for extracted helpers.

Expected outcome:

- Overview admin changes become section-local.
- Polling behavior is easier to reason about.
- Model layer becomes searchable by responsibility.

## Phase 5: Grading And Exam Editor

Targets:

- `frontend/src/features/contest/screens/settings/ContestAiGradingScreen.tsx`
- `frontend/src/features/contest/screens/settings/grading/useAiQuestionGrading.ts`
- `frontend/src/features/contest/screens/settings/grading/useGradingData.ts`
- `frontend/src/features/contest/components/admin/examEditor/ExamQuestionEditCard.tsx`

Tasks:

- [ ] Split grading data loading from grading mutations.
- [ ] Extract AI grading action policy from screen rendering.
- [ ] Split question editor by question type where behavior diverges.
- [ ] Keep shared editor primitives in the existing exam editor feature folder, not `shared`, unless reused outside contest.
- [ ] Add tests for grading mutation state transitions.

Expected outcome:

- AI grading UI and mutation logic can evolve independently.
- Question editor changes have lower regression risk.
- Editor card no longer owns every question type path.

## Phase 6: Infrastructure Repository Split

Note: mapper-layer modularization for contests was completed separately (see Completed Work). Phase 6 now focuses on repository-layer splits only.

Targets:

- `frontend/src/infrastructure/api/repositories/exam.repository.ts`
- `frontend/src/infrastructure/api/repositories/chatbot.repository.ts`

Suggested split:

```text
frontend/src/infrastructure/api/repositories/exam/
  examState.repository.ts
  examSubmission.repository.ts
  examEvidence.repository.ts
  examMonitoring.repository.ts
  index.ts
```

Tasks:

- [ ] Split exam repository by backend API concern.
- [ ] Keep DTO parsing and mapper calls inside infrastructure.
- [ ] Preserve public exports through an `index.ts` compatibility layer during migration.
- [ ] Remove compatibility exports after callers are updated.

Expected outcome:

- API changes become easier to locate.
- Feature code imports narrower repository modules.
- DTO/entity boundaries become easier to enforce.

## Quality Gates

Run these checks for each remediation PR:

```bash
cd frontend
npx tsc -b --pretty false
npm test -- --run <changed-test-files>
```

Run repository-level checks before merging larger slices:

```bash
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-naming.js --root frontend/src
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-architecture.js --root frontend/src
git diff --check
```

When touching Carbon UI or mobile action footers, also run:

```bash
bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh
```

## Acceptance Criteria

- [ ] No feature behavior change unless explicitly requested.
- [ ] Extracted pure logic has focused unit tests.
- [ ] Screen composition files become smaller and easier to scan.
- [ ] No new shared-to-feature dependency.
- [ ] No `.cds--*` style overrides introduced.
- [ ] No duplicated CTA or runtime navigation policy.
- [ ] Existing route behavior and API contracts remain compatible.

## Progress Tracking

| Phase | Status | Result |
| --- | --- | --- |
| Phase 1: Student Contest Dashboard | Not started | |
| Phase 2: Admin Proctoring Panel | Not started | |
| Phase 3: Contest Runtime Shell | Not started | |
| Phase 4: Admin Overview Command Center | Not started | |
| Phase 5: Grading And Exam Editor | Not started | |
| Phase 6: Infrastructure Repository Split | Not started | Mapper-layer split for contests done in PR #178; repository-layer split (`exam.repository.ts`, `chatbot.repository.ts`) still pending. |

## Expected Overall Results

- Contest feature large-file hotspots are reduced by responsibility instead of line-count-only cleanup.
- High-risk runtime behavior such as monitoring, fullscreen, navigation lock, attendance, and submission stays covered by existing tests.
- New contest UI changes become smaller PRs with less merge conflict risk.
- Repository and mapper code becomes easier to audit for API consistency.
- Frontend architecture boundaries remain explicit and enforceable.
