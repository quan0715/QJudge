# QJudge 部署與測試文件

> **版本**: 1.0  
> **最後更新**: 2025-12-10

## 目錄

- [1. 部署指南](#1-部署指南)
- [2. 測試策略](#2-測試策略)
- [3. CI/CD 流程](#3-cicd-流程)
- [4. 監控與維護](#4-監控與維護)

---

## 1. 部署指南

### 1.1 環境需求

**硬體需求** (最低配置):
- CPU: 2 核心
- RAM: 4GB
- 硬碟: 20GB SSD
- 網路: 100Mbps

**軟體需求**:
- Docker: 24.0+
- Docker Compose: 2.20+
- Git: 2.40+

### 1.2 開發環境部署

#### 1.2.1 快速啟動

```bash
# 1. Clone 專案
git clone <repository-url>
cd qjudge

# 2. 複製環境變數
cp .env.example .env
# 編輯 .env 設定資料庫密碼等

# 3. 啟動開發環境
docker-compose -f docker-compose.dev.yml up -d

# 4. 建立超級使用者
docker exec -it oj_backend_dev python manage.py createsuperuser

# 5. 訪問應用
# 前端: http://localhost:5173
# 後端: http://localhost:8000
# Admin: http://localhost:8000/django-admin
```

#### 1.2.2 本地開發（不使用 Docker）

**後端**:
```bash
cd backend

# 建立虛擬環境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安裝依賴
pip install -r requirements/dev.txt

# 設定環境變數
export DJANGO_SETTINGS_MODULE=config.settings.dev
export DB_HOST=localhost
export DB_NAME=online_judge
export DB_USER=postgres
export DB_PASSWORD=postgres
export REDIS_URL=redis://localhost:6379/0

# 執行遷移
python manage.py migrate

# 建立超級使用者
python manage.py createsuperuser

# 啟動開發伺服器
python manage.py runserver
```

**前端**:
```bash
cd frontend

# 安裝依賴
npm install

# 啟動開發伺服器
npm run dev
```

**Celery Worker**:
```bash
cd backend
celery -A config worker -l info
```

**Celery Beat**:
```bash
cd backend
celery -A config beat -l info
```

### 1.3 生產環境部署

#### 1.3.1 使用 Docker Compose

```bash
# 1. 準備環境變數
cp .env.example .env
nano .env  # 編輯生產環境設定

# 重要設定:
# - SECRET_KEY: 生成強隨機密鑰
# - DEBUG=False
# - ALLOWED_HOSTS: 你的域名
# - DB_PASSWORD: 強密碼
# - CLOUD_DB_* : Supabase 設定
# - TUNNEL_TOKEN: Cloudflare Tunnel Token

# 2. 建立必要目錄
mkdir -p logs

# 3. 建立 Judge Image
docker build -t oj-judge:latest -f backend/judge/Dockerfile.judge backend/judge

# 4. 啟動服務
docker-compose up -d

# 5. 執行遷移
docker exec -it oj_backend python manage.py migrate

# 6. 收集靜態檔案
docker exec -it oj_backend python manage.py collectstatic --noinput

# 7. 建立超級使用者
docker exec -it oj_backend python manage.py createsuperuser

# 8. 檢查服務狀態
docker-compose ps
docker-compose logs -f
```

#### 1.3.2 Cloudflare Tunnel 設定

```bash
# 1. 安裝 cloudflared
# 參考: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/

# 2. 登入 Cloudflare
cloudflared tunnel login

# 3. 建立 Tunnel
cloudflared tunnel create qjudge

# 4. 設定 DNS
cloudflared tunnel route dns qjudge nycu-coding-lab.quan.wtf

# 5. 取得 Token
cloudflared tunnel token qjudge

# 6. 將 Token 加入 .env
TUNNEL_TOKEN=<your-token>

# 7. 啟動 Tunnel (已包含在 docker-compose.yml)
docker-compose up -d cloudflared
```

#### 1.3.3 Nginx 反向代理（可選）

如果不使用 Cloudflare Tunnel，可以使用 Nginx：

```nginx
# /etc/nginx/sites-available/qjudge

server {
    listen 80;
    server_name nycu-coding-lab.quan.wtf;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name nycu-coding-lab.quan.wtf;
    
    # SSL 證書
    ssl_certificate /etc/letsencrypt/live/nycu-coding-lab.quan.wtf/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nycu-coding-lab.quan.wtf/privkey.pem;
    
    # 前端
    location / {
        proxy_pass http://localhost:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # 後端 API
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Django Admin
    location /django-admin/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # 靜態檔案
    location /static/ {
        alias /path/to/qjudge/backend/staticfiles/;
    }
    
    location /media/ {
        alias /path/to/qjudge/backend/media/;
    }
}
```

### 1.4 環境變數說明

**必要設定**:
```bash
# Django
SECRET_KEY=<strong-random-key>
DEBUG=False
DJANGO_SETTINGS_MODULE=config.settings.prod
ALLOWED_HOSTS=your-domain.com,localhost

# Database (Local)
DB_NAME=online_judge
DB_USER=postgres
DB_PASSWORD=<strong-password>
DB_HOST=postgres
DB_PORT=5432

# Database (Cloud - Supabase)
CLOUD_DB_NAME=postgres
CLOUD_DB_USER=postgres.xxx
CLOUD_DB_PASSWORD=<supabase-password>
CLOUD_DB_HOST=xxx.supabase.co
CLOUD_DB_PORT=6543  # Transaction Mode Pooler
CLOUD_DB_CONN_MAX_AGE=0

# Redis
REDIS_URL=redis://redis:6379/0

# NYCU OAuth (可選)
NYCU_OAUTH_CLIENT_ID=<client-id>
NYCU_OAUTH_CLIENT_SECRET=<client-secret>

# Frontend
FRONTEND_URL=https://your-domain.com

# Judge Engine
JUDGE_ENGINE_ENABLED=True
JUDGE_MAX_CPU_TIME=10
JUDGE_MAX_MEMORY=256
DOCKER_IMAGE_JUDGE=oj-judge:latest

# Cloudflare Tunnel
TUNNEL_TOKEN=<cloudflare-tunnel-token>
```

### 1.5 資料庫遷移策略

#### 1.5.1 初次部署

```bash
# 1. 執行遷移
docker exec -it oj_backend python manage.py migrate

# 2. 建立測試資料（可選，開發用）
docker exec -it oj_backend python manage.py create_test_data

# 3. 匯入題目（可選）
docker exec -it oj_backend python manage.py loaddata fixtures/problems.json
```

#### 1.5.2 更新部署

```bash
# 1. 備份資料庫
docker exec oj_postgres pg_dump -U postgres online_judge > backup_$(date +%Y%m%d).sql

# 2. 拉取最新程式碼
git pull origin main

# 3. 重新建置 Image
docker-compose build

# 4. 執行遷移
docker exec -it oj_backend python manage.py migrate

# 5. 收集靜態檔案
docker exec -it oj_backend python manage.py collectstatic --noinput

# 6. 重啟服務
docker-compose restart backend celery celery-beat frontend
```

### 1.6 擴展部署

#### 1.6.1 多 Worker 配置

修改 `docker-compose.yml`:

```yaml
celery:
  # ... existing config
  deploy:
    replicas: 3  # 3 個 worker
```

或手動啟動多個 Worker:

```bash
docker-compose up -d --scale celery=3
```

#### 1.6.2 負載平衡

使用 Nginx upstream:

```nginx
upstream backend_servers {
    server backend1:8000;
    server backend2:8000;
    server backend3:8000;
}

server {
    location /api/ {
        proxy_pass http://backend_servers;
    }
}
```

---

## 2. 測試策略

### 2.1 測試架構

```
tests/
├── backend/
│   ├── unit/           # 單元測試
│   ├── integration/    # 整合測試
│   └── e2e/            # E2E 測試
└── frontend/
    ├── unit/           # 單元測試
    ├── integration/    # 整合測試
    └── e2e/            # E2E 測試（Playwright）
```

### 2.2 後端測試

#### 2.2.1 單元測試（pytest）

**配置**: `backend/pytest.ini`

```bash
# 執行所有測試
cd backend
pytest

# 執行特定測試
pytest apps/users/tests/

# 顯示覆蓋率
pytest --cov=apps --cov-report=html

# 詳細輸出
pytest -v

# 僅測試失敗的
pytest --lf
```

**目標覆蓋率**: 80%

**測試範圍**:
- ✅ Users (認證、角色管理)
- ✅ Problems (CRUD、權限)
- ✅ Submissions (評測流程)
- ✅ Contests (競賽邏輯、考試模式)
- ✅ Judge (Docker 執行、安全性)

#### 2.2.2 Judge 測試

```bash
# 執行 Judge 測試
cd backend
python manage.py test apps.judge --verbosity=2

# 測試多語言支援
python manage.py test apps.judge.test_multilang

# 測試安全性
python manage.py test apps.judge.CppJudgeTestCase.test_fork_bomb_protection
```

**測試案例**:
- AC (Accepted): 正確答案
- WA (Wrong Answer): 答案錯誤
- TLE (Time Limit Exceeded): 超時
- MLE (Memory Limit Exceeded): 記憶體超限
- RE (Runtime Error): 執行錯誤
- CE (Compilation Error): 編譯錯誤
- SE (System Error): 系統錯誤

#### 2.2.3 測試環境

使用 `docker-compose.test.yml`:

```bash
# 啟動測試環境
docker-compose -f docker-compose.test.yml up -d

# 執行測試
docker exec -it oj_backend_test pytest

# 停止測試環境
docker-compose -f docker-compose.test.yml down -v
```

### 2.3 前端測試

#### 2.3.1 E2E 測試（Playwright）

**配置**: `frontend/playwright.config.e2e.ts`

```bash
cd frontend

# 安裝 Playwright
npx playwright install

# 執行 E2E 測試
npm run test:e2e

# UI 模式
npm run test:e2e:ui

# Debug 模式
npm run test:e2e:debug

# 指定瀏覽器
npm run test:e2e -- --project=chromium

# 顯示報告
npm run test:e2e:report
```

**測試範圍**:
- ✅ 認證流程（登入、註冊）
- ✅ 題目瀏覽與提交
- ✅ 競賽參與流程
- ✅ 考試模式防作弊

**測試檔案**:
- `tests/e2e/auth.e2e.spec.ts`
- `tests/e2e/problems.e2e.spec.ts`
- `tests/e2e/contest.e2e.spec.ts`
- `tests/e2e/submission.e2e.spec.ts`

#### 2.3.2 測試資料設置

```bash
# 設置 E2E 測試資料
cd backend
python manage.py seed_e2e_data
```

這會建立:
- 測試使用者（student, teacher, admin）
- 測試題目
- 測試競賽

### 2.4 效能測試

#### 2.4.1 負載測試（計劃中）

使用 Locust 進行負載測試:

```python
# locustfile.py
from locust import HttpUser, task, between

class WebsiteUser(HttpUser):
    wait_time = between(1, 3)
    
    @task
    def view_problems(self):
        self.client.get("/api/v1/problems/")
    
    @task
    def view_problem_detail(self):
        self.client.get("/api/v1/problems/1/")
    
    @task
    def submit_code(self):
        self.client.post("/api/v1/submissions/", json={
            "problem": 1,
            "language": "cpp",
            "code": "..."
        })
```

```bash
# 執行負載測試
locust -f locustfile.py --host=http://localhost:8000
```

#### 2.4.2 提交 API 效能測試

```bash
cd backend
python scripts/analyze_submission_queries.py
```

這會分析:
- 提交列表查詢效能
- 索引使用情況
- N+1 查詢問題

---

## 3. CI/CD 流程

### 3.1 GitHub Actions

#### 3.1.1 後端測試 Workflow

**檔案**: `.github/workflows/backend-tests.yml`

**觸發條件**:
- Push to `main` or `develop`
- Pull Request to `main` or `develop`
- 變更 `backend/**`

**步驟**:
1. ✅ Checkout 程式碼
2. ✅ 設置 Python 3.11
3. ✅ 啟動 PostgreSQL & Redis services
4. ✅ 安裝 dependencies
5. ✅ 建立 Judge Docker Image
6. ✅ 執行資料庫遷移
7. ✅ 執行 pytest（覆蓋率 80%+）
8. ✅ 上傳測試報告

#### 3.1.2 Judge 測試 Workflow

**檔案**: `.github/workflows/judge-tests.yml`

**觸發條件**:
- Push to `main` or `develop`
- 變更 `backend/apps/judge/**`

**步驟**:
1. ✅ 建立 Judge Image
2. ✅ 執行 Judge 單元測試
3. ✅ 執行多語言測試
4. ✅ 生成覆蓋率報告
5. ✅ 上傳到 Codecov

#### 3.1.3 前端 E2E 測試 (計劃中)

**檔案**: `.github/workflows/frontend-e2e.yml`

**觸發條件**:
- Push to `main`
- Pull Request to `main`
- 變更 `frontend/**`

**步驟**:
1. Checkout 程式碼
2. 啟動測試環境 (docker-compose.test.yml)
3. 安裝 Playwright
4. 執行 E2E 測試
5. 上傳測試報告與截圖

### 3.2 手動測試檢查清單

#### 3.2.1 功能測試

**認證系統**:
- [ ] Email 註冊與登入
- [ ] NYCU OAuth 登入
- [ ] Token 刷新
- [ ] 密碼重設

**題目系統**:
- [ ] 瀏覽題目列表
- [ ] 查看題目詳情
- [ ] 建立題目（Teacher）
- [ ] 編輯題目（Teacher）
- [ ] 批量導入題目（YAML）

**提交系統**:
- [ ] 提交程式碼（C++）
- [ ] 查看提交歷史
- [ ] 查看評測結果
- [ ] 測試執行

**競賽系統**:
- [ ] 建立競賽（Teacher）
- [ ] 註冊競賽（密碼保護）
- [ ] 開始考試
- [ ] 提交程式碼
- [ ] 查看排行榜
- [ ] 考試模式防作弊
- [ ] 結束考試（交卷）

#### 3.2.2 安全測試

**權限控制**:
- [ ] Student 無法建立題目
- [ ] Student 無法管理競賽
- [ ] Teacher 無法查看其他 Teacher 的私密競賽
- [ ] Admin 可以管理所有資源

**資料驗證**:
- [ ] SQL 注入防護
- [ ] XSS 防護
- [ ] CSRF 防護
- [ ] 檔案上傳驗證

**評測安全**:
- [ ] Fork bomb 防護
- [ ] 網路隔離
- [ ] 檔案系統限制
- [ ] 資源限制（CPU、記憶體）

---

## 4. 監控與維護

### 4.1 日誌管理

#### 4.1.1 查看日誌

```bash
# 查看所有服務日誌
docker-compose logs -f

# 查看特定服務日誌
docker-compose logs -f backend
docker-compose logs -f celery

# 查看最近 100 行
docker-compose logs --tail=100 backend

# 查看特定時間範圍
docker-compose logs --since="2025-12-10T10:00:00"
```

#### 4.1.2 日誌位置

**開發環境**: Console 輸出

**生產環境**:
```
backend/logs/
├── django.log
├── celery_worker.log
└── celery_beat.log
```

#### 4.1.3 日誌輪轉

使用 Python RotatingFileHandler（15MB per file, 10 backups）

```python
# config/settings/prod.py
LOGGING = {
    'handlers': {
        'file': {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': 'logs/django.log',
            'maxBytes': 1024 * 1024 * 15,  # 15MB
            'backupCount': 10,
        },
    },
}
```

### 4.2 健康檢查

#### 4.2.1 服務健康檢查

```bash
# PostgreSQL
docker exec oj_postgres pg_isready -U postgres

# Redis
docker exec oj_redis redis-cli ping

# Backend
curl http://localhost:8000/api/v1/

# Celery Worker
docker exec oj_celery celery -A config inspect ping
```

#### 4.2.2 Docker Compose Health Checks

```yaml
postgres:
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U postgres"]
    interval: 10s
    timeout: 5s
    retries: 5

redis:
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 5s
    retries: 5
```

### 4.3 備份策略

#### 4.3.1 自動備份（Celery Beat）

每 6 小時執行一次雲端到本地備份:

```python
# apps/core/tasks.py
@shared_task
def backup_cloud_to_local():
    """Backup cloud database to local"""
    # ... implementation
```

#### 4.3.2 手動備份

```bash
# 備份資料庫
docker exec oj_postgres pg_dump -U postgres online_judge > backup_$(date +%Y%m%d_%H%M%S).sql

# 備份媒體檔案
tar -czf media_backup_$(date +%Y%m%d).tar.gz backend/media/

# 備份程式碼
git archive --format=tar.gz -o qjudge_$(date +%Y%m%d).tar.gz HEAD
```

#### 4.3.3 還原備份

```bash
# 還原資料庫
docker exec -i oj_postgres psql -U postgres online_judge < backup.sql

# 還原媒體檔案
tar -xzf media_backup.tar.gz -C backend/
```

### 4.4 效能監控

#### 4.4.1 資料庫效能

```sql
-- 查詢慢查詢
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE mean_exec_time > 1000  -- 超過 1 秒
ORDER BY mean_exec_time DESC
LIMIT 10;

-- 查詢索引使用情況
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

#### 4.4.2 應用效能

使用 Django Debug Toolbar（開發環境）:

```python
# config/settings/dev.py
INSTALLED_APPS += ['debug_toolbar']
MIDDLEWARE.insert(0, 'debug_toolbar.middleware.DebugToolbarMiddleware')
```

#### 4.4.3 Celery 監控

```bash
# 查看 Worker 狀態
docker exec oj_celery celery -A config inspect active

# 查看排隊任務
docker exec oj_celery celery -A config inspect reserved

# 查看統計資料
docker exec oj_celery celery -A config inspect stats
```

使用 Flower（可選）:

```bash
pip install flower
celery -A config flower
# 訪問 http://localhost:5555
```

### 4.5 常見問題排查

#### 4.5.1 資料庫連線問題

```bash
# 檢查資料庫是否啟動
docker ps | grep postgres

# 檢查連線設定
docker exec oj_backend python manage.py dbshell

# 檢查連線池
docker exec oj_backend python manage.py shell
>>> from django.db import connection
>>> connection.ensure_connection()
```

#### 4.5.2 評測卡住

```bash
# 檢查 Celery Worker
docker-compose logs celery

# 檢查 Redis
docker exec oj_redis redis-cli INFO

# 清空 Redis（注意：會清除所有任務）
docker exec oj_redis redis-cli FLUSHALL

# 重啟 Celery
docker-compose restart celery
```

#### 4.5.3 前端無法連接後端

```bash
# 檢查 Nginx 配置（如果使用）
nginx -t

# 檢查 CORS 設定
# backend/config/settings/prod.py
CORS_ALLOWED_ORIGINS = [...]

# 檢查防火牆
sudo ufw status
```

### 4.6 升級策略

#### 4.6.1 藍綠部署（未來）

```bash
# 1. 部署新版本到 "綠" 環境
docker-compose -f docker-compose.green.yml up -d

# 2. 測試新版本
curl http://localhost:8001/api/v1/

# 3. 切換流量（Nginx upstream）
# 4. 停止舊版本
```

#### 4.6.2 滾動更新

```bash
# 1. 更新程式碼
git pull origin main

# 2. 逐一重啟 Worker
docker-compose up -d --no-deps --build celery

# 3. 重啟 Backend（零停機）
docker-compose up -d --no-deps --build backend

# 4. 重啟 Frontend
docker-compose up -d --no-deps --build frontend
```

---

## 5. 故障排除

### 5.1 緊急處理流程

1. **評估影響範圍**: 受影響的使用者數量
2. **隔離問題**: 暫時停用有問題的功能
3. **回復備份**: 如有資料損毀
4. **修復問題**: 部署 Hotfix
5. **事後檢討**: 記錄事件與改進措施

### 5.2 快速恢復指令

```bash
# 回復到上一個版本
docker-compose down
git checkout <previous-commit>
docker-compose up -d

# 還原資料庫
docker exec -i oj_postgres psql -U postgres online_judge < latest_backup.sql

# 清除快取
docker exec oj_redis redis-cli FLUSHALL

# 重啟所有服務
docker-compose restart
```

---

**QJudge Deployment & Testing** - 穩定可靠的部署策略 🚀
