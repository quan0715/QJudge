> 文件狀態：2026-02-24，建議僅使用 `docker-compose.dev.yml`

## 1. 前置需求

- Docker Desktop（含 Compose）
- Git
- Node.js 20+（僅在需要本機跑前端工具時）
- Python 3.11+（僅在需要本機跑後端工具時）

## 2. 啟動完整開發環境

```bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d --build
```

檢查服務狀態：

```bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev ps
./scripts/dev/check-dev-services.sh
```

預設入口：

- Frontend: `http://localhost:5173`
- Storybook: `http://localhost:6006`
- Backend: `http://localhost:8000`
- AI Service: `http://localhost:8001`
- 前端中的 Storybook 按鈕：`http://localhost:5173/dev/storybook/`

AI 健康檢查：

```bash
curl http://localhost:8001/health
```

## 3. 常用開發命令

### 3.1 查看日誌

```bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev logs -f backend
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev logs -f ai-service
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev logs -f frontend
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev logs -f storybook
```

### 3.2 後端測試（推薦設定）

```bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend \
  env DJANGO_SETTINGS_MODULE=config.settings.test \
  DATABASE_URL=postgresql://postgres:postgres@postgres:5432/online_judge \
  PYTEST_ADDOPTS='--no-cov' \
  pytest apps/ai/tests/test_session_creation.py::AISessionCreationTest::test_session_model_with_pk -q
```

### 3.3 前端 API 測試

```bash
cd frontend
API_BASE_URL=http://localhost:8000 npm run test:api
```

## 4. 目前已知限制

- Storybook 由 dev compose 內的獨立 `storybook` service 提供；若要除錯請查看 `storybook` logs，而不是只看 `frontend`。
- frontend 全量 `npm run build` 仍受既有 contest/storybook 型別錯誤影響。
- backend 若使用 `config.settings.dev` 跑測試，可能誤連非本機資料庫。
- `test:api` 依賴本機測試帳號與種子資料。
