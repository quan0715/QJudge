# 私人教室考試強制化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓每場考試必須且只能屬於一間教室，刪除所有未綁教室的舊考試及其考試資料，移除 `Contest.visibility` 與公開/匿名存取，並保留既有 admin、teacher、student、TA、考試狀態與教室內功能。

**Architecture:** `apps.classrooms.ClassroomContest` 是考試歸屬的唯一資料庫邊界；classrooms migration 先清資料並加 unique constraint，contests migration 再移除 visibility。考試建立只從 classroom service 進行，global contest endpoint 明確拒絕 create。存取由 classroom membership、contest participation 與管理 scope 決定，不再經過 public/private 分支。

**Tech Stack:** Django 4.2 ORM/migrations、Django REST Framework、pytest、PostgreSQL、React 19、TypeScript、Vitest、drf-spectacular、Docker Compose。

## Global Constraints

- 設計依據：`docs/superpowers/specs/2026-08-12-retire-unused-surfaces-and-enforce-private-classroom-contests-design.md`。
- 此 migration 刪除未綁教室考試是使用者明確授權的 irreversible cleanup；不建立暫存教室、不備份、不保留 orphan contest shell。
- 不修改 platform `student`、`teacher`、`admin` roles；不下架 classroom `ta` 或 contest `co_owner` scope。
- 不刪除 `Contest.status`、QR attendance、防作弊、監考、考試公告、Clarification、成績、報表或考試內 scoreboard。
- 不新增 `is_private` 或常數 visibility 欄位。移除 `Contest.visibility` 後，private 是結構 invariant。
- Migration 必須先處理資料再加 constraint/移除欄位；失敗時由 Django transaction rollback，不寫部分完成旗標。
- 工作樹已有大量使用者修改；target file 先看 `git diff -- <path>`，只做本計畫最小修改。
- 所有 backend/frontend 指令必須透過 `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh` 對應 dev container 執行。
- 每次只用明確路徑 stage；不得使用 `git add -A` 或 stage 全工作樹的 helper。

---

### Task 1: 用 migration test 鎖定 destructive cleanup 與唯一綁定

**Files:**

- Create: `backend/apps/classrooms/tests/test_private_contest_migration.py`
- Reference: `backend/apps/classrooms/migrations/0001_initial_squashed_0008_drop_legacy_email_notifications.py`
- Reference: `backend/apps/contests/migrations/0095_remove_contest_question_edit_lock_fields.py`

- [ ] **Step 1: 建立跨 app MigrationExecutor state**

  `migrate_from` 將 classrooms 固定在 `0001_initial_squashed_0008_drop_legacy_email_notifications`、contests 固定在 `0095_remove_contest_question_edit_lock_fields`；其他 app 使用當前 leaf。`migrate_to` 指向新 contests leaf `0096_remove_contest_visibility`，它會透過 dependency 自動包含 classrooms `0002_enforce_single_contest_binding`。

- [ ] **Step 2: 建立保留、未綁定、重複綁定三組資料**

  Historical models 建立：

  - 兩間 classroom；
  - `kept_contest`：只綁第一間 classroom，visibility=`public`；
  - `orphan_contest`：完全沒有 binding，visibility=`public`；
  - `duplicate_contest`：同時綁兩間 classroom，使用 queryset update 令第一筆 `bound_at` 更早。

  每個 contest 使用 UUID primary key 並填 historical state 的最小必填欄位。

- [ ] **Step 3: 為 orphan contest 建立代表性依賴資料**

  至少建立並記錄 ids：

  - `ContestParticipant`；
  - `ContestAnnouncement`；
  - `Clarification`；
  - `ExamQuestion` + `ExamAnswer`；
  - `ExamEvent` + `ContestActivity`（依 historical field requirements 填最小值）；
  - `QuestionAsset` + `QuestionVersion` + `ContestQuestionBinding`；
  - `CodingProblem` + `Submission` + `SubmissionResult`，Submission 同時連到 orphan contest/binding。

  測試資料要區分「考試專屬 row」與可獨立存在的 owned QuestionAsset/CodingProblem：migration 後前者消失，後者依 FK ownership 保留。

