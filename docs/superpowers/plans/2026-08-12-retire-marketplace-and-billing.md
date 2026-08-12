# Marketplace and Billing Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Marketplace and recurring billing while preserving private question banks and the existing `student`, `teacher`, and `admin` authorization model.

**Architecture:** Delete the retired frontend routes and feature code, reduce question-bank access to owner-only queries, and remove Marketplace fields and relations through Django migrations. Billing is removed in two commits: first a deployable destructive migration shell, then the app and all Recur configuration after that migration is verified.

**Tech Stack:** Django 5/DRF, PostgreSQL, React 19, TypeScript, React Router, Vitest, Playwright, Docker Compose.

## Global Constraints

- Preserve `User.role = student | teacher | admin`; do not introduce `user`, plan, tier, entitlement, or feature-flag replacements.
- Preserve private question-bank creation, editing, importing, copying, archiving, and contest/exam use.
- Remove public discovery, public preview, submission, review, review queue, and other-user bank subscriptions.
- Remove pricing, plan settings, subscription APIs, Recur integration, and all billing persistence.
- `QuestionAsset.visibility` is out of scope and remains.
- Removed frontend routes use the existing 404 page; removed API routes return 404 without redirects or compatibility payloads.
- Do not refactor unrelated code or overwrite unrelated working-tree changes.

---

### Task 1: Define retirement behavior with failing tests

**Files:**
- Modify: `backend/apps/question_bank/tests/test_views_enhanced.py`
- Modify: `backend/apps/users/tests/test_auth.py`
- Modify: `frontend/tests/e2e/ui-runtime-quality.e2e.spec.ts`

**Interfaces:**
- Consumes: Existing DRF question-bank router, current-user API, and application routes.
- Produces: Executable requirements for retired endpoints, role-only user payloads, and frontend 404 behavior.

- [x] **Step 1: Replace Marketplace workflow assertions with removed-route assertions**

Add parameterized requests for:

```python
def test_marketplace_actions_are_not_routed(api_client, teacher, bank):
    api_client.force_authenticate(teacher)
    requests = [
        ("get", "/api/v1/question-banks/explore/"),
        ("get", "/api/v1/question-banks/review-queue/"),
        ("post", f"/api/v1/question-banks/{bank.uuid}/submit-for-review/"),
        ("post", f"/api/v1/question-banks/{bank.uuid}/review/"),
        ("post", f"/api/v1/question-banks/{bank.uuid}/subscribe/"),
        ("get", "/api/v1/question-banks/subscribed/"),
    ]
    for method, path in requests:
        assert getattr(api_client, method)(path).status_code == 404
```

- [x] **Step 2: Assert user payload has role but no subscription**

```python
def test_current_user_payload_uses_role_without_subscription(api_client, teacher):
    api_client.force_authenticate(teacher)
    response = api_client.get("/api/v1/auth/me/")
    assert response.status_code == 200
    assert response.data["data"]["role"] == "teacher"
    assert "subscription" not in response.data["data"]
```

- [x] **Step 3: Change frontend E2E route expectations**

Replace Marketplace/pricing/review-queue smoke entries with one test that visits `/marketplace`, `/pricing`, and `/system/review-queue` and asserts the existing not-found heading or status content. Remove menu-click tests that expect these links.

