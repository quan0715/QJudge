# 私人題庫模型減法 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓題庫只表達使用者持有的私人內容：刪除 ownerless 題庫，將 `QuestionBank.owner` 設為必填，移除 `QuestionAsset.status`、`visibility`、`version_state`，並完整保留 `QuestionVersion` 與考試版本綁定。

**Architecture:** `QuestionBank` 保留容器 ownership，`QuestionAsset` 保留可編輯的 canonical content，`QuestionVersion` 保留不可變歷史，`ContestQuestionBinding.question_version` 保留考試快照。Migration 只刪除沒有 owner 的 bank/membership，不改寫 owned assets、versions 或 adapter FKs；runtime 移除已固定為單一值的參數與分支。

**Tech Stack:** Django 4.2 ORM/migrations、Django REST Framework、pytest、PostgreSQL、drf-spectacular、Docker Compose。

## Global Constraints

- 設計依據：`docs/superpowers/specs/2026-08-12-retire-unused-surfaces-and-enforce-private-classroom-contests-design.md`。
- `QuestionVersion`、`QuestionAsset.latest_version`、`CodingProblem.question_version`、`ExamQuestion.question_version`、`ContestQuestionBinding.question_version` 不得刪除、nullable behavior 不得改變。
- 不新增 `is_private`、`is_published`、`is_active` 或替代 enum；私人與直接可用是 domain invariant，不再存成欄位。
- 不建立官方帳號、預設 owner、migration fallback owner 或 ownerless compatibility path。
- 工作樹已有使用者修改；每個 target file 先執行 `git diff -- <path>`，只做本計畫需要的最小修改。
- 所有 Django/pytest/migration/schema 指令經 `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend ...` 執行。
- Commit 僅以明確路徑 stage，不使用 `git add -A` 或會 stage 全部 tracked changes 的 helper。

---

### Task 1: 先用 migration test 鎖定資料保留與刪除規則

**Files:**

- Create: `backend/apps/question_bank/tests/test_private_question_assets_migration.py`
- Reference: `backend/apps/question_bank/tests/test_retire_marketplace_migration.py`
- Reference: `backend/apps/question_bank/migrations/0018_retire_marketplace.py`

- [ ] **Step 1: 建立從 0018 到 0019 的 MigrationExecutor 測試骨架**

  依既有 `test_retire_marketplace_migration.py` 的 leaf-node replacement pattern：

  ```python
  migrate_from = [
      (app_label, "0018_retire_marketplace")
      if app_label == "question_bank"
      else (app_label, migration_name)
      for app_label, migration_name in leaf_nodes
  ]
  ```

  `migrate_to` 對 `question_bank` 指向 `0019_private_question_assets`。

- [ ] **Step 2: 在 historical state 建立代表資料**

  建立：

  - teacher 與另一名 teacher；
  - 一個 teacher-owned bank；
  - 一個 `owner=None` platform bank；
  - owned `QuestionAsset`，刻意使用 `status="draft"`、`visibility="public"`、`version_state="draft"`；
  - 同一 asset 的 version 1、version 2，`latest_version=version 2`；
  - owned bank membership；
  - platform bank membership 指向同一個 owned asset。

  此 arrangement 要證明刪除 ownerless bank 只 cascade 其 membership，不會誤刪由使用者持有且也被 owned bank/contest 使用的 asset。

- [ ] **Step 3: 套用 migration 後寫完整 assertions**

  驗證：

  ```python
  assert not PrivateQuestionBank.objects.filter(pk=platform_bank.pk).exists()
  assert PrivateQuestionBank.objects.get(pk=owned_bank.pk).owner_id == teacher.pk
  assert PrivateQuestionAsset.objects.filter(pk=asset.pk).exists()
  assert PrivateQuestionVersion.objects.filter(question_asset_id=asset.pk).count() == 2
  assert PrivateQuestionAsset.objects.get(pk=asset.pk).latest_version_id == version_2.pk
  ```

  再用 `_meta.get_fields()` 驗證 QuestionBank `owner.null is False`，且 QuestionAsset field names 不含 `status`、`visibility`、`version_state`；用 introspection 驗證 `question_as_status_7ef55c_idx` 不存在。

- [ ] **Step 4: 加上考試 snapshot 保留案例**

  在 historical state 建立一個 contest、`ContestQuestionBinding`，令 binding 指向 asset 但 pin 在 version 1；migration 後確認 binding、asset、version 1、version 2 都存在且 `binding.question_version_id == version_1.pk`。若 historical Contest 有必填依賴，只填 migration state 所需最小欄位，不使用 current model factory。

- [ ] **Step 5: 執行測試並確認 red phase**

  ```bash
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest -q apps/question_bank/tests/test_private_question_assets_migration.py
  ```

  Expected: `0019_private_question_assets` 尚不存在，測試失敗。

---

### Task 2: 新增 0019 migration 並簡化 models/admin

**Files:**