- [ ] **Step 4: 寫 migration 後 assertions**

  驗證：

  - orphan contest、submission/result、participant、answer、event/activity、announcement/clarification、binding 全部消失；
  - kept contest 與 duplicate contest 仍存在；
  - duplicate contest 只剩最早 binding；
  - 所有保留 contest state 不再有 `visibility` field；
  - `ClassroomContest._meta` 含單欄 `contest` unique constraint；
  - 第二次為同 contest 建立 binding 會 raise `IntegrityError`；
  - unrelated QuestionAsset/CodingProblem 仍存在，沒有意外刪除教師題庫內容。

- [ ] **Step 5: 執行測試並確認 red phase**

  ```bash
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest -q apps/classrooms/tests/test_private_contest_migration.py
  ```

  Expected: 新 migration 尚不存在，測試失敗。

---

### Task 2: 實作資料清理、唯一約束與 visibility schema removal

**Files:**

- Create: `backend/apps/classrooms/migrations/0002_enforce_single_contest_binding.py`
- Create: `backend/apps/contests/migrations/0096_remove_contest_visibility.py`
- Modify: `backend/apps/classrooms/models.py`
- Modify: `backend/apps/contests/models/contest.py`
- Modify: `backend/apps/contests/admin.py`
- Test: `backend/apps/classrooms/tests/test_private_contest_migration.py`

- [ ] **Step 1: 建立 classrooms data migration dependencies**

  `0002_enforce_single_contest_binding` dependencies：

  ```python
  dependencies = [
      ("classrooms", "0001_initial_squashed_0008_drop_legacy_email_notifications"),
      ("contests", "0095_remove_contest_question_edit_lock_fields"),
  ]
  ```

  這條 dependency graph 是 `contests.0095 -> classrooms.0002 -> contests.0096`，不會和 classrooms 初始 migration 對 contests 0032 的既有 dependency 形成循環。

- [ ] **Step 2: 在 data migration 明確刪除 orphan submissions**

  `Submission.contest` 使用 `SET_NULL`，只刪 Contest 會保留失去考試語意的 submission。因此 cleanup 必須先取得 `orphan_ids`，再：

  ```python
  Submission.objects.filter(contest_id__in=orphan_ids).delete()
  Contest.objects.filter(pk__in=orphan_ids).delete()
  ```

  `SubmissionResult` 由 submission cascade；其他 contest-owned rows 依既有 CASCADE 移除。QuestionAsset/CodingProblem 不因 adapter FK 為 SET_NULL/CASCADE 組合而被誤刪。

- [ ] **Step 3: 正規化重複 binding 與 visibility**

  對 `ClassroomContest` 依 `contest_id`, `bound_at`, `pk` 排序，每個 contest 保留第一筆，其餘 binding ids 批次刪除。接著將所有保留 contest `visibility="private"`，讓 schema removal 前的任何中途 state 也沒有 public rows。

- [ ] **Step 4: 加上 database constraint**

  `ClassroomContest.Meta.constraints` 新增：

  ```python
  models.UniqueConstraint(
      fields=["contest"],
      name="unique_classroom_binding_per_contest",
  )
  ```

  保留既有 `(classroom, contest)` unique_together；不要把 FK 改成 OneToOneField，避免不必要 API/related descriptor churn。

- [ ] **Step 5: 在 contests migration 移除 visibility**

  `0096_remove_contest_visibility` 同時依賴 contests `0095` 與 classrooms `0002`，唯一 operation 為 `RemoveField(model_name="contest", name="visibility")`。current `Contest` model 刪除 choices/field，admin list/filter 刪除 visibility。

- [ ] **Step 6: 執行 migration tests 與 model drift check**

  ```bash
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest -q apps/classrooms/tests/test_private_contest_migration.py
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py makemigrations --check --dry-run
  ```

  Expected: PASS，`No changes detected`。

- [ ] **Step 7: 明確 stage 並提交**

  ```bash
  git add -- backend/apps/classrooms/migrations/0002_enforce_single_contest_binding.py backend/apps/classrooms/models.py backend/apps/classrooms/tests/test_private_contest_migration.py backend/apps/contests/migrations/0096_remove_contest_visibility.py backend/apps/contests/models/contest.py backend/apps/contests/admin.py
  git commit -m "refactor: enforce one classroom per contest"
  ```

---

### Task 3: 讓考試只可由 classroom workflow 建立

**Files:**

