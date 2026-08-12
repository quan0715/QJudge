# Frontend Carbon practices audit — 2026-08-12

## Remediation outcome

The strict remediation pass is complete for the current tree.

| Status | Result |
| --- | ---: |
| Inventoried | 1,357 files |
| Source/style files analyzed | 1,308 files |
| Strict Carbon blockers | **0** |
| Review findings retained for contextual follow-up | 2,137 |
| Exception-review findings | 54 |

The initial 249 hard blockers were removed. Production code no longer copies Carbon `.cds--*` / `.bx--*` selectors or uses `!important`; the only four Carbon class-name findings left are literal fixtures in tests and are classified as exceptions. The whole-tree strict gate now passes.

Architecture cleanup completed alongside the style remediation:

- Removed the unused `shared/layout/HeroBase.tsx` fallback after confirming `QJudgeHeroWidget` is the canonical hero.
- Removed the solver-local `TestCaseDetail` duplicate and routed the editor through `shared/ui/testcase/TestCaseDetail`.
- Removed duplicate custom tab-indicator logic from `StickyTabs` and delegated selection semantics to Carbon Tabs.
- Removed dead Classroom hero/tab overrides, modal internals, chart internals, editor internals, and other legacy Carbon implementation-detail overrides.
- Moved layout styling to public component `className` props and app-owned classes.
- Enabled a repeatable whole-tree strict gate and corrected Sass-comment parsing in the auditor.

## Initial audit baseline

The complete `frontend/src` tree was inventoried and reviewed against QJudge policy plus current IBM Carbon MCP documentation.

| Status | Files |
| --- | ---: |
| Inventoried | 1,356 |
| Source/style files analyzed | 1,307 |
| Clean | 980 |
| Findings | 309 |
| Exception-only review | 18 |
| Not applicable (`json`, assets, `.DS_Store`, and similar) | 49 |

The audit found 2,505 signals. They are deliberately split by confidence:

| Disposition | Findings | Files | Meaning |
| --- | ---: | ---: | --- |
| `blocker` | 249 | 70 | Confirmed QJudge policy violation: Carbon internal selector or `!important`. |
| `review` | 2,203 | 307 | Needs component context; do not bulk-rewrite without visual/behavioral review. |
| `exception-review` | 53 | 20 | Test, Copilot boundary, editor/media, or similar exception that still needs accessibility verification. |

This table records the state before remediation so the reduction remains reproducible.

## Carbon reference baseline

