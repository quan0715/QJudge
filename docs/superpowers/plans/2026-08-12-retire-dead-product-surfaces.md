# 下架無效產品入口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完整移除題目討論、全站排行榜佔位頁、更新紀錄、AI 使用量產品入口與全站公告，同時保留教室公告、考試公告、Clarification 與 AI service 內部 telemetry。

**Architecture:** 前端從 feature assembly、路由、翻譯及 infrastructure adapter 一路刪除失效功能；後端只移除公開 BFF/runtime surface。全站公告資料表由仍啟用的 `apps.core` migration 清除，避免已部署資料庫因 app 先被移出 `INSTALLED_APPS` 而遺留孤立資料表。

**Tech Stack:** React 19、TypeScript、React Router、Vitest、Django 4.2、Django REST Framework、pytest、drf-spectacular、Docker Compose。

## Global Constraints

- 設計依據：`docs/superpowers/specs/2026-08-12-retire-unused-surfaces-and-enforce-private-classroom-contests-design.md`。
- 工作樹已有大量使用者修改；每個 target file 先執行 `git diff -- <path>`，不得覆蓋不相關修改。刪除已在本計畫明列的檔案屬授權範圍。
- 所有 Django、pytest、migration 與 schema 指令必須經由 `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh` 執行；不得直接在 host 跑 `manage.py`。
- 前端指令必須在 dev frontend container 執行。
- 每次 commit 僅用 `git add -- <explicit paths>`；不得使用會一次 stage 全部 tracked changes 的 helper 或 `git add -A`。
- 不新增 feature flag、redirect、相容 endpoint 或「功能已下架」空白頁；已移除 URL/API 直接走既有 `404`。
- 不刪除 `apps.classrooms.ClassroomAnnouncement`、`apps.contests.ContestAnnouncement`、`Clarification`、`frontend/src/shared/ui/announcement` 或 contest announcement repositories。
- 不刪除 `ai-service` 的 `/v1/usage` 與內部 token/run telemetry；只移除 Django BFF `/api/v1/ai/usage/` 和產品 UI。

---

### Task 1: 先鎖定 retired API 與保留功能邊界

**Files:**

- Modify: `backend/apps/ai/tests/test_bff_usage.py`
- Modify: `backend/apps/ai/tests/test_bff_permissions.py`
- Create: `backend/apps/core/tests/test_retired_product_routes.py`
- Test: `backend/apps/classrooms/tests/announcements/test_announcements.py`
- Test: `backend/apps/contests/tests/management/test_contest_viewset_actions.py`

- [ ] **Step 1: 將 AI usage happy-path test 改成移除契約**

  在 `test_bff_usage.py` 保留既有 legacy credit `404` test，將 `test_usage_endpoint_maps_only_token_usage` 改成：教師 GET `/api/v1/ai/usage/` 得到 `404`，且 `ai_transport.requests == []`。

- [ ] **Step 2: 從 student permission matrix 移除 usage route**

  `/api/v1/ai/usage/` 不再是存在但拒絕學生的 endpoint，因此不得期待 `403`。

- [ ] **Step 3: 新增全站公告 retired route test**

  在 `test_retired_product_routes.py` 使用 authenticated admin client 驗證：

  ```python
  response = api_client.get("/api/v1/management/announcements/")
  assert response.status_code == 404
  ```

  同檔加入資料表邊界 smoke assertion：`classrooms_classroomannouncement` 與 `contest_announcements` 仍存在，而 `announcements_announcement` 不存在。不要 import 已移除的 `apps.announcements`。

- [ ] **Step 4: 執行測試並確認目前會失敗**

  ```bash
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest -q apps/ai/tests/test_bff_usage.py apps/core/tests/test_retired_product_routes.py
  ```

  Expected: usage 與全站公告 route 仍存在，測試失敗；這是 red phase。

- [ ] **Step 5: 暫不提交測試**

  測試要和各自 runtime removal 一起提交，避免 branch 中留下刻意失敗的 commit。

---

### Task 2: 刪除題目討論前端垂直切片

**Files:**

