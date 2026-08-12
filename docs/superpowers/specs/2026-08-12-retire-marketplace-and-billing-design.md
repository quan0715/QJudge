# Marketplace and Billing Retirement Design

## Summary

QJudge will retire the question-bank Marketplace and all recurring-billing functionality. Private question banks remain available to teachers and administrators. Account authorization continues to use the existing `student`, `teacher`, and `admin` roles; subscription tiers no longer exist and no replacement entitlement layer will be introduced.

## Goals

- Remove public question-bank discovery, preview, submission, review, and subscription workflows.
- Preserve private question-bank creation, editing, importing, copying, archiving, and contest integration.
- Remove pricing pages, plan settings, subscription APIs, Recur integration, and billing persistence.
- Keep the current account-role schema and make role the only platform-level feature gate.
- Leave no long-term compatibility endpoints, feature flags, free-plan placeholders, or unused billing abstractions.

## Non-goals

- Renaming `student` to `user` or changing the `User.role` database field.
- Changing classroom roles, contest roles, participant terminology, or teacher activation.
- Redesigning the user menu or profile page.
- Replacing Marketplace with another sharing or publishing workflow.
- Cancelling or reconciling records in Recur. Existing billing is test-only and may be discarded.
- Refactoring unrelated question-bank, authentication, or authorization code.

## Final Product Behavior

### Account roles

The canonical platform roles remain:

- `student`: regular student account.
- `teacher`: teaching account with access to classrooms, authoring, and grading capabilities.
- `admin`: internal platform administrator.

Existing role labels in the user menu and profile settings remain. Feature access must not inspect a plan, tier, subscription status, or entitlement response.

Classroom- and contest-scoped roles keep their existing names and semantics.

### Private question banks

Teachers and administrators retain the current private question-bank workflows:

- list and retrieve banks they own;
- create, edit, and archive their banks;
- add, edit, import, copy, and remove questions;
- use bank questions in contests and exams;
- upload bank cover images where the private-bank UI still exposes that capability.

A user who does not own a bank cannot retrieve or modify it. `QuestionAsset.visibility` is not part of the Marketplace retirement and remains unless a separate audit proves it unused by the question-asset domain.

### Removed Marketplace behavior

The following product surfaces and backend actions are removed:

- `/marketplace` and `/marketplace/:bankId`;
- Marketplace navigation and localized copy;
- public bank exploration and preview;
- submit-for-review and admin approve/reject workflows;
- `/system/review-queue` and its user-menu entry;
- subscribing to or listing another user's banks;
- Marketplace-specific repository methods, serializers, components, tests, and API schema operations.

Old frontend URLs use the application's existing not-found handling. Removed API actions return `404`; no redirect or compatibility response is added.

### Removed billing behavior

The following are removed without replacement:

- `/pricing` and pricing links from landing/auth flows;
- the plans tab in account settings;
- frontend pricing components, hooks, exports, and subscription repository;
- `/api/v1/subscriptions/` routes;
- checkout, customer portal, subscription synchronization, and webhook handling;
- the `Subscription` and `WebhookEvent` models and Django admin registrations;
- the `apps.subscriptions` Django app after its destructive migration has been applied;
- Recur client code, settings, environment variables, deployment configuration, API schema entries, tests, and documentation.

No implicit "free" subscription record or local entitlement object remains.

## Data Transition

### Question banks

Before Marketplace columns are removed, a data migration normalizes every `QuestionBank`:

- `visibility` becomes `private`;
- ownerless platform-managed banks also become archived because no Marketplace remains through which they can be accessed or managed;
- owned banks preserve their owner, category, content, timestamps, and archive state;
- question assets, versions, bank memberships, contest bindings, and source-tracking data remain unchanged.

The same schema migration then removes Marketplace-only fields from `QuestionBank`:

- `visibility`;
- `verified`;
- `review_status`;
- `review_note`;
- `submitted_at`;
- `reviewed_at`;
- `reviewed_by`.

It also removes `QuestionBankSubscription` and all subscription rows. The final private-only access rule is represented by ownership rather than a persisted visibility value.

### Billing

Billing data is disposable. The destructive migration deletes `Subscription`, `WebhookEvent`, and their tables without exporting or reconciling records with Recur.

### Account roles

No role migration runs. Existing `student`, `teacher`, and `admin` values and defaults remain unchanged.

## Deployment Sequence

The retirement is delivered in two ordered releases.

### Release 1: stop behavior and migrate data

- Remove frontend Marketplace and billing surfaces.
- Remove Marketplace actions and fields from runtime serializers/views.
- Remove subscription URLs so billing endpoints return `404`.
- Keep `apps.subscriptions` installed only long enough to deliver and run its destructive migration.
- Apply the question-bank normalization/schema migration and the subscription deletion migration.
- Verify retained private-bank workflows and removed endpoints.

Deployment stops if migration or verification fails.

### Release 2: remove migration shell

After every environment reports the Release 1 migrations as applied:

- remove `apps.subscriptions` from `INSTALLED_APPS`;
- delete the remaining subscriptions app package and migrations;
- remove Recur settings and environment configuration;
- regenerate committed API schema and run the full verification suite.

Deployments must not skip directly from the pre-retirement release to Release 2. Fresh installations from Release 2 do not create billing tables.

## Code Boundaries

- `frontend/src/features/question-banks` keeps private-bank screens and flows only.
- Removed pages are deleted instead of hidden behind conditions.
- `frontend/src/infrastructure` contains no billing repository after retirement.
- `backend/apps/question_bank` continues to own private-bank persistence and workflows.
- `backend/apps/users` continues to own platform roles; no billing dependency is introduced there.
- No shared or core layer imports a retired feature, Recur client, or subscription type.

## Error Handling

- Requests for a bank not owned by the authenticated user follow the existing private-bank not-found/permission response; no public fallback is attempted.
- Removed router actions and the subscription URL include return `404` through normal Django/DRF routing.
- A failed data/schema migration aborts Release 1. Release 2 is gated on migration status, not on elapsed time.
- No runtime error handler is added for removed Recur behavior because no request path can invoke it.

## Verification

### Migration evidence

- A migration test begins with private, public, pending-review, approved, subscribed, and ownerless banks.
- After migration, owned banks remain with their content and ownership, ownerless banks are archived, and Marketplace/billing relations and columns are gone.
- Subscription and webhook-event tables are absent after the Release 1 migration.

### Backend behavior

- A teacher or admin can create and manage a private bank.
- A student cannot create a bank.
- A different authenticated user cannot read or change another owner's bank.
- Inbox ingest, question copying, and contest/exam bindings continue to pass their existing tests.
- Explore, submit-for-review, review, review-queue, subscribe, subscribed-list, and every subscription API path return `404`.

### Frontend behavior

- Marketplace, pricing, and review-queue routes and navigation are absent.
- Account settings contain no plans tab.
- Landing, auth redirects, sitemap, translations, and E2E route inventories contain no Marketplace or pricing references.
- The existing student, teacher, and admin labels remain visible in account UI.
- Private question-bank detail and editing tests continue to pass.

### Static and quality gates

- Searches find no runtime import or route reference to Marketplace, pricing, subscriptions, or Recur.
- The generated OpenAPI schema contains no retired operations or billing schemas.
- Frontend type checking, focused tests, naming lint, and architecture lint pass.
- Backend migration checks and focused/full tests pass in the project container workflow.

## Completion Criteria

The work is complete when Release 1 and Release 2 changes exist as independently deployable revisions, all approved removal and preservation requirements have direct test or inspection evidence, and no production runtime code depends on Marketplace or billing concepts.