- [x] **Step 4: Run the focused tests and verify RED**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test pytest -q apps/question_bank/tests/test_views_enhanced.py apps/users/tests/test_auth.py
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npm run test:e2e -- tests/e2e/ui-runtime-quality.e2e.spec.ts
```

Expected: Marketplace and user-payload assertions fail because the endpoints and fake subscription projection still exist; frontend retired URLs still render live pages.

### Task 2: Reduce question banks to owner-only behavior

**Files:**
- Modify: `backend/apps/question_bank/models.py`
- Modify: `backend/apps/question_bank/serializers.py`
- Modify: `backend/apps/question_bank/views.py`
- Modify: `backend/apps/question_bank/admin.py`
- Modify: `backend/apps/question_bank/bank_workflows.py`
- Modify: `backend/apps/question_bank/read_models.py`
- Modify: `backend/apps/question_bank/import_resolver.py`
- Modify: `backend/apps/question_bank/management/commands/migrate_question_bank_seed.py`
- Create: `backend/apps/question_bank/migrations/0018_retire_marketplace.py`
- Modify: `backend/apps/question_bank/tests/test_api.py`
- Modify: `backend/apps/question_bank/tests/test_question_asset_integration.py`
- Modify: `backend/apps/question_bank/tests/test_views_enhanced.py`
- Modify: `backend/apps/question_bank/tests/test_import_resolver.py`
- Modify: `backend/apps/question_bank/tests/test_backfill_exam_question_bank_sources.py`

**Interfaces:**
- Consumes: `QuestionBank.owner`, `QuestionBank.is_archived`, private-bank question workflows, and question-asset visibility.
- Produces: A `QuestionBank` model with no Marketplace state and APIs whose bank queries are scoped to `owner=request.user`.

- [x] **Step 1: Add a migration test for normalization and deletion**

Use `MigrationExecutor` to migrate from `question_bank.0017_eliminate_question_bank_legacy_adapters` to `0018_retire_marketplace`. Create an owned public approved bank, an ownerless public bank, and a subscription before migration. Assert afterward that the owned bank remains, the ownerless bank is archived, the Marketplace columns are absent, and `question_bank_subscriptions` is absent.

- [x] **Step 2: Run the migration test and verify RED**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test pytest -q apps/question_bank/tests/test_retire_marketplace_migration.py
```

Expected: FAIL because migration `0018_retire_marketplace` does not exist.

- [x] **Step 3: Create the Marketplace retirement migration**

Implement the ordered operations:

```python
def normalize_banks(apps, schema_editor):
    QuestionBank = apps.get_model("question_bank", "QuestionBank")
    QuestionBank.objects.update(visibility="private")
    QuestionBank.objects.filter(owner__isnull=True).update(is_archived=True)

operations = [
    migrations.RunPython(normalize_banks, migrations.RunPython.noop),
    migrations.DeleteModel(name="QuestionBankSubscription"),
    migrations.RemoveIndex(...),
    migrations.RemoveField(model_name="questionbank", name="reviewed_by"),
    migrations.RemoveField(...),
]
```

Remove indexes before their fields and remove all seven Marketplace-only fields.

- [x] **Step 4: Delete Marketplace model and serializer state**

Remove `QuestionBank.Visibility`, `QuestionBank.ReviewStatus`, verification/review fields, Marketplace indexes, `QuestionBankSubscription`, `ExploreBankItemSerializer`, `is_subscribed`, and all corresponding serializer fields. Keep `QuestionAsset.Visibility` unchanged.

- [x] **Step 5: Delete Marketplace actions and make all bank reads owner-only**

Delete the `explore`, `review_queue`, `submit_for_review`, `review`, `subscribe`, and `subscribed` actions and their imports. Reduce `get_queryset()` to active banks owned by the request user. Change read/import resolvers from public fallback logic to:

```python
if bank.owner_id != user.id or bank.is_archived:
    return None
```

Remove `is_publicly_accessible_bank` and make clone/import source resolution owner-only.

- [x] **Step 6: Update seed command and retained tests**

Stop creating ownerless public banks. Remove Marketplace-specific tests and Marketplace-only constructor fields. Rewrite retained copy/import tests so the source bank belongs to the acting teacher. Keep QuestionAsset visibility assertions.

- [x] **Step 7: Run question-bank tests and verify GREEN**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test python manage.py makemigrations --check --dry-run
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test pytest -q apps/question_bank/tests
```

Expected: no pending migrations; all question-bank tests pass.

- [x] **Step 8: Commit the question-bank backend retirement**

Stage only Task 1–2 backend files and commit:

```bash
git commit -m "refactor(question-bank): retire marketplace backend"
```

### Task 3: Remove Marketplace frontend surfaces

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/features/question-banks/routes.tsx`
- Modify: `frontend/src/features/question-banks/index.ts`
- Delete: `frontend/src/features/question-banks/screens/QuestionBankMarketplaceScreen.tsx`
- Delete: `frontend/src/features/question-banks/screens/QuestionBankMarketplaceScreen.test.tsx`
- Delete: `frontend/src/features/question-banks/screens/MarketplaceBankPreviewScreen.tsx`
- Delete: `frontend/src/features/question-banks/screens/community-cover.jpg`
- Modify: `frontend/src/features/question-banks/components/QuestionBankSettingsGeneralPanel.tsx`
- Modify: `frontend/src/features/question-banks/screens/QuestionBankDetailScreen.tsx`
- Modify: `frontend/src/features/app/components/SideMenu.tsx`
- Modify: `frontend/src/features/app/components/UserMenu.tsx`
- Modify: `frontend/src/features/admin/routes.tsx`
- Delete: `frontend/src/features/admin/screens/ReviewQueueScreen.tsx`
- Modify: `frontend/src/features/contest/components/admin/examEditor/QuestionBankImportModal.tsx`
- Modify: `frontend/src/features/contest/components/admin/examEditor/QuestionSourcePanel.tsx`
- Modify: `frontend/src/core/entities/question-bank.entity.ts`
- Modify: `frontend/src/core/ports/questionBank.repository.ts`
- Modify: `frontend/src/infrastructure/api/dto/question-bank.dto.ts`
- Modify: `frontend/src/infrastructure/mappers/questionBank.mapper.ts`
- Modify: `frontend/src/infrastructure/api/repositories/questionBank.repository.ts`

**Interfaces:**
- Consumes: Owner-only question-bank API from Task 2.
- Produces: Private-bank-only frontend types, repository, routes, settings, and contest import sources.

- [x] **Step 1: Remove routes, screens, and navigation**

Keep the lazy-loaded `/question-banks/:bankId` route. Delete Marketplace routes/screens, side-menu links, admin review route/screen, and admin user-menu link.

- [x] **Step 2: Reduce frontend bank contracts**

Remove `BankVisibility`, `BankReviewStatus`, `ExploreBankItem`, public/review/subscription properties, and repository methods. `QuestionBank` keeps identity, presentation metadata, category, owner, count, and timestamps.

- [x] **Step 3: Reduce private-bank settings and imports**

Remove publication/review controls from `QuestionBankSettingsGeneralPanel` and Marketplace state from `QuestionBankDetailScreen`. Change both contest question-source components to call only `listMine()` and remove subscribed-source labels.

- [x] **Step 4: Run focused frontend tests and typecheck**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run test -- src/features/question-banks
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run build
```

Expected: question-bank tests and TypeScript/Vite build pass.

- [x] **Step 5: Commit Marketplace frontend retirement**

```bash
git commit -m "refactor(frontend): remove marketplace surfaces"
```

### Task 4: Deliver the billing destructive migration shell

**Files:**
- Modify: `backend/apps/users/serializers.py`
- Modify: `backend/config/urls.py`
- Create: `backend/apps/subscriptions/migrations/0002_delete_billing_models.py`
- Delete: `backend/apps/subscriptions/admin.py`
- Delete: `backend/apps/subscriptions/models.py`
- Delete: `backend/apps/subscriptions/recur_client.py`
- Delete: `backend/apps/subscriptions/serializers.py`
- Delete: `backend/apps/subscriptions/sync.py`
- Delete: `backend/apps/subscriptions/urls.py`
- Delete: `backend/apps/subscriptions/views.py`
- Delete: `backend/apps/subscriptions/webhooks.py`
- Create: `backend/apps/subscriptions/tests/test_retire_billing_migration.py`

**Interfaces:**
- Consumes: Existing `subscriptions.0001_initial` migration state.
- Produces: A deployable installed app containing only app metadata and migration `0002`, with no HTTP/runtime billing behavior.

- [x] **Step 1: Write and run a failing billing migration test**

Create subscription and webhook rows at migration state `0001_initial`, migrate to `0002_delete_billing_models`, then assert both models and tables are absent. Run it and verify failure because `0002` does not exist.

- [x] **Step 2: Add the destructive migration**

```python
operations = [
    migrations.DeleteModel(name="Subscription"),
    migrations.DeleteModel(name="WebhookEvent"),
]
```

- [x] **Step 3: Remove runtime billing projections and routes**

Delete `UserSerializer.subscription` and its fallback free tier. Remove the subscription URL include. Delete all runtime app modules except `__init__.py`, `apps.py`, and migrations.

- [x] **Step 4: Verify Release 1 backend state**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test python manage.py migrate
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test pytest -q apps/subscriptions/tests apps/users/tests/test_auth.py
```

