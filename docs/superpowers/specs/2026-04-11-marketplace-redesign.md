# Marketplace Redesign & Question Bank List Page Removal

**Date:** 2026-04-11
**Status:** Approved

## Overview

Remove the `/question-banks` list page and enhance `/marketplace` as the primary discovery surface. Add a teacher publish flow (with admin approval) and a subscription mechanism for users to access marketplace banks in the Contest Editor.

## 1. Remove `/question-banks` List Page

### Files to delete
- `frontend/src/features/question-banks/screens/QuestionBanksScreen.tsx`
- `frontend/src/features/question-banks/screens/QuestionBanksScreen.module.scss`

### Files to modify
- **`routes.tsx`**: Remove `questionBankListRoute` export
- **`App.tsx`**: Remove the route mount for `questionBankListRoute`
- **`SideMenu.tsx`**: Remove "Question Banks" parent link (L133-138). Keep individual bank list links (L194-201) and "Marketplace" link (L141-146)
- **i18n files** (`en`, `zh-TW`, `ja`, `ko`): Remove keys only used by the list page: `questionBank.tabs.*`, `questionBank.emptyMine`, `questionBank.inbox.*`, `questionBank.subtitle`

### What stays
- `/question-banks/:bankId` detail page (owner management)
- `/marketplace` list page (enhanced below)
- Dashboard bank cards and create bank modal
- All shared components under `question-banks/components/`

## 2. Marketplace Preview Page

### New route
`/marketplace/:bankId` → `MarketplaceBankPreviewScreen`

### Page structure
- **Header**: bank name, icon, cover image, author (with verified badge), category tag, question count
- **Subscribe button**: "Subscribe" / "Subscribed" toggle
- **Question list**: Read-only list showing title, difficulty, question type per question. No prompt/answer content displayed (prevents leaking)
- **Navigation**: Breadcrumb or back button to `/marketplace`

### Data sources
- Bank info: existing `getBank(bankId)` API, backend adds `isSubscribed: boolean` field to response
- Question list: existing `listBankQuestions(bankId)` API, frontend renders metadata only (title, difficulty, type)

### Route registration
- Add to `routes.tsx` alongside existing marketplace route
- Mount in `App.tsx` inside `<RequireTeacherOrAdmin />` + `<RequireCompletedOnboarding />` + `<MainLayout />`

## 3. Teacher Publish Flow

### Entry point
In `/question-banks/:bankId` detail page (settings panel area), show a publish action for the bank owner.

### State machine
```
private → (teacher: submitForReview) → pending_review → (admin: approve via backend) → published
```

### Frontend behavior by `reviewStatus`
| Status | UI |
|---|---|
| `none` / `private` | "Apply to Marketplace" button |
| `pending_review` | "Under Review" disabled tag |
| `published` | "Published" tag + optional "Unpublish" button |

### Constraints
- Bank must have >= 1 question to submit for review

### API
- Submit: existing `submitForReview(bankId)` — no frontend changes to the API call
- Approve/reject: admin-only backend operation, no frontend UI needed

## 4. Subscription Mechanism

### New API endpoints
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/question-banks/:bankId/subscribe` | Subscribe to a bank |
| `DELETE` | `/api/v1/question-banks/:bankId/subscribe` | Unsubscribe |
| `GET` | `/api/v1/question-banks/subscribed` | List subscribed banks |

### Frontend repository additions
Add to `questionBank.repository.ts`:
- `subscribe(bankId: string): Promise<void>`
- `unsubscribe(bankId: string): Promise<void>`
- `listSubscribed(): Promise<QuestionBank[]>`

### Bank detail API change
`getBank(bankId)` response adds `isSubscribed: boolean` — used by the marketplace preview page to show subscribe button state.

## 5. Contest Editor Integration

### Current behavior
`QuestionBankImportModal` and `QuestionSourcePanel` call `listMine()` to get banks as question sources.

### New behavior
- Call both `listMine()` and `listSubscribed()`
- Display as two groups in the bank picker: "My Banks" / "Subscribed Banks" (with label/tag distinction)
- Selecting questions from a subscribed bank works identically to selecting from own bank — clone into the contest

### Files to modify
- `frontend/src/features/contest/components/admin/examEditor/QuestionBankImportModal.tsx`
- `frontend/src/features/contest/components/admin/examEditor/QuestionSourcePanel.tsx`

## Scope Boundaries

**In scope:**
- Remove question bank list page
- Marketplace preview page (new)
- Teacher submit-for-review flow (frontend only, button + status display)
- Subscribe/unsubscribe mechanism (frontend + backend API)
- Contest Editor integration with subscribed banks

**Out of scope:**
- Admin review UI (admin approves via backend/DB directly)
- Marketplace search/filter (future enhancement)
- Separate "My Subscriptions" management page
- Notification when subscribed bank updates