- Create: `backend/apps/question_bank/migrations/0019_private_question_assets.py`
- Modify: `backend/apps/question_bank/models.py`
- Modify: `backend/apps/question_bank/admin.py`
- Test: `backend/apps/question_bank/tests/test_private_question_assets_migration.py`

- [ ] **Step 1: 建立 irreversible data cleanup**

  Migration operation 順序固定為：

  ```python
  def delete_ownerless_banks(apps, schema_editor):
      QuestionBank = apps.get_model("question_bank", "QuestionBank")
      QuestionBank.objects.filter(owner__isnull=True).delete()
  ```

  使用 `migrations.RunPython(delete_ownerless_banks, migrations.RunPython.noop)`。不 archive、不改名、不匯出 ownerless banks。

- [ ] **Step 2: 收緊 QuestionBank owner constraint**

  在 data cleanup 後執行 `AlterField`，保留現有 `on_delete=models.CASCADE`、`related_name="question_banks"`，移除 `null=True`、`blank=True` 與 platform help text。

- [ ] **Step 3: 先移除複合 index，再移除三個欄位**

  依序 `RemoveIndex(name="question_as_status_7ef55c_idx")`，再 `RemoveField`：`status`、`visibility`、`version_state`。不要碰 owner/asset_type index、latest_version FK 或 version constraint。

- [ ] **Step 4: 同步 current models**

  `QuestionBank.owner` 改為 required；`__str__` 直接使用 `self.owner.username`，不保留 `platform` fallback。從 `QuestionAsset` 刪除三個 nested enum、三個 fields，以及 `Meta.indexes` 的 status/visibility index。

- [ ] **Step 5: 簡化 Django admin**

  `QuestionAssetAdmin.list_display` 與 `list_filter` 移除三個 retired fields，保留 id、owner、asset_type、title、latest_version、timestamps 等實際欄位。

- [ ] **Step 6: 執行 migration test**

  ```bash
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest -q apps/question_bank/tests/test_private_question_assets_migration.py
  ```

  Expected: PASS。

- [ ] **Step 7: 檢查 migration/model state 一致**

  ```bash
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py makemigrations --check --dry-run
  ```

  Expected: `No changes detected`。

- [ ] **Step 8: 明確 stage 並提交**

  ```bash
  git add -- backend/apps/question_bank/migrations/0019_private_question_assets.py backend/apps/question_bank/models.py backend/apps/question_bank/admin.py backend/apps/question_bank/tests/test_private_question_assets_migration.py
  git commit -m "refactor: simplify private question asset schema"
  ```

---

### Task 3: 移除 QuestionAsset 固定狀態的 runtime 寫入

**Files:**

- Modify: `backend/apps/question_bank/question_assets.py`
- Modify: `backend/apps/question_bank/tests/test_api.py`
- Modify: `backend/apps/question_bank/tests/test_question_asset_integration.py`
- Modify: `backend/apps/question_bank/tests/test_import_resolver.py`
- Modify: `backend/apps/question_bank/tests/test_backfill_exam_question_bank_sources.py`
- Modify: `backend/apps/contests/tests/exam/test_exam_questions_api.py`
- Modify: `backend/apps/contests/tests/management/test_contest_viewset_actions.py`

- [ ] **Step 1: 先更新 service-level expectations**

  將測試中的 `create_question_asset(..., visibility=QuestionAsset.Visibility.PRIVATE, ...)` 改成不傳 visibility。對 asset 的 assertions 改成：owner、asset_type、title/prompt/payload、latest_version 與 versions count；不得改成斷言另一個替代 privacy flag。

- [ ] **Step 2: 簡化 publish_question_version**

  `QuestionAsset.objects.update(...)` 只更新 `title`、`prompt`、`payload`、`latest_version`；in-memory instance 同樣只同步這四個值。刪除 `version_state` update/assignment。

- [ ] **Step 3: 簡化 create_question_asset interface**

  從 function signature 移除 `visibility`，`QuestionAsset.objects.create(...)` 只寫 owner、asset_type、title、prompt、payload。所有 production call sites 與 test call sites 一併移除參數。

- [ ] **Step 4: 簡化 existing asset sync**

  `write_coding_content_to_asset` 與 `sync_exam_question_question_asset` 的 existing-asset branch 只同步 owner 與 asset_type；`refresh_from_db(fields=...)` 同步縮小。new-asset branch 不再傳 privacy/status constants。

- [ ] **Step 5: 執行 focused service/integration tests**

  ```bash
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest -q apps/question_bank/tests/test_api.py apps/question_bank/tests/test_question_asset_integration.py apps/question_bank/tests/test_import_resolver.py apps/question_bank/tests/test_backfill_exam_question_bank_sources.py apps/contests/tests/exam/test_exam_questions_api.py apps/contests/tests/management/test_contest_viewset_actions.py
  ```

  Expected: PASS，包含 coding 與 paper exam adapter/version flow。

