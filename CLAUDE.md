# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 開發指令

### Frontend (frontend/)
```bash
npm run dev          # 啟動開發伺服器 (Vite HMR)
npm run build        # 生產環境建置
npm run lint         # ESLint 檢查
npm run test         # 單元測試 (Vitest)
npm run test:e2e     # E2E 測試 (Playwright)
```

### Backend (backend/)
```bash
pip install -r requirements/dev.txt
python manage.py migrate
python manage.py runserver    # 啟動開發伺服器
pytest                        # 執行測試
pytest apps/<app>/ -v         # 測試特定 app
```

### Docker 開發環境
```bash
docker-compose -f docker-compose.dev.yml up
```

## 專案架構

### 技術棧
| 層級 | 技術 |
|------|------|
| Frontend | React 19, TypeScript, Carbon Design System, Vite |
| Backend | Django 4.2, Django REST Framework, Celery |
| Database | PostgreSQL 15, Redis 7 |
| Judge | Docker 容器隔離執行 |

### 目錄結構
- `frontend/src/features/` - 功能模組（auth, contest, problems, submissions 等）
- `frontend/src/shared/` - 共用元件與工具
- `frontend/src/core/` - 核心 hooks, context
- `frontend/src/infrastructure/` - API clients, 設定
- `backend/apps/` - Django 應用（users, problems, submissions, contests, judge 等）
- `backend/config/` - Django 設定

## Skills 參考

詳細開發規範請參考 `.claude/skills/`：

### qjudge-clean-arch-workflow
Clean Architecture 責任邊界與 lint 檢查。
- 架構邊界：`references/architecture-boundaries.md`
- 架構檢查：`node .claude/skills/qjudge-clean-arch-workflow/scripts/lint-architecture.js --root frontend/src`

### qjudge-pr-workflow
Git 分支與 PR 工作流程。
- 從 `dev` 建立 feature branch
- commit: `bash .claude/skills/qjudge-pr-workflow/scripts/commit-changes.sh "type: message"`
- PR: `bash .claude/skills/qjudge-pr-workflow/scripts/create-pr.sh --base dev --title "title"`

### QJudge-React-Carbon-Frontend-Architecture-And-Gated-Workflow
前端架構與 Gated 開發流程。
- **硬性約束**：禁止覆蓋 `.cds--*`/`.bx--*`，禁止 `!important`，Layout 用 Carbon Grid
- **Feature 路由**：每個 feature 需有 `routes.tsx`，使用 `Screen` 命名
- **Storybook 同步**：更新 UI 元件時必須同步更新 `.stories.tsx`
- Gate 切換需明確確認後才進行

### vercel-react-best-practices
React 效能優化指南（45 條規則）。
- 優先順序：Eliminating Waterfalls > Bundle Size > Server-Side > Client-Side > Re-render
- 詳見：`.claude/skills/vercel-react-best-practices/SKILL.md`
