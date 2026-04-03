# QJudge 開發者指南

本手冊提供 QJudge 系統架構、開發流程與維護說明。

---

## 1. 系統架構 (Architecture)

QJudge 採用微服務化的單體架構，主要由以下模組組成：

| 服務 | 職責 | 技術棧 |
| --- | --- | --- |
| **Frontend** | 使用者介面、解題環境、監考 Dashboard | React 19, Carbon Design System, Vite |
| **Backend** | 業務邏輯、API、權限管理、評測排程 | Django 4.2, DRF, Celery |
| **AI Service** | AI 助教核心、SSE 事件轉接 | FastAPI, LangGraph |
| **Judge** | 程式碼安全隔離執行 | Docker, Python |
| **Store** | 資料庫與快取 | PostgreSQL 15, Redis 7, MinIO |

---

## 2. 開發環境設定 (Environment Setup)

### 2.1 快速啟動
推薦使用 Docker Compose 進行開發：
```bash
docker compose -f docker-compose.dev.yml up -d --build
```

### 2.2 前端開發
```bash
cd frontend
npm install
npm run dev
```

### 2.3 後端開發
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

---

## 3. 開發規範 (Coding Standards)

- **分支管理**：主開發分支為 `dev`，功能完成後 merge 至 `main`。
- **Commit Message**：採用 Conventional Commits 格式（例如：`feat: add classroom module`）。
- **多國語系 (i18n)**：前端新增文案時，請優先修改 `frontend/src/i18n/locales/zh-TW/` 並執行 `npm run sync:i18n`。
- **UI 元件**：優先使用 Carbon Design System 元件，自訂元件需提供 Storybook。

---

## 4. 測試與驗證 (Testing)

### 4.1 後端測試
執行所有測試：
```bash
cd backend
pytest
```
特定模組測試：
```bash
pytest apps/classrooms/tests/
```

### 4.2 前端測試
```bash
cd frontend
npm run test:api
```

### 4.3 壓力測試
詳細說明請參閱 `docs/loadtest.md`。

---

## 5. 維護與部署 (Maintenance)

### 5.1 資料庫遷移 (Migrations)
後端 Model 修改後，請務必建立 migration 檔案：
```bash
python manage.py makemigrations
python manage.py migrate
```

### 5.2 監控系統
QJudge 使用 Prometheus + Grafana 監控系統狀態。
- 啟動監控：`docker compose -f docker-compose.monitoring.yml up -d`
- 詳細說明請參閱 `docs/monitoring.md`。

### 5.3 文件維護
- **README.md**：存放快速入門與環境變數說明。
- **docs/**：存放功能細節、API 契約與運維手冊。
- **CLAUDE.md**：存放開發備忘與專案協作指南。

---

## 7. 文件維護規範

為了確保手冊內容與程式碼保持同步，請遵守以下規範：

- **新功能開發**：在開發新功能（如新的題型、教室設定）時，請同步更新 `docs/user-guide.md`。
- **架構調整**：若變動了專案結構或服務組建，請同步更新 `docs/developer-guide.md`。
- **遺留文件處理**：過時的設計計畫或過渡期的 API 契約應移至 `docs/archive/`。
- **i18n**：新增前端文案時，務必執行 `npm run sync:i18n` 並檢查翻譯覆蓋率。