- [ ] **Step 6: 做 runtime 負向掃描**

  ```bash
  rg -n 'QuestionAsset\.(Status|Visibility|VersionState)|\bversion_state\b|visibility=|status=' backend/apps/question_bank --glob '!**/migrations/**' --glob '!**/tests/**'
  ```

  Expected: 無 retired QuestionAsset state 引用；HTTP `status=` 或其他 models 的欄位可人工辨識，不做盲目全文取代。

- [ ] **Step 7: 明確 stage 並提交**

  ```bash
  git add -- backend/apps/question_bank/question_assets.py backend/apps/question_bank/tests/test_api.py backend/apps/question_bank/tests/test_question_asset_integration.py backend/apps/question_bank/tests/test_import_resolver.py backend/apps/question_bank/tests/test_backfill_exam_question_bank_sources.py backend/apps/contests/tests/exam/test_exam_questions_api.py backend/apps/contests/tests/management/test_contest_viewset_actions.py
  git commit -m "refactor: remove question asset marketplace state"
  ```

---

### Task 4: 清理舊 fixture/commands 並直接驗證 QuestionVersion 快照

**Files:**

- Modify: `backend/apps/question_bank/tests/test_backfill_question_assets.py`
- Test: `backend/apps/question_bank/tests/test_question_asset_integration.py`
- Test: `backend/apps/contests/tests/exam/test_exam_questions_api.py`

- [ ] **Step 1: 分辨 unrelated status 與 retired QuestionAsset status**

  執行：

  ```bash
  rg -n 'QuestionAsset\.(Status|Visibility|VersionState)|question_asset[^\n]*(status|visibility|version_state)|create_question_asset\(' backend --glob '!**/migrations/**'
  ```

  逐一移除只屬於 `QuestionAsset` 的參數/fixture。`BankQuestion.status`、`Contest.status`、DRF `status.HTTP_*` 等不同概念不得刪除。

- [ ] **Step 2: 加強版本快照回歸測試**

  在既有 integration test 以公開 service 建立 asset/version 1，再更新內容得到 version 2，建立/更新 contest binding pin version 1，驗證：

  - `asset.latest_version_id == version_2.id`；
  - `version_1.payload` 沒有被 update 改寫；
  - binding 仍指向 version 1；
  - 讀取考試題目使用 pinned version，而不是 asset 最新內容。

  優先擴充已有最接近案例，不建立第二套 test helper。

- [ ] **Step 3: 跑完整 question-bank suite**

  ```bash
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest -q apps/question_bank/tests apps/contests/tests/exam apps/problems/tests apps/submissions/tests
  ```

  Expected: PASS。

- [ ] **Step 4: 明確 stage 並提交**

  用 scoped scan 與 `git diff --name-only` 列出本 task 實際修改的測試檔，逐檔執行 `git add -- <file>`，再確認：

  ```bash
  git diff --cached --name-only
  git commit -m "test: protect immutable question snapshots"
  ```

  Cached list 只能包含實際移除 retired fields 或新增 snapshot assertion 的檔案；不得 stage 整個 tests directory。

---

### Task 5: 更新 schema、套用本地 DB migration 並完成驗證

**Files:**

- Modify: `backend/schema.yml`

- [ ] **Step 1: 重新產生 OpenAPI schema**

  ```bash
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py spectacular --file schema.yml
  ```

  `QuestionAsset` fields 若未直接暴露在 API，schema 可能沒有 diff；不得為了製造 diff 手改 schema。

- [ ] **Step 2: 套用本地 dev DB migration**

  ```bash
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py migrate question_bank
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py showmigrations question_bank
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py makemigrations --check --dry-run
  ```

  Expected: `[X] 0019_private_question_assets`，無 model drift。

- [ ] **Step 3: 在 local DB 驗證資料結果**

  透過 `manage.py shell -c` 輸出並人工核對：

  - `QuestionBank.objects.filter(owner__isnull=True).count() == 0`；
  - 所有 bank 都有 owner；
  - `QuestionVersion` 與 `ContestQuestionBinding` 數量仍大於零；
  - 至少原有 pinned-to-older-version bindings 仍存在（migration 前基準為 10；若工作樹測試資料已改，記錄實際 before/after 而非硬寫 10）。

- [ ] **Step 4: 執行最終 gates**

  ```bash
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest -q apps/question_bank/tests apps/contests/tests/exam apps/problems/tests apps/submissions/tests
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py check
  git diff --check
  ```

- [ ] **Step 5: 最終 source scan**

  ```bash
  rg -n 'QuestionAsset\.(Status|Visibility|VersionState)|\bversion_state\b' backend --glob '!**/migrations/**'
  rg -n 'QuestionVersion|latest_version|question_version' backend/apps/question_bank backend/apps/contests backend/apps/problems
  ```

  Expected: 第一條無 runtime retired state；第二條仍有完整版本與 snapshot 引用。

- [ ] **Step 6: 提交 schema（有 diff 才提交）**

  ```bash
  git add -- backend/schema.yml
  git diff --cached --quiet || git commit -m "chore: refresh question bank API schema"
  ```
