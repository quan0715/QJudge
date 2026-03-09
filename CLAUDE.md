# 專案協作備忘（QJudge）

本文件提供在本專案協作時的快速上下文，內容已對齊 `ta-agent` 分支現狀。

## 目前狀態摘要

- 主要工作分支：`dev`
- ta-agent PR（#51）：已於 2026-02-24 merge 至 main
- AI 助教流程：已切換為 DeepAgent（LangGraph）架構，HMAC 保護內部端點已上線
- SSE 串流：前後端事件流已可完整傳遞與保存 metadata

## 常用命令

### Docker 開發環境（推薦）

```bash
docker compose -f docker-compose.dev.yml up -d --build
docker compose -f docker-compose.dev.yml ps
```

### Frontend

```bash
cd frontend
npm run dev
npm run lint
npm run test:api
```

### Backend

```bash
cd backend
python manage.py runserver
pytest
```

## 測試執行原則（重點）

- backend 測試建議用 `config.settings.test` + 明確 `DATABASE_URL` 指向 docker postgres
- 若僅做功能驗證，先用 `PYTEST_ADDOPTS='--no-cov'`，避免 coverage gate 造成噪音
- frontend `test:api` 依賴本地授權測試帳號/種子資料，失敗時先確認測試資料而非直接判定程式壞掉

## 專案路徑重點

- `frontend/src/features/`：主要業務模組（chatbot/contest/problems/auth 等）
- `frontend/src/infrastructure/`：API repository 與 mapper
- `backend/apps/ai/`：AI session、串流、內部動作與核准流程
- `ai-service/`：DeepAgent runner、工具註冊、SSE 事件轉接

## 技能（Skills）路徑

本專案技能位於 `.codex/skills/`，不是 `.claude/skills/`。

常用：

- `.codex/skills/qjudge-clean-arch-workflow/`
- `.codex/skills/qjudge-pr-workflow/`
- `.codex/skills/vercel-react-best-practices/`