Expected: migrations and focused tests pass; `/api/v1/subscriptions/*` is not routed.

- [x] **Step 5: Commit the independently deployable migration shell**

```bash
git commit -m "refactor(billing): migrate away subscription data"
```

### Task 5: Remove billing frontend and product copy

**Files:**
- Modify: `frontend/src/App.tsx`
- Delete: `frontend/src/features/pricing/`
- Delete: `frontend/src/features/auth/components/PlansPanel.tsx`
- Delete: `frontend/src/features/auth/components/PlansPanel.scss`
- Modify: `frontend/src/features/auth/components/SettingsDialog.tsx`
- Modify: `frontend/src/features/auth/components/ProfilePanel.tsx`
- Modify: `frontend/src/features/auth/components/ProfilePanel.scss`
- Modify: `frontend/src/core/entities/auth.entity.ts`
- Delete: `frontend/src/infrastructure/api/repositories/subscription.repository.ts`
- Modify: `frontend/src/infrastructure/api/repositories/index.ts`
- Modify: `frontend/src/features/landing/content/landingContent.ts`
- Modify: `frontend/src/i18n/locales/en/common.json`
- Modify: `frontend/src/i18n/locales/ja/common.json`
- Modify: `frontend/src/i18n/locales/ko/common.json`
- Modify: `frontend/src/i18n/locales/zh-TW/common.json`
- Modify: `frontend/src/i18n/locales/en/landing.json`
- Modify: `frontend/src/i18n/locales/ja/landing.json`
- Modify: `frontend/src/i18n/locales/ko/landing.json`
- Modify: `frontend/src/i18n/locales/zh-TW/landing.json`
- Modify: `frontend/public/sitemap.xml`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`

**Interfaces:**
- Consumes: Role-only user payload from Task 4.
- Produces: Frontend with no billing routes, types, package dependency, settings, or product messaging.

- [x] **Step 1: Remove pricing routes and Recur provider**

Delete pricing feature imports, routes, and `RecurProviderBridge` from `App.tsx`; delete the feature directory and `recur-tw` dependency.

- [x] **Step 2: Remove settings billing UI and types**

Delete plans tab/panel. Remove subscription hooks, portal controls, subscription section, and subscription styling from `ProfilePanel`. Remove `UserSubscription` and `User.subscription` from auth entities.

- [x] **Step 3: Remove pricing content**

Remove landing pricing navigation/content/footer links, common settings plan/subscription keys, landing pricing keys, and the sitemap entry. Preserve unrelated product and role text.

- [x] **Step 4: Synchronize the lockfile and verify frontend**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm install --package-lock-only
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run check:i18n
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run build
```

Expected: no `recur-tw` package, synchronized locales, successful build.

- [x] **Step 5: Commit frontend billing retirement**

```bash
git commit -m "refactor(frontend): remove billing and plans"
```

### Task 6: Remove the billing app and deployment configuration

**Files:**
- Delete: `backend/apps/subscriptions/`
- Modify: `backend/config/settings/base.py`
- Modify: `docker-compose.dev.yml`
- Modify: `frontend/Dockerfile`
- Modify: `frontend/vite.config.ts`
- Modify: tracked environment examples containing `RECUR_*`

**Interfaces:**
- Consumes: Applied `subscriptions.0002_delete_billing_models` from Task 4.
- Produces: Final codebase with no installed billing app and no Recur build/runtime configuration.

- [x] **Step 1: Confirm destructive migration is applied**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test python manage.py showmigrations subscriptions
```

Expected: `[X] 0001_initial` and `[X] 0002_delete_billing_models`.

- [x] **Step 2: Remove the migration shell and configuration**

Delete the subscriptions package, remove it from `INSTALLED_APPS`, and remove every `RECUR_*`/`VITE_RECUR_*` setting or build argument. Do not modify untracked or user-local secret files unless they are tracked project configuration.

- [x] **Step 3: Verify final Django state**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test python manage.py check
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test python manage.py makemigrations --check --dry-run
```

Expected: Django checks pass and no pending migrations exist.

- [x] **Step 4: Commit final billing app removal**

```bash
git commit -m "refactor(billing): remove subscription app"
```

### Task 7: Regenerate schema and remove residual references

**Files:**
- Modify: `backend/schema.yml`
- Modify: `frontend/tests/e2e/ui-runtime-quality.e2e.spec.ts`
- Modify: any tracked file identified by the scoped residual searches below.

**Interfaces:**
- Consumes: Final frontend/backend runtime surfaces.
- Produces: Generated schema and validation inventories that match the retired product.

- [x] **Step 1: Regenerate OpenAPI schema**

Run in the backend container:

```bash
python manage.py spectacular --file schema.yml
```

Copy/update the committed `backend/schema.yml` through the mounted workspace.

- [x] **Step 2: Run scoped residual searches**

Run:

```bash
rg -n -i 'marketplace|review.?queue|submit.?for.?review|questionbanksubscription|is.?subscribed' backend frontend --glob '!**/migrations/00*.py' --glob '!**/node_modules/**' --glob '!**/coverage/**'
rg -n -i 'apps\.subscriptions|/subscriptions|recur[_-]|recur\.tw|pricing|plan tier|entitlement' backend frontend docker-compose*.yml --glob '!**/node_modules/**' --glob '!**/coverage/**'
```

Expected: no runtime/product references. Historical question-bank migrations and generic stream subscriptions are not retirement defects.

- [x] **Step 3: Update E2E inventory and run it**

Keep explicit assertions that the three retired frontend URLs show the existing 404 page, then run the focused E2E file.

- [x] **Step 4: Commit schema and residual cleanup**

```bash
git commit -m "chore: remove retired product references"
```

### Task 8: Full verification and completion audit

**Files:**
- Modify: only files required to fix failures directly caused by Tasks 1–7.

**Interfaces:**
- Consumes: All prior task outputs.
- Produces: Fresh evidence for every preservation and removal requirement.

- [x] **Step 1: Run backend verification**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test python manage.py migrate
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test python manage.py check
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test python manage.py makemigrations --check --dry-run
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test pytest -q
```

- [x] **Step 2: Run frontend verification**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run check:i18n
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run test
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run build
```

- [x] **Step 3: Run QJudge quality gates**

```bash
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-naming.js --root frontend/src
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-architecture.js --root frontend/src
bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh --staged
```

- [x] **Step 4: Audit every requirement against evidence**

Confirm from migrations, router output, UI route tests, residual searches, and full suites that:

- private question banks work and remain owner-only;
- all Marketplace behavior and state is absent;
- all billing behavior, data models, dependencies, and configuration are absent;
- platform roles remain `student`, `teacher`, and `admin`;
- no unrelated working-tree change was staged or committed.

- [x] **Step 5: Commit only direct verification fixes, if any**

```bash
git commit -m "test: verify marketplace and billing retirement"
```

## Completion Record (2026-08-12)

- Marketplace, role, billing-route, and migration coverage: `89 passed`.
- Backend suite excluding `apps/judge/tests.py`: `1285 passed, 1 skipped`. The excluded integration file requires a Docker socket that is not mounted in `backend-test`; its 23 failures all returned the same Docker connection error.
- Frontend unit suite: `182` files passed, `1026` tests passed, `1` skipped.
- Frontend production build and all seven i18n namespace checks passed.
- Retired-route E2E: `/marketplace`, `/pricing`, and `/system/review-queue` all rendered the existing 404 page (`6 passed`, including authentication setup).
- Naming, architecture, Carbon staged-style, Django system, migration-drift, and residual-reference checks passed.
- Production upgrades must deploy and migrate Release 1 commit `1e9c179f` before deploying the commit that removes the subscription migration shell.