- Modify: `backend/apps/classrooms/serializers.py`
- Modify: `backend/apps/classrooms/services/course_contests.py`
- Modify: `backend/apps/classrooms/tests/test_services.py`
- Modify: `backend/apps/classrooms/tests/test_create_permissions.py`
- Modify: `backend/apps/contests/views/contest.py`
- Modify: `backend/apps/contests/serializers.py`
- Modify: `backend/apps/contests/tests/management/test_contest_viewset_actions.py`
- Modify: `backend/apps/contests/management/commands/seed_exam_data.py`

- [ ] **Step 1: 先改 tests 表達新建立契約**

  `test_create_classroom_contest_binds_and_registers_members` 的 input 移除 visibility，並驗證 result contest 正好有一筆 classroom binding。在 `test_create_permissions.py` 新增 classroom endpoint test：teacher owner POST `/api/v1/classrooms/{id}/contests/` 可建立且 response 不含 `contest_visibility`。在 contest management test 新增 global endpoint test：teacher POST `/api/v1/contests/` 得 `400`，body error code 為 `contest_requires_classroom_binding`，資料庫沒有新增 Contest。

- [ ] **Step 2: 簡化 classroom serializer/service**

  `CreateClassroomContestSerializer` 刪除 visibility field。`_create_bound_contest` signature 刪除 visibility，`Contest.objects.create` 不再寫該欄；`create_classroom_contest` 不再讀 `data.get("visibility")`。保持 contest 與 binding 在同一 `transaction.atomic()`，避免建立未綁定 contest。

- [ ] **Step 3: 拒絕 global create，不新增替代流程**

  在 `ContestViewSet.create()` 直接回傳現有 `_contest_requires_classroom_binding_response()`；刪除 `get_permissions` 對 create 的 special case 與 `perform_create`，因為 global create 永遠不進 serializer save。不要新增 redirect 或自動 classroom。

- [ ] **Step 4: 從 serializers/filter/seed data 移除 visibility**

  `ContestListSerializer`、`ContestDetailSerializer`、`ContestCreateUpdateSerializer` fields 刪除 visibility；`ContestViewSet.filterset_fields` 移除 visibility，docstring 改成 classroom relationship/status。seed command defaults 刪除 `"visibility": "private"`。

- [ ] **Step 5: 執行建立流程測試**

  ```bash
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest -q apps/classrooms/tests/test_services.py apps/classrooms/tests/test_create_permissions.py apps/contests/tests/management/test_contest_viewset_actions.py
  ```

  Expected: classroom create PASS；global create 400 且不落資料。

- [ ] **Step 6: 明確 stage 並提交**

  ```bash
  git add -- backend/apps/classrooms/serializers.py backend/apps/classrooms/services/course_contests.py backend/apps/classrooms/tests/test_services.py backend/apps/classrooms/tests/test_create_permissions.py backend/apps/contests/views/contest.py backend/apps/contests/serializers.py backend/apps/contests/tests/management/test_contest_viewset_actions.py backend/apps/contests/management/commands/seed_exam_data.py
  git commit -m "refactor: create contests only from classrooms"
  ```

---

### Task 4: 移除 public/anonymous/outsider 考試存取

**Files:**

- Modify: `backend/apps/contests/managers.py`
- Modify: `backend/apps/contests/access_policy.py`
- Modify: `backend/apps/contests/permissions.py` only where comments/permission output imply public access
- Modify: `backend/apps/contests/tests/access/test_access_policy.py`
- Modify: `backend/apps/contests/tests/access/test_scope_roles.py`
- Modify: `backend/apps/contests/tests/listings/test_inactive_access.py`
- Modify: `backend/apps/contests/tests/participation/test_participation.py`
- Modify: `backend/apps/contests/tests/standings/test_standings.py`
- Modify: any contest test fixture reported by the scoped scan in Step 5

- [ ] **Step 1: 先寫匿名與 outsider denial tests**

  對 published、classroom-bound contest 驗證：

  - unauthenticated list 不含 contest；retrieve/standings 無法讀取；
  - authenticated outsider（不在 classroom、無 registration）list 不含 contest，retrieve/standings 回 `404` 或既有 masked denial；
  - classroom student/registered participant 仍可依 status/time rules 讀取；
  - classroom owner/admin/TA 與 platform admin 的管理能力不變。

  測試不再建立 `visibility="public"` 才決定可見性。

- [ ] **Step 2: 移除 access policy 的公開權限**

  `BASE_ROLE_PERMISSIONS["anonymous"]` 與 `["outsider"]` 改成空 set；刪除 `view_public_contest`。保留 `anonymous`/`outsider` scope label 作拒絕判斷與 masked 404，不必為「看不到」而重構整個 role resolver。

- [ ] **Step 3: 簡化 ContestQuerySet.visible_to**

  - unauthenticated 一律 `none()`；
  - `scope="manage"` 保留 platform admin、owner、admins 與 classroom manager filter；
  - `scope="participated"` 保留 authenticated registration flow與 draft restriction；
  - default visible 只取 `status="published"` 且符合 registration、classroom owner/admin/member、contest owner/admin 關係的 rows；
  - 完全刪除 `.filter(visibility__in=[...])` 與 public wording。

- [ ] **Step 4: 確認 scoreboard 只經 contest scope**

  `get_contest_permissions` 可依 `scoreboard_visible_during_contest` 決定 participant 顯示，但 outsider/anonymous 不能因該 bool 取得 object。更新誤寫成「participants and outsiders」的註解，不刪除 contest 內 scoreboard setting。

- [ ] **Step 5: 清除 backend fixture 的 visibility 參數**

  ```bash
  rg -l '\bvisibility\s*=|"visibility"\s*:' backend/apps/contests backend/apps/classrooms --glob '!**/migrations/**'
  ```

  逐檔移除 Contest fixture/create/update payload 的 retired field。不要誤刪 Clarification `is_public`，它控制單場考試內 Q&A 對參賽者顯示，明確不在本次下架範圍。

- [ ] **Step 6: 執行 access/participation/standings suites**

  ```bash
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest -q apps/contests/tests/access apps/contests/tests/listings apps/contests/tests/participation apps/contests/tests/standings
  ```

  Expected: PASS。

- [ ] **Step 7: 明確 stage 並提交**

  使用 `git diff --name-only -- backend/apps/contests backend/apps/classrooms` 取得實際修改清單，逐檔 stage；不要用整個 tests directory stage，以免帶入不相關工作樹修改。

  ```bash
  git commit -m "refactor: remove public contest access"
  ```

---

### Task 5: 移除 frontend contest visibility contract 與 UI

**Files:**

- Modify: `frontend/src/core/entities/contest.entity.ts`
- Modify: `frontend/src/core/entities/classroom.entity.ts`
- Modify: `frontend/src/core/ports/contest.repository.ts`
- Modify: `frontend/src/infrastructure/api/dto/contest.dto.ts`
- Modify: `frontend/src/infrastructure/api/dto/classroom.dto.ts`
- Modify: `frontend/src/infrastructure/mappers/contest.mapper.ts`
- Modify: `frontend/src/infrastructure/mappers/classroom.mapper.ts`
- Modify: `frontend/src/features/classroom/components/ClassroomContestCard.tsx`
- Modify: `frontend/src/features/contest/screens/admin/panels/AdminContestSettingsScreen.tsx`
- Modify: `frontend/src/features/contest/components/admin/examEditor/hooks/useExamAutoSave.ts`
- Modify: `frontend/src/shared/mocks/contest.mock.ts`
- Modify: all focused tests/stories reported by the scan below

- [ ] **Step 1: 先更新 mapper/UI tests**

  從 contest/classroom fixtures 移除 `visibility`、`contestVisibility`、`contest_visibility`，並調整 assertions：UI 不顯示公開/私人 badge，update request 不送 visibility。保留 status、attendance、contest type 等 badges。

- [ ] **Step 2: 移除 core/port/DTO fields**

  刪除 `ContestVisibility` type、`Contest.visibility`、`ContestUpdateRequest.visibility`、repository update input visibility、`ContestDto.visibility`、`BoundContest.contestVisibility` 與 `BoundContestDto.contest_visibility`。

- [ ] **Step 3: 移除 mapper fallback 與 request mapping**

  `mapContestDto` 不再使用 `dto.visibility || "public"`；`mapContestUpdateRequest` 不再輸出 visibility；classroom mapper 不再映射 contest visibility。

- [ ] **Step 4: 移除呈現與設定欄位**

  `ClassroomContestCard` 不再傳 visibility。`AdminContestSettingsScreen` form/default/update payload 刪除 visibility；若畫面有 Carbon Select/Radio，連同 label/helper text 刪除，不以 disabled「私人」欄位替代。`useExamAutoSave` 的 setting-to-field map 刪除 visibility。