- IBM Carbon MCP verified on 2026-08-12.
- React examples resolve to Carbon v11 repository tag `v11.113.0`; MCP index timestamp is 2026-08-07.
- QJudge currently locks `@carbon/react` `1.97.0`; `package.json` declares `^1.96.0`.
- Primary guidance used: [button labeling](https://carbondesignsystem.com/components/button/accessibility/#labeling), [text-input labeling](https://carbondesignsystem.com/components/text-input/accessibility/#labeling-and-helper-text), [notification variants](https://carbondesignsystem.com/components/notification/usage/#variants), [modal focus handling](https://carbondesignsystem.com/components/modal/accessibility/#focus-handling), [Select versus Dropdown](https://carbondesignsystem.com/components/select/usage/#select-versus-dropdown), and the [2x Grid](https://carbondesignsystem.com/elements/2x-grid/overview/).

## P0 — confirmed public API/style violations (resolved)

The initial scan found 185 production references to `.cds--*` / `.bx--*` across 63 files and 64 `!important` declarations across 14 files. Overlap produced 70 affected files. The current strict count is zero.

Highest-concentration files:

| File | Confirmed blockers |
| --- | ---: |
| `features/classroom/screens/ClassroomDetailScreen.scss` | 31 |
| `shared/layout/QJudgeHeroWidget.module.scss` | 28 |
| `features/contest/components/admin/statistics/ContestResultDashboardPanel.module.scss` | 10 |
| `shared/ui/markdown/markdownEditor/MarkdownEditor.scss` | 7 |
| `features/changelog/screens/ChangelogScreen.tsx` | 6 |
| `features/contest/screens/ContestSubmissionListScreen.tsx` | 6 |
| `features/docs/components/DocsHeader.module.scss` | 6 |
| `features/problems/screens/problemsIdEdit/screen.scss` | 6 |
| `shared/ai/ArtifactPreview.module.scss` | 6 |

Complete blocker file list:

```text
features/app/components/UserMenu.tsx
features/changelog/screens/ChangelogScreen.module.scss
features/changelog/screens/ChangelogScreen.tsx
features/chatbot/components/chat-ui/ChainOfThought.module.scss
features/chatbot/components/chat-ui/SessionBadges.module.scss
features/classroom/components/CreateContestModal.module.scss
features/classroom/screens/ClassroomDetailScreen.scss
features/contest/components/admin/AdminInsightRail.module.scss
features/contest/components/admin/AdminOverviewCommandCenter.module.scss
features/contest/components/admin/DraftChecklistPanel.module.scss
features/contest/components/admin/examEditor/ExamEditorLayout.module.scss
features/contest/components/admin/examEditor/ExamQuestionEditCard.module.scss
features/contest/components/admin/examEditor/QuestionBankImportModal.module.scss
features/contest/components/admin/examEditor/QuestionSourcePanel.module.scss
features/contest/components/admin/OverviewActionWidgets.module.scss
features/contest/components/admin/statistics/AdminQuestionStatsGallery.module.scss
features/contest/components/admin/statistics/ContestResultDashboardPanel.module.scss
features/contest/components/ContestPreviewCard.scss
features/contest/components/CountdownProgress.module.scss
features/contest/screens/ContestStandingsScreen.tsx
features/contest/screens/ContestSubmissionListScreen.tsx
features/contest/screens/examDemo/StudentExamDemoScreen.module.scss
features/contest/screens/paperExam/PaperExamAnswering.module.scss
features/contest/screens/settings/grading/components/GradingBulkToolbar.module.scss
features/contest/screens/settings/grading/components/ScorePolicyMenu.module.scss
features/contest/screens/settings/grading/ContestExamGrading.module.scss
features/contest/screens/settings/grading/GradingPanel.module.scss
features/dashboard/screens/DashboardScreen.scss
features/docs/components/DocFeedback.tsx
features/docs/components/DocsHeader.module.scss
features/docs/components/DocsHeader.tsx
features/docs/components/DocTableOfContents.tsx
features/docs/components/QuickLinkCards.tsx
features/docs/screens/DocumentationScreen.module.scss
features/docs/screens/DocumentationScreen.tsx
features/landing/components/LandingMiniJudgeSection.scss
features/landing/sections/HeroSection.scss
features/landing/sections/SocialProofSection.scss
features/problems/components/list/ContestProblemTable.scss
features/problems/screens/problemsIdEdit/screen.scss
features/problems/screens/problemsIdSolve/screen.scss
features/question-banks/components/QuestionBankPreviewCard.module.scss
features/question-banks/screens/QuestionBankDetailScreen.module.scss
shared/ai/ArtifactPreview.module.scss
shared/components/dashboard/tabs/DashboardToolbar.module.scss
shared/layout/AdminShellLayout.module.scss
shared/layout/HeroBase.tsx
shared/layout/QJudgeHeroWidget.module.scss
shared/ui/autoSave/FieldSaveIndicator.module.scss
shared/ui/autoSave/GlobalSaveStatus.module.scss
shared/ui/dataCard/ActionWidgetCard.module.scss
shared/ui/filter/FilterPopover.module.scss
shared/ui/filter/FilterPopover.tsx
shared/ui/image/ImageEditDialog.scss
shared/ui/image/ImageEditDialog.tsx
shared/ui/markdown/markdownEditor/MarkdownEditor.scss
shared/ui/modal/SettingsModal.scss
shared/ui/navigation/IconModeSwitcher.module.scss
shared/ui/navigation/StickyTabs.scss
shared/ui/navigation/StickyTabs.tsx
shared/ui/problem/ProblemPreview.module.scss
shared/ui/solver/result/testcases/TestCaseDetail.module.scss
shared/ui/solver/styles/_solver-menu.scss
shared/ui/submission/SubmissionDataTable.scss
shared/ui/submission/TestResultDetail.module.scss
shared/ui/tag/TagStyle.scss
shared/ui/testcase/TestCaseDetail.module.scss
styles/_card-tile.scss
styles/globals.scss
styles/markdown.css
```

Migration applied:

1. Remove internal class names emitted from TSX and replace layout/type utilities with Carbon `Grid` / `Column`, type tokens, component props, or app-owned classes.
2. Replace SCSS internal-selector overrides through wrapper composition and documented props.
3. Remove `!important` by correcting ownership/specificity.
4. Turn on `--all` strict gating only after the baseline reaches zero; keep `--staged` enabled immediately.

## P1 — accessibility and semantic component findings

### Programmatic labels

- `features/contest/components/exam/ExamQuestionCard.tsx`: the auto-resizing answer field is ultimately rendered with `labelText=""`; its question prompt is not programmatically associated with the textarea.
- `features/problems/components/common/TestCaseAddModal.tsx`: two `TextArea` controls use a separate `FormLabel` without `id`/`htmlFor` association.
- `features/problems/components/common/TestCaseItem.tsx`: two edit `TextArea` controls have the same problem.
- `features/submissions/components/SubmissionDetailModal.tsx:100`: passive `Modal` has no `modalHeading`, `aria-label`, or `aria-labelledby`.
- Ten files rely on the default English `Loading` description (`"loading"`). Carbon remains technically labeled, but QJudge should pass localized, task-specific descriptions.

### Click targets

Seven high-confidence click targets should become `Button`, `ClickableTile`, links, or complete keyboard controls:

- `features/changelog/screens/ChangelogScreen.tsx:112`
- `features/docs/components/DocTableOfContents.tsx:119`
- `features/problems/components/list/ContestProblemTable.tsx:33`
- `shared/ui/announcement/AnnouncementCard.tsx:125`
- `shared/ui/solver/result/execution/ResultsPanel.tsx:182`
- `shared/ui/testcase/TestCaseSidebarList.tsx:62`
- `shared/ui/testcase/TestCaseSidebarList.tsx:80`

`features/contest/screens/settings/grading/GradingMobileNav.tsx:72` is a backdrop-dismiss gesture and should remain a documented contextual exception if Escape and the visible close button provide equivalent operation.

### Raw controls

- 163 native-control findings remain for contextual Carbon-first review.
- 32 findings in 15 files are test or `shared/copilot` package-boundary exceptions.
- Highest concentrations are `SideMenu.tsx` (13), `UserMenu.tsx` (11), `WorkspaceTopNav.tsx` (8), and `ComposerBar.tsx` (8). Shell navigation and custom composite controls should be migrated by component family, not one tag at a time.

`features/landing/sections/LandingHeader.tsx:61` also uses a small Carbon button inside a header, conflicting with QJudge's default 3rem navigation action sizing.

## P1 — notification and loading variants

There are 59 Carbon notification instances in 39 files. Most error states inside a task flow are legitimate `InlineNotification` usage, but these are strong migration candidates:

- `features/admin/screens/UserManagementScreen.tsx:340` and `:352`: transient operation error/success should use `useToast` unless the message is required for the current form state.
- `features/docs/components/DocFeedback.tsx:34`: the short “thanks” acknowledgement is transient feedback and fits toast semantics.
- `features/contest/components/admin/DraftChecklistPanel.tsx:162`: a loading state is rendered as an info notification; use skeleton or `InlineLoading`.
- `features/contest/components/exam/PaperExamResultsList.tsx`: loading and empty states are mixed with notifications; loading should use loading/skeleton patterns and empty results should use an empty-state component.

## P2 — token migration debt

These findings are not safe for a blind replacement because editor, media, chart, and landing-brand contexts can legitimately need fixed values.

| Rule | Findings | Files | Notes |
| --- | ---: | ---: | --- |
| Hard-coded spacing | 962 | — | Prefer Carbon spacing tokens and 2x Grid rhythm. |
| Hard-coded typography | 332 | — | Common literals are `0.875rem`, `0.75rem`, and `0.8125rem`; map product text to Carbon type tokens/mixins. |
| Hard-coded theme color | 585 | — | Keep media/canvas exceptions; migrate ordinary surfaces, text, and borders to semantic tokens. |

Largest review surfaces are `styles/markdown.css`, `ContestParticipantsDashboard.module.scss`, `ComposerBar.module.scss`, `GradingCardViewOnly.module.scss`, and `QJudgeHeroWidget.module.scss`. Syntax highlighting and image overlays should be documented exceptions; ordinary surface/text/border colors should become semantic tokens.

## P2 — scroll-owner review

There are 60 `overflow-y: auto|scroll` declarations requiring contextual review. Multiple declarations are not automatically wrong when panes are siblings or media-query alternatives. Highest-risk files to verify interactively are:

- `features/contest/components/admin/layout/AdminSplitLayout.module.scss` — five responsive/pane scroll declarations.
- `features/changelog/screens/ChangelogScreen.module.scss` — independently scrollable sidebar/content plus viewport-height layout.
- `features/docs/screens/DocumentationScreen.module.scss` — independently scrollable sidebar/content plus viewport-height layout.
- `shared/ui/modal/SettingsModal.scss` — nav and content both scroll; verify focus and small-height behavior.
- `shared/ui/solver/styles/_solver-results.scss` and `_solver-statement.scss` — sibling/result states need explicit ownership checks.

Validate these at `390x844`, `393x852`, `1366x768`, `1920x1080`, 200% zoom, light/dark themes, and keyboard-only navigation.

## Reproduce

Full inventory and per-line findings:

```bash
node .codex/skills/qjudge-quality-gates-owner/scripts/audit-carbon-practices.js \
  --root frontend/src \
  --format markdown
```

Staged hard gate:

```bash
bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh --staged
```

Whole-tree strict gate (currently passes with zero blockers):

```bash
bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh --all
```
