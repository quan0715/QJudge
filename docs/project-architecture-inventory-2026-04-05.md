# QJudge 專案架構、API、部署與測試盤點（2026-04-05）

本文記錄**本次實際檢視過的檔案與目錄**導出的結論，並標註**證據來源**。這不是逐行審閱全儲存庫每一個檔案的結果；未打開的檔案不會被描述為「已審閱」。

---

## 1. 本次實際做到的事（方法與範圍）


| 項目        | 實際作法                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------ |
| 根目錄與入口文件  | 已讀 `README.md`、`CLAUDE.md`                                                                             |
| `/docs`   | 已列目錄（glob `docs/**/*.md`）；已讀 `developer-guide.md` 全文、`RUN_TESTS.md` 節選                                 |
| 部署與本地編排   | 已讀 `docker-compose.dev.yml` 前段（含 postgres / pgbouncer / redis / minio / ai-service 等）                  |
| CI/CD     | 已讀 `.github/workflows/ci.yml`（靜態檢查、前端單元、API 整合測試、後端單元、coverage、Judge 測試）與 `cd-prod.yml` 前段             |
| 後端路由與核心設定 | 已讀 `backend/config/urls.py`、`backend/config/settings/base.py`（含 `INSTALLED_APPS`、DB、`AUTH_USER_MODEL`） |
| 後端 App 結構 | 已列 `backend/apps/*/urls.py`、`backend/apps/*/models.py`；已列 `backend/apps/labs/` 僅 migrations            |
| 前端腳本與技術棧  | 已讀 `frontend/package.json` scripts 與依賴摘要                                                               |
| AI 服務檔案樹  | 已 glob `ai-service/**/*.py`                                                                            |
| 靜態搜尋      | 已 grep：`CORS`/`DEBUG`/`ALLOWED_HOSTS`、危險 API 樣本（`eval`/`pickle` 等）、`TODO`/`@deprecated`（節錄）            |


---

## 2. 儲存庫高階拓樸

- **Frontend**：`frontend/`（Vite + React 19 + Carbon；Vitest、Playwright、Storybook）
- **Backend**：`backend/`（Django 4.2、DRF、Daphne、Channels、Celery；OpenAPI 經 drf-spectacular）
- **AI Service**：`ai-service/`（FastAPI、DeepAgent/LangGraph 相關程式於 `services/`、`routers/chat.py`）
- **Judge**：`backend/judge/`（Docker 映像建置，供後端/Celery 透過 Docker socket 使用）
- **Compose**：根目錄 `docker-compose.yml`、`docker-compose.dev.yml`、`docker-compose.test.yml`、`docker-compose.monitoring.yml`、`loadtest/docker-compose.loadtest.yml`
- **使用者面相文件**：`frontend/public/docs/{en,ja,ko,zh-TW}/`（內建於前端靜態資源）
- **開發者/維運文件**：`docs/`（本目錄）、`backend/RUN_TESTS.md`

---

## 3. 後端 HTTP API 表面（DRF）

以下來自 `**backend/config/urls.py`** 的實際註冊（前綴均相對於後端 host）：


| 路徑前綴                                                       | 包含模組                                             |
| ---------------------------------------------------------- | ------------------------------------------------ |
| `django-admin/`                                            | Django Admin                                     |
| `api/v1/auth/`                                             | `apps.users`                                     |
| `api/v1/markdown/`                                         | `apps.core`                                      |
| `api/v1/management/problems/`                              | `apps.problems`（namespace `management-problems`） |
| `api/v1/problems/`                                         | `apps.problems`                                  |
| `api/v1/submissions/`                                      | `apps.submissions`                               |
| `api/v1/contests/`                                         | `apps.contests`                                  |
| `api/v1/classrooms/`                                       | `apps.classrooms`                                |
| `api/v1/question-banks/`                                   | `apps.question_bank`                             |
| `api/v1/question-bank-items/`                              | `apps.question_bank.item_urls`                   |
| `api/v1/management/announcements/`                         | `apps.announcements`                             |
| `api/v1/ai/`                                               | `apps.ai`                                        |
| `api/v1/subscriptions/`                                    | `apps.subscriptions`                             |
| `api/v1/users/me/api-key`（及 validate/usage）                | `apps.users.views` 直接掛載                          |
| `api/schema/`、`api/schema/swagger-ui/`、`api/schema/redoc/` | OpenAPI（非 DEBUG 時 schema 視圖帶 `IsAdminUser`）      |


細部 endpoint 以執行中環境的 **OpenAPI**（`/api/schema/`）或各 app 的 `urls.py` 為準。

---

## 4. Django「資料模型」位置（程式層）

具備 `**models.py`** 的本地 apps（glob 結果）：

- `apps.announcements`
- `apps.ai`
- `apps.classrooms`
- `apps.contests`
- `apps.problems`
- `apps.question_bank`
- `apps.submissions`
- `apps.subscriptions`
- `apps.users`

`**apps.labs**`：設於 `INSTALLED_APPS` 但註解說明為 *migration stub*；目錄內僅 `migrations/` 與 `apps.py`，**無 `models.py*`*（與 `0003_delete_legacy_lab_models.py` 一致，表示舊 Lab 已遷移/刪除）。

自訂使用者：`**AUTH_USER_MODEL = "users.User"**`（`base.py`）。

---

## 5. 前端架構（與文件慣例）