- Modify: `frontend/src/features/problems/screens/problemsId/section/ProblemDetailSection.tsx`
- Modify: `frontend/src/features/problems/screens/problemsId/section/ProblemDetailSection.scss`
- Modify: `frontend/src/features/problems/components/layout/ProblemTabs.tsx`
- Modify: `frontend/src/features/problems/components/index.ts`
- Modify: `frontend/src/features/problems/hooks/index.ts`
- Modify: `frontend/src/infrastructure/mappers/index.ts`
- Delete: `frontend/src/core/entities/discussion.entity.ts`
- Delete: `frontend/src/features/problems/components/discussions/`
- Delete: `frontend/src/features/problems/hooks/useProblemDiscussions.ts`
- Delete: `frontend/src/features/problems/utils/discussionReplies.ts`
- Delete: `frontend/src/infrastructure/api/dto/discussion.dto.ts`
- Delete: `frontend/src/infrastructure/api/repositories/discussion.repository.ts`
- Delete: `frontend/src/infrastructure/mappers/discussion.mapper.ts`
- Delete: `frontend/src/shared/ui/discussion/`

- [ ] **Step 1: 移除題目詳細頁的討論 section**

  刪除 `DiscussionList` import、整個「討論區」 section，以及 `ProblemDetailSection.scss` 中只服務 `.discussion-list` 的 override。調整後提交記錄成為第三個 section、統計成為第四個 section；註解編號一併更新。

- [ ] **Step 2: 移除舊 tab 定義**

  從 `ProblemTabs.tsx` 刪除 `{ label: "討論", key: "discussions" }`。保留題目、解題與提交、提交記錄、解題統計與管理者設定。

- [ ] **Step 3: 刪除 discussion 實作與 barrel exports**

  刪除列出的 entities、DTO、mapper、repository、hooks、utils、components、shared UI 與 stories，並移除三個 barrel export。不要碰 `frontend/src/features/contest/components/ContestClarifications.tsx` 或其 announcements/clarifications hooks。

- [ ] **Step 4: 執行負向引用掃描**

  ```bash
  rg -n 'DiscussionList|useProblemDiscussions|discussion\.repository|discussion\.mapper|discussion\.entity|ProblemDiscussionThread|key: "discussions"' frontend/src
  ```

  Expected: 無輸出。`ContestClarifications`、`ContestAnnouncement` 可正常存在，因為它們不是題目討論。

- [ ] **Step 5: 執行 frontend typecheck**

  ```bash
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run typecheck
  ```

  Expected: PASS。

- [ ] **Step 6: 明確 stage 並提交**

  ```bash
  git add -- frontend/src/core/entities/discussion.entity.ts frontend/src/features/problems/components/discussions frontend/src/features/problems/components/index.ts frontend/src/features/problems/components/layout/ProblemTabs.tsx frontend/src/features/problems/hooks/index.ts frontend/src/features/problems/hooks/useProblemDiscussions.ts frontend/src/features/problems/screens/problemsId/section/ProblemDetailSection.tsx frontend/src/features/problems/screens/problemsId/section/ProblemDetailSection.scss frontend/src/features/problems/utils/discussionReplies.ts frontend/src/infrastructure/api/dto/discussion.dto.ts frontend/src/infrastructure/api/repositories/discussion.repository.ts frontend/src/infrastructure/mappers/discussion.mapper.ts frontend/src/infrastructure/mappers/index.ts frontend/src/shared/ui/discussion
  git commit -m "refactor: remove problem discussions"
  ```

---

### Task 3: 移除全站排行榜與更新紀錄

**Files:**

- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/features/app/components/UserMenu.tsx`
- Modify: `frontend/src/i18n/index.ts`
- Modify: `frontend/src/i18n/locales/en/common.json`
- Modify: `frontend/src/i18n/locales/ja/common.json`
- Modify: `frontend/src/i18n/locales/ko/common.json`
- Modify: `frontend/src/i18n/locales/zh-TW/common.json`
- Delete: `frontend/src/features/changelog/`
- Delete: `frontend/src/i18n/locales/zh-TW/changelog.json`
- Delete: `frontend/public/changelog/`

- [ ] **Step 1: 從 App route tree 刪除兩條路由**

  移除 `changelogRoutes` import 與 `{changelogRoutes}`，並刪除 `/ranking` 的 Coming Soon `<Route>`。保留 `/docs`、單一考試 standings/scoreboard 與其他 contest routes。

- [ ] **Step 2: 從 UserMenu 移除更新紀錄入口**

  刪除導向 `/changelog` 的 menu item。若 `UserMenu.tsx` 因其他工作有未提交修改，只做最小區塊刪除。

- [ ] **Step 3: 刪除 changelog feature 與靜態內容**

  刪除 feature route/screen/style、`frontend/public/changelog` 內容，以及 i18n 的 `zhTWChangelog` import、resource registration 與 `changelog` namespace。

- [ ] **Step 4: 只移除全站 nav 翻譯**

  四個 `common.json` 刪除 `nav.changelog` 與 `nav.ranking`。不要刪除 `contest.json` 內單場考試的 ranking/scoreboard 文案，也不要修改 landing page 一般性的產品文字。

- [ ] **Step 5: 驗證 URL 已無 runtime 註冊**

  ```bash
  rg -n 'features/changelog|changelogRoutes|path="/changelog"|path="/ranking"|Ranking Page \(Coming Soon\)|nav\.changelog|nav\.ranking' frontend/src frontend/public
  ```

  Expected: 無輸出。

- [ ] **Step 6: 執行 i18n 與 typecheck**

  ```bash
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run check:i18n
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run typecheck
  ```

  Expected: PASS。

- [ ] **Step 7: 明確 stage 並提交**

  ```bash
  git add -- frontend/src/App.tsx frontend/src/features/app/components/UserMenu.tsx frontend/src/features/changelog frontend/src/i18n/index.ts frontend/src/i18n/locales/en/common.json frontend/src/i18n/locales/ja/common.json frontend/src/i18n/locales/ko/common.json frontend/src/i18n/locales/zh-TW/common.json frontend/src/i18n/locales/zh-TW/changelog.json frontend/public/changelog
  git commit -m "refactor: remove changelog and ranking placeholder"
  ```

---

### Task 4: 移除 AI 使用量產品入口與 Django BFF

**Files:**

- Modify: `frontend/src/features/auth/components/SettingsDialog.tsx`
- Delete: `frontend/src/features/auth/components/AIUsagePanel.tsx`
- Delete: `frontend/src/features/auth/components/AIUsagePanel.test.tsx`
- Modify: `frontend/src/i18n/locales/en/common.json`
- Modify: `frontend/src/i18n/locales/ja/common.json`
- Modify: `frontend/src/i18n/locales/ko/common.json`
- Modify: `frontend/src/i18n/locales/zh-TW/common.json`
- Modify: `backend/apps/ai/urls.py`
- Modify: `backend/apps/ai/views.py`
- Modify: `backend/apps/ai/tests/test_bff_usage.py`
- Modify: `backend/apps/ai/tests/test_bff_permissions.py`

- [ ] **Step 1: 移除 SettingsDialog 的 usage navigation 與 panel**

  刪除 `Activity`、`AIUsagePanel`、`MemoAIUsagePanel`、`ai-usage` nav item、desktop switch case 與 mobile section。教師/admin 的 MCP 設定仍保留；`student`、`teacher`、`admin` 判斷不變。

- [ ] **Step 2: 刪除 panel 與四語翻譯**

  刪除 `AIUsagePanel.tsx` 及其 test。四個 `common.json` 刪除 `settings.aiUsage` object 與 `settings.tabs.aiUsage`，不要移除 AI 模型、AI 任務或 MCP 文案。

- [ ] **Step 3: 移除 Django BFF route/view**

  從 `backend/apps/ai/urls.py` import 與 urlpatterns 刪除 `UsageView`；從 `backend/apps/ai/views.py` 刪除 `UsageView` class。不要改 `ModelListView`，也不要改 `ai-service`。

- [ ] **Step 4: 執行先前建立的 backend removal test**

  ```bash
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest -q apps/ai/tests/test_bff_usage.py apps/ai/tests/test_bff_permissions.py
  ```

  Expected: PASS，usage route 為 `404` 且沒有 upstream request。

- [ ] **Step 5: 執行 frontend 負向掃描與 typecheck**

  ```bash
  rg -n 'AIUsagePanel|ai-usage|settings\.aiUsage|settings\.tabs\.aiUsage' frontend/src
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run typecheck
  ```

  Expected: scan 無輸出，typecheck PASS。

- [ ] **Step 6: 明確 stage 並提交**

  ```bash
  git add -- backend/apps/ai/urls.py backend/apps/ai/views.py backend/apps/ai/tests/test_bff_usage.py backend/apps/ai/tests/test_bff_permissions.py frontend/src/features/auth/components/AIUsagePanel.tsx frontend/src/features/auth/components/AIUsagePanel.test.tsx frontend/src/features/auth/components/SettingsDialog.tsx frontend/src/i18n/locales/en/common.json frontend/src/i18n/locales/ja/common.json frontend/src/i18n/locales/ko/common.json frontend/src/i18n/locales/zh-TW/common.json
  git commit -m "refactor: remove AI usage product surface"
  ```

---

### Task 5: 移除全站公告 runtime 與資料表

**Files:**

- Modify: `backend/config/settings/base.py`
- Modify: `backend/config/urls.py`
- Delete: `backend/apps/announcements/`
- Create: `backend/apps/core/migrations/__init__.py`
- Create: `backend/apps/core/migrations/0001_drop_global_announcements.py`
- Create: `backend/apps/core/tests/test_retired_product_routes.py`
- Modify: `frontend/src/features/admin/routes.tsx`
- Delete: `frontend/src/features/admin/screens/AnnouncementManagementScreen.tsx`
- Modify: `frontend/src/features/app/components/UserMenu.tsx`
- Delete: `frontend/src/infrastructure/api/repositories/announcement.repository.ts`
- Delete: `frontend/src/core/entities/announcement.entity.ts`
- Delete: `frontend/src/shared/ui/announcement/AnnouncementDetailModal.tsx`
- Delete: `frontend/src/shared/ui/announcement/AnnouncementDetailModal.module.scss`
- Modify: `frontend/src/shared/ui/announcement/AnnouncementCard.stories.tsx`
- Modify: `frontend/src/shared/ui/announcement/index.ts`
- Modify: `frontend/src/i18n/locales/en/admin.json`
- Modify: `frontend/src/i18n/locales/ja/admin.json`
- Modify: `frontend/src/i18n/locales/ko/admin.json`
- Modify: `frontend/src/i18n/locales/zh-TW/admin.json`
- Modify: four `common.json` files if `header.announcements` becomes unused.

- [ ] **Step 1: 寫可由舊 DB 與 fresh DB 重複執行的 core migration**

  `0001_drop_global_announcements.py` 不建立 model state，只執行：

  ```python
  migrations.RunSQL(
      sql="DROP TABLE IF EXISTS announcements_announcement",
      reverse_sql=migrations.RunSQL.noop,
  )
  ```

  Migration 無 app dependency；fresh DB 沒有該表時安全 no-op。反向 migration 不復原刻意刪除的產品資料。

- [ ] **Step 2: 先測 migration 能清掉既有表**

  在 `test_retired_product_routes.py` 加 transaction migration test：將 core migration migrate 到 zero、用 `schema_editor.execute` 建立最小 `announcements_announcement` 舊表、再 migrate 到 core leaf，確認表消失。同時確認 `classrooms_classroomannouncement` 與 `contest_announcements` 仍存在。

- [ ] **Step 3: 移除 backend app registration/runtime**

  從 `INSTALLED_APPS` 刪除 `apps.announcements`，從 `backend/config/urls.py` 刪除 `/api/v1/management/announcements/` include，刪除整個 app runtime/migrations/tests。不要改 classroom 或 contests models。

- [ ] **Step 4: 移除 frontend 管理入口**

  從 `adminRoutes` 刪除 lazy import 與 `/management/announcements` route；`/system/users` 和 drafts 保留。從 `UserMenu` 刪除公告管理入口，刪除 management screen 與 global announcement repository。

- [ ] **Step 5: 刪除 global entity 與未使用的 detail modal**

  `AnnouncementDetailModal` 目前只由 announcement barrel export，沒有保留 feature consumer；刪除 component/style 並從 `shared/ui/announcement/index.ts` 移除 export。`AnnouncementCard` 使用自己的 structural props 且由 contest clarifications 保留，因此保留 card/test/style；其 story 改用 component props 可接受的 inline fixture，不再 import global `Announcement` entity。刪除 `core/entities/announcement.entity.ts`。四語 admin/common 翻譯只刪除 global management 專用 key。

  ```bash
  rg -n 'core/entities/announcement|CreateAnnouncementRequest|UpdateAnnouncementRequest|announcement\.repository|AnnouncementDetailModal' frontend/src
  ```

  Expected: 無輸出；`AnnouncementCard` 與 `ContestClarifications` 仍存在。

- [ ] **Step 6: 執行 migration 與 route tests**

  ```bash
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest -q apps/core/tests/test_retired_product_routes.py apps/classrooms/tests apps/contests/tests/management/test_contest_viewset_actions.py
  ```

  Expected: global route/table 不存在，教室與考試公告測試仍 PASS。

- [ ] **Step 7: 明確 stage 並提交**

  ```bash
  git add -- backend/apps/announcements backend/apps/core/migrations backend/apps/core/tests/test_retired_product_routes.py backend/config/settings/base.py backend/config/urls.py frontend/src/core/entities/announcement.entity.ts frontend/src/features/admin/routes.tsx frontend/src/features/admin/screens/AnnouncementManagementScreen.tsx frontend/src/features/app/components/UserMenu.tsx frontend/src/infrastructure/api/repositories/announcement.repository.ts frontend/src/shared/ui/announcement/AnnouncementDetailModal.tsx frontend/src/shared/ui/announcement/AnnouncementDetailModal.module.scss frontend/src/shared/ui/announcement/AnnouncementCard.stories.tsx frontend/src/shared/ui/announcement/index.ts frontend/src/i18n/locales/en/admin.json frontend/src/i18n/locales/ja/admin.json frontend/src/i18n/locales/ko/admin.json frontend/src/i18n/locales/zh-TW/admin.json frontend/src/i18n/locales/en/common.json frontend/src/i18n/locales/ja/common.json frontend/src/i18n/locales/ko/common.json frontend/src/i18n/locales/zh-TW/common.json
  git commit -m "refactor: remove global announcements"
  ```

---

### Task 6: 更新 API schema、套用本地 migration 並做完整驗證

**Files:**

- Modify: `backend/schema.yml`

- [ ] **Step 1: 重新產生 committed OpenAPI schema**

  ```bash
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py spectacular --file schema.yml
  ```

  若 container 的 working directory 使輸出位於 `backend/schema.yml` 以外位置，先確認 compose workdir，再用同一 container command 指向 repository committed path；不要用手動全文取代 schema。

- [ ] **Step 2: 檢查 retired operations 已消失**

  ```bash
  rg -n '/api/v1/ai/usage|/api/v1/management/announcements|UsageView|AnnouncementViewSet' backend/schema.yml backend frontend/src
  ```

  Expected: runtime/schema 無輸出；migration 歷史中的舊字串可用 `--glob '!**/migrations/**'` 排除。

- [ ] **Step 3: 套用本地 dev DB migration**

  ```bash
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py migrate
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py showmigrations core
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py makemigrations --check --dry-run
  ```

  Expected: `core.0001_drop_global_announcements` 已套用，沒有未產生 migration。

- [ ] **Step 4: 跑 backend 與 frontend gates**

  ```bash
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest -q apps/ai/tests apps/core/tests apps/classrooms/tests apps/contests/tests
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run check:i18n
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run test -- --run
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run typecheck
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run build
  ```

- [ ] **Step 5: 最終 placeholder 與保留功能掃描**

  ```bash
  rg -n 'Ranking Page \(Coming Soon\)|features/changelog|AIUsagePanel|useProblemDiscussions|management/announcements' frontend/src backend --glob '!**/migrations/**'
  rg -n 'ClassroomAnnouncement|ContestAnnouncement|Clarification|ContestClarifications' backend/apps/classrooms backend/apps/contests frontend/src/features/classroom frontend/src/features/contest
  ```

  Expected: 第一條無輸出；第二條有保留功能引用。

- [ ] **Step 6: 自我審查與提交 schema**

  檢查 `git diff --check`、逐檔 `git diff --stat`，確認沒有刪到 contest/classroom announcements 或 AI service telemetry。然後只 stage schema 與本 task 尚未提交的測試：

  ```bash
  git add -- backend/schema.yml backend/apps/core/tests/test_retired_product_routes.py
  git commit -m "chore: refresh API schema after feature retirement"
  ```
