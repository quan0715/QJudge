# Exam design alignment acceptance

Validated on 2026-11-09 from the isolated feature checkout, based on dev `9add20cb3`. Refreshed dev `7997a67eb` only changes the judge image and does not change these UI/export files. The original checkout and development volumes were preserved. Screenshots use existing development fixtures; other students' names are masked in the standings image.

- Frontend: `TZ=UTC npm test`, 316 files / 2030 tests pass. New regressions cover a title-row action slot, published/unpublished report dialogs remaining visible while the overview is hidden, and retaining an expanded original answer when grades are withdrawn.
- Typecheck, build, architecture and naming checks pass. Targeted ESLint has zero errors and one existing `tr` effect-dependency warning. Build retains the existing large-chunk warning. Existing i18n namespace gaps are recorded separately; new publication labels exist in all four locales.
- Backend (database-free, owning development runtime): 18 tests pass across report score trends, document printing, literal paper answers, PDF conversion repeated table headers and four distinct verdict colors. The teacher-sheet database test and existing standings/export database suites run in PR CI per the environment policy.
- Browser: 12 cases across desktop 1440px, tablet 768px, phone 390px and dark 1440px. Published/unpublished paper and coding records all align the download action with the title, expand/collapse correctly, and have no page errors or document horizontal overflow. Phone table column bounds were checked after the final sizing fix.
- Download dialogs open and close from the visible review header for published paper, unpublished proof and coding. The paper appeal dialog opens and closes without submitting anything. These dialogs portal into the visible review slot, retaining the Carbon theme instead of remaining inside the hidden overview.
- Actual Django download views return 200 `application/pdf` for published paper, unpublished proof and coding. Baseline acceptance rendered six document types, 90 pages in total, with no words outside page bounds. The latest correction rerendered the 11-page teacher answer key, 7-page student paper report, 15-page coding report and an additional 3-page synthetic result table. All 40 teacher answer/explanation labels align with their content; all refreshed documents have zero out-of-page words. Real `<thead>` headings repeat on both synthetic continuation pages. The earlier 180-line answer/feedback render spans 8 pages with both ending markers preserved.
- Independent whole-change review found two important issues (AC after allocation reduction, structured paragraph/literal-text loss). Both have failing-before / passing-after regressions. No newly introduced grading disclosure was found.

## Behavior and design

PDF answer, explanation and feedback sections now stack the label above the content at the same left edge, removing the fixed label column. Result icons alone use the light exam status colors: green for accepted, amber for partial points, red for failed attempts and gray for no submission. Scores and table backgrounds stay neutral.

作答內容 retains the collapsible question table used on main. Paper details show the submitted answer, feedback and appeals; coding details lazy-load submission history. Header download actions share the title row, with descriptive text below. Unpublished exams offer 作答證明; published exams offer 成績單.

The Figma sample now has editable collapsed/expanded variants for paper and coding, plus published/unpublished examples. Its shared PageHeader aligns download actions with the title. Existing synthetic sample data was retained. Figma images below are explicitly reference images, separate from implementation captures. No local exam data was uploaded to Figma.

Latest dev reserves reference answers/explanations for teachers. This change preserves that boundary. Student proof downloads, appeals, score policies and lazy submission history remain available. The broader Figma state-library expansion (every error/focus/mobile/dark specimen) is not represented as complete.

Structured formula nodes preserve escaped LaTeX source in PDFs; the existing WeasyPrint renderer does not provide browser KaTeX typesetting. No new formula service or dependency is introduced.

## Implementation screenshots

| Paper, published | Expanded original answer |
| --- | --- |
| ![Published paper, collapsed](answers-desktop.png) | ![Published paper, expanded](answers-desktop-expanded.png) |

| Paper, unpublished | Expanded submitted answer |
| --- | --- |
| ![Unpublished paper, collapsed](proof-desktop.png) | ![Unpublished paper, expanded](proof-desktop-expanded.png) |

| Coding, collapsed | Coding, submission history |
| --- | --- |
| ![Coding, collapsed](coding-desktop.png) | ![Coding, expanded](coding-desktop-expanded.png) |

| Phone, published | Phone, expanded |
| --- | --- |
| ![Phone published](answers-phone.png) | ![Phone published expanded](answers-phone-expanded.png) |

| Phone, unpublished | Phone, expanded proof |
| --- | --- |
| ![Phone proof](proof-phone.png) | ![Phone proof expanded](proof-phone-expanded.png) |

| Tablet | Tablet, expanded |
| --- | --- |
| ![Tablet](answers-tablet.png) | ![Tablet expanded](answers-tablet-expanded.png) |

| Dark | Dark, expanded |
| --- | --- |
| ![Dark paper](answers-dark.png) | ![Dark paper expanded](answers-dark-expanded.png) |

| Dark coding | Standings, names masked |
| --- | --- |
| ![Dark coding](coding-dark.png) | ![Standings](standings-desktop.png) |

| Download dialog | Appeal dialog, no submission |
| --- | --- |
| ![Download report](report-download-dialog.png) | ![Appeal dialog](appeal-dialog.png) |

## Rendered PDF screenshots

| Coding report with column headings | Teacher answers and explanations |
| --- | --- |
| ![Coding report](coding-report.png) | ![Teacher answer key](teacher-answer-key.png) |

The next pair uses a deliberately long synthetic table to demonstrate all four result colors and header repetition. It is an acceptance fixture, not an additional product report.

| Long table, page 1 | Continued table, page 2 |
| --- | --- |
| ![Table headers](report-header-page1.png) | ![Repeated table headers](report-header-page2.png) |

## Figma references

| Paper, published | Coding, published |
| --- | --- |
| ![Figma paper reference](figma-answer-content.png) | ![Figma coding reference](figma-coding-content.png) |

Editable sources: [paper](https://www.figma.com/design/ehoK8UeCxoSxyVZbi334AS?node-id=32-1355), [coding](https://www.figma.com/design/ehoK8UeCxoSxyVZbi334AS?node-id=35-1531).