- **功能模組**：`frontend/src/features/`（`CLAUDE.md`）
- **API / mapper**：`frontend/src/infrastructure/`
- **共享 UI / mocks**：`frontend/src/shared/`，Storybook mocks 於 `frontend/src/shared/mocks/`
- **測試**：`npm run test` / `test:coverage`（Vitest）、`test:api`（獨立設定檔）、`test:e2e`（Playwright + `playwright.config.e2e.ts`）
- **內建說明文件站台**：`npm run build:docs` / `check:docs`（`package.json`）

---

## 6. 本地與測試用 Docker Compose（dev）

`docker-compose.dev.yml` 本次讀到的服務包含：

- **judge-image**：建置 `oj-judge:latest`
- **postgres**：15-alpine，掛載 `scripts/init_db.sql`
- **pgbouncer**：session mode，對應 Django `CONN_MAX_AGE=0` 的設計（見 `base.py` 註解）
- **redis**：Celery 用
- **minio**：S3 相容儲存（anti-cheat / 物件儲存相關 env 見 `README.md`）
- **ai-service**：埠 **8001**（後續行未全文展開，但以 `README.md` 一致）

**測試堆疊**：CI 使用 `**docker-compose.test.yml`** 啟動 `backend-test`、`frontend-test` 等，再於容器內執行 `npm run test:api`。

---

## 7. CI/CD 摘要（`main` / PR）

觸發條件與路徑篩選見 `**/.github/workflows/ci.yml**`（`frontend/**`、`backend/**`、`docker-compose.test.yml` 等）。


| Job                        | 內容（依檔案）                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `static-checks`            | `npm ci`、`i18n_check.py`、`tsc --noEmit`、`npm run build`（frontend）                              |
| `frontend-unit`            | `npm run lint`、`npm run test:coverage`                                                         |
| `frontend-api-integration` | compose test stack → 等待 backend → `docker compose exec frontend-test npm run test:api`         |
| `backend-unit`             | Postgres + Redis service、`migrate`、`pytest`（ignore judge 與某效能測試）；另 job 內 `--cov-fail-under=80` |
| `judge`                    | 建置 judge 映像並跑 judge 相關測試（`JUDGE_ENGINE_ENABLED=true`）                                          |


**Production CD**：`**cd-prod.yml`** — 於 CI 成功後（或手動 dispatch）、经 Tailscale GitHub Action 連線，上傳 deploy 腳本至 `PROD_SSH_HOST`（細節未全文讀取）。

---

## 8. 安全與設定風險（基於已讀程式碼）

以下皆為**靜態檢視結論**，未執行滲透測試。


| 議題                | 證據與說明                                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 預設 `SECRET_KEY`   | `backend/config/settings/base.py`：`os.getenv("SECRET_KEY", "django-insecure-default-key-change-in-production")`。生產環境**必須**以環境變數覆寫。 |
| 開發環境寬鬆 CORS       | `backend/config/settings/dev.py`（grep）：`CORS_ALLOW_ALL_ORIGINS = True`。僅限 dev 設定；生產應依 `README.md` 使用明確來源。                          |
| OpenAPI 暴露面       | `urls.py`：當 `not settings.DEBUG` 時 schema 視圖使用 `IsAdminUser`，可降低公開環境的 schema 洩漏。                                                   |
| 測試用 ALLOWED_HOSTS | `config/settings/test.py`（grep）：`ALLOWED_HOSTS = ['*']` — 僅測試設定之預期寬鬆，勿誤用於 production。                                              |
| 使用者上傳程式碼          | 平台本質需執行使用者程式；風險緩解依賴 **Judge 隔離**與資源限制（需持續審視 `backend/judge` 與送出流程）。                                                                |


---

## 9. 技術債、閒置與「舊程式碼」線索


| 類型                           | 證據                                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **保留僅遷移的 app**               | `INSTALLED_APPS` 註解 + `apps/labs` 僅 migrations                                                                       |
| **Schema / 程式標示 deprecated** | 例如 `contests` migration 中 `verbose_name="... (deprecated)"`；前端 `gradingTypes.ts`、`problem.entity.ts` 等 `@deprecated` |
| **未完成項 TODO**                | grep 節錄：`users/services.py` 寄信、`ContestClarifications` 按讚後端、AI `validation_issues` 等                                 |
| **工作目錄未提交變更**                | 對話開始時的 `git status` 顯示多檔修改與刪除（例如 `ExamEventStats.tsx` 等）；**是否為冗餘需由團隊在合併前確認**，本文不判定業務上「應刪」                            |


---

## 10. 建議的後續行動（優先順序不拘）

1. **文件**：將本檔列為架構單一入口；細部 API 契約可持續以 OpenAPI + `docs/archive/` 補充。
2. **安全**：在 prod 部署檢查清單中明列「無預設 SECRET_KEY / MinIO 預設帳密」；定期稽核 `dev.py` 不流入 production。
3. **閒置程式**：評估是否能從 `INSTALLED_APPS` 移除 `apps.labs`（需確認無未套用 migration 之環境）。
4. **靜態品質**：對 `@deprecated` 與 TODO  hotspots 建 backlog，避免型別/行為分裂。
5. **完整 code review**：若需「逐檔」審計，建議搭配 `bandit`、`pip-audit`/`npm audit`、與 CI 中既有的 lint/coverage 報告分模組排程。

---

## 11. 相關連結（repo 內）

- `README.md` — 環境變數、部署流程總覽
- `docs/developer-guide.md` — 開發規範與維護流程
- `backend/RUN_TESTS.md` — Docker exec 跑 pytest 的建議參數
- `docs/monitoring.md`、`docs/loadtest.md`、`docs/i18n.md` — 維運與國際化