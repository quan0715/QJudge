# CodingProblem 內容欄位退役

**Date:** 2026-04-12
**Status:** Approved

---

## 目標

讓 CodingProblem 回歸純粹的 execution adapter，所有內容欄位由 QuestionAsset 管理。消除雙寫和同步機制。

## 刪除項目

### Model 欄位
- `CodingProblem.title` — 改讀 `QuestionAsset.title`
- `CodingProblem.difficulty` — 改讀 `QuestionAsset.payload["difficulty"]`

### Model 類
- `ProblemTranslation` — 整個刪除，translations 由 `QuestionAsset.payload["translations"]` 管理

### 函數
- `sync_problem_question_asset()` — 不再需要 CodingProblem → QuestionAsset 同步
- `sync_asset_to_problem()` — 不再需要 QuestionAsset → CodingProblem 同步

### Properties
- `CodingProblem.effective_title` — 刪除，直接讀 `question_asset.title`
- `CodingProblem.effective_difficulty` — 刪除，直接讀 `question_asset.payload`
- `CodingProblem.effective_owner` — 刪除，直接讀 `question_asset.owner`

## 保留項目（CodingProblem）

- `slug` — URL routing
- `time_limit`, `memory_limit` — Judge 讀取
- `forbidden_keywords`, `required_keywords` — 提交驗證
- `test_cases` FK (TestCase model) — Judge 讀取
- `language_configs` FK (LanguageConfig model) — 前端讀取
- `tags` M2M — 分類
- Stats 欄位 — submission_count, accepted_count 等
- `created_by` — 建立者
- `question_asset`, `question_version` FK — 連結到內容層
- `order` — 排序

## 寫入路徑

API contract 不變。View 層做 orchestration：

```
API 收到 {title, difficulty, translations, time_limit, test_cases, ...}
  ↓
View 拆分：
  1. 建/更新 QuestionAsset（title, difficulty, translations → payload）
  2. 建/更新 CodingProblem（slug, time_limit, memory_limit）+ TestCase + LanguageConfig
  3. 連結 question_asset FK
```

涉及的 View 寫入路徑：
- `ContestProblemViewSet.create` — 競賽中建新題
- `ProblemViewSet.create / update` — 獨立題目管理（前端 management 端點）
- `ProblemService.create_problem_adapter / update_problem_adapter` — Service 層
- `contest_problem_service.materialize_problem_from_bank_question` — 題庫匯入

## 讀取路徑

- 內容（title, difficulty, translations）→ QuestionAsset
- 執行（time_limit, test_cases, language_configs）→ CodingProblem
- Serializer 組合兩邊資料，API response shape 不變

涉及的 Serializer：
- `ProblemListSerializer` — title, difficulty 改讀 QuestionAsset
- `ProblemDetailSerializer` — 同上 + translations 改讀 QuestionAsset.payload
- `ProblemAdminSerializer` — 寫入拆分到 View 層，讀取同上
- `ContestProblemSerializer` — 已從 binding 讀，需確認 title/difficulty 來源

## 不影響

- **Judge** — 讀 CodingProblem.test_cases + time_limit + memory_limit，不變
- **Frontend** — API response shape 不變
- **MCP** — 打 View 層 API，不變

## Migration

- 刪除 `CodingProblem.title`, `CodingProblem.difficulty` 欄位
- 刪除 `ProblemTranslation` table
- 確保所有現有 CodingProblem 都有對應的 QuestionAsset（已由 backfill 保證）