- [ ] **Step 5: 機械更新 fixtures，但逐一辨識同名概念**

  ```bash
  rg -n 'ContestVisibility|contestVisibility|contest_visibility|contest\.visibility|visibility: "(public|private)"' frontend/src --glob '!**/*.scss' --glob '!**/i18n/**'
  ```

  更新列出的 contest tests/stories/mocks。不要刪除 Clarification `isPublic`、DOM/CSS visibility、admin panel visibility 或其他非 Contest.visibility 概念。

- [ ] **Step 6: 執行 focused frontend tests**

  ```bash
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run test -- --run src/infrastructure/mappers src/features/classroom src/features/contest src/core/usecases/contest
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run typecheck
  ```

  Frontend container 以 `/app` 為 root，因此測試參數固定使用 `src/...`；不要在 host 直接跑 npm。

- [ ] **Step 7: 明確 stage 並提交**

  先用 `git diff --name-only` 列出本 task 的實際 TS/TSX files，再逐檔 `git add --`。特別檢查 `frontend/src/core/ports/contest.repository.ts` 與既有 core refactor 是否有重疊，保留使用者修改。

  ```bash
  git commit -m "refactor: remove contest visibility from frontend"
  ```

---

### Task 6: 更新 schema、套用 local DB migrations 並驗證所有保留流程

**Files:**

- Modify: `backend/schema.yml`

- [ ] **Step 1: 重新產生 OpenAPI schema**

  ```bash
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py spectacular --file schema.yml
  ```

  驗證 Contest/BoundContest schemas 與 query parameters 不含 visibility，classroom create payload 也不含 visibility。

- [ ] **Step 2: 在 migration 前記錄 local dev DB destructive count**

  使用 container 中 `manage.py shell -c` 輸出：總 Contest、未綁 Contest、重複 binding、Submission linked to unbound contest 的數量。依先前盤點預期未綁考試為 4，但以執行當下輸出為準，將結果留在執行紀錄；不要再向使用者詢問是否刪除。

- [ ] **Step 3: 套用 local dev DB migrations**

  ```bash
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py migrate
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py showmigrations classrooms contests
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py makemigrations --check --dry-run
  ```

  Expected: classrooms `0002`、contests `0096` 為 `[X]`，沒有 model drift。

- [ ] **Step 4: 驗證 local DB 最終 invariant**

  透過 ORM/introspection 確認：

  - `Contest.objects.filter(classroom_bindings__isnull=True).count() == 0`；
  - 每個 contest binding count 恰為 1；
  - `Contest` model/table 沒有 visibility；
  - orphan contest ids 已不存在；
  - migration 前屬於 orphan contests 的 submissions/results 已不存在；
  - classroom/contest announcements、Clarifications 與 bound contests 仍有資料或至少 table 存在。

- [ ] **Step 5: 跑 backend focused 與完整 gates**

  ```bash
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest -q apps/classrooms/tests apps/contests/tests apps/question_bank/tests apps/submissions/tests
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py check
  ```

- [ ] **Step 6: 跑 frontend gates**

  ```bash
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run check:i18n
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run test -- --run
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run typecheck
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run build
  ```

- [ ] **Step 7: 最終負向與保留功能掃描**

  ```bash
  rg -n '\bvisibility\b|ContestVisibility|contestVisibility|contest_visibility' backend/apps/contests backend/apps/classrooms frontend/src/core/entities/contest.entity.ts frontend/src/core/entities/classroom.entity.ts frontend/src/features/contest frontend/src/features/classroom frontend/src/infrastructure --glob '!**/migrations/**' --glob '!**/*.scss'
  rg -n 'ContestAnnouncement|Clarification|scoreboard_visible_during_contest|attendance_check_enabled|cheat_detection_enabled' backend/apps/contests frontend/src/features/contest
  ```

  第一條若有輸出，逐筆確認只剩 Clarification `is_public`、generic UI visibility 或其他不同 domain；不得用全域 replace。第二條必須仍有保留功能引用。

- [ ] **Step 8: 自我審查與提交 schema**

  執行 `git diff --check`，檢查 migration dependency、irreversible cleanup、API 400 contract、anonymous/outsider denial、frontend payload。只 stage schema 與本 task 尚未提交檔案：

  ```bash
  git add -- backend/schema.yml
  git diff --cached --quiet || git commit -m "chore: refresh classroom contest API schema"
  ```
