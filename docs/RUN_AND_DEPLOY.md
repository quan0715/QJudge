# QJudge 執行與部署指南

本文件提供 QJudge 平台的完整執行與部署指南，包括本地開發環境設置和生產環境部署。

---

## 📋 目錄

- [系統需求](#系統需求)
- [本地開發環境](#本地開發環境)
- [Docker 開發環境](#docker-開發環境)
- [生產環境部署](#生產環境部署)
- [常見問題](#常見問題)

---

## 🖥️ 系統需求

### 最低需求

- **作業系統**: Linux (Ubuntu 20.04+)、macOS (10.15+)、Windows 10/11 (含 WSL2)
- **記憶體**: 4GB RAM (建議 8GB+)
- **硬碟空間**: 10GB 可用空間
- **網路**: 穩定的網際網路連接

### 必要軟體

#### 本地開發
- **Python**: 3.11 或更高版本
- **Node.js**: 18 或更高版本
- **PostgreSQL**: 15 或更高版本
- **Redis**: 7 或更高版本
- **Git**: 最新版本

#### Docker 部署
- **Docker**: 24 或更高版本
- **Docker Compose**: 2.0 或更高版本

---

## 💻 本地開發環境

### 1. 複製專案

```bash
# 複製專案到本地
git clone https://github.com/quan0715/QJudge.git
cd QJudge
```

### 2. 後端設置

#### 2.1 安裝 PostgreSQL 和 Redis

**Ubuntu/Debian:**
```bash
# 安裝 PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib

# 安裝 Redis
sudo apt install redis-server

# 啟動服務
sudo systemctl start postgresql
sudo systemctl start redis-server
```

**macOS (使用 Homebrew):**
```bash
# 安裝 PostgreSQL
brew install postgresql@15
brew services start postgresql@15

# 安裝 Redis
brew install redis
brew services start redis
```

**Windows (使用 WSL2):**
```bash
# 在 WSL2 中按照 Ubuntu 步驟安裝
```

#### 2.2 創建資料庫

```bash
# 切換到 postgres 使用者
sudo -u postgres psql

# 在 PostgreSQL 命令列中執行
CREATE DATABASE qjudge;
CREATE USER qjudge_user WITH PASSWORD 'your_password';
ALTER ROLE qjudge_user SET client_encoding TO 'utf8';
ALTER ROLE qjudge_user SET default_transaction_isolation TO 'read committed';
ALTER ROLE qjudge_user SET timezone TO 'Asia/Taipei';
GRANT ALL PRIVILEGES ON DATABASE qjudge TO qjudge_user;
\q
```

#### 2.3 設置 Python 環境

```bash
cd backend

# 創建虛擬環境
python3 -m venv venv

# 啟動虛擬環境
# Linux/macOS:
source venv/bin/activate
# Windows:
# venv\Scripts\activate

# 安裝依賴
pip install -r requirements/dev.txt
```

#### 2.4 配置環境變數

```bash
# 複製環境變數範例檔案
cp .env.example .env

# 編輯 .env 檔案
nano .env
```

**`.env` 檔案範例**:
```env
# Django 設定
SECRET_KEY=your-secret-key-here-change-this
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

# 資料庫設定
DB_ENGINE=django.db.backends.postgresql
DB_NAME=qjudge
DB_USER=qjudge_user
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432

# Redis 設定
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# Celery 設定
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0

# JWT 設定
JWT_SECRET_KEY=your-jwt-secret-key
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7
```

#### 2.5 初始化資料庫

```bash
# 執行資料庫遷移
python manage.py migrate

# 創建超級使用者
python manage.py createsuperuser

# 載入初始資料（可選）
python manage.py loaddata fixtures/initial_data.json
```

#### 2.6 啟動後端伺服器

```bash
# 啟動 Django 開發伺服器
python manage.py runserver

# 後端伺服器將在 http://localhost:8000 上運行
```

#### 2.7 啟動 Celery Worker（新終端）

```bash
# 在新終端中啟動虛擬環境
cd backend
source venv/bin/activate

# 啟動 Celery Worker
celery -A config worker -l info

# 如果需要定時任務，另開終端啟動 Celery Beat
celery -A config beat -l info
```

### 3. 前端設置

#### 3.1 安裝 Node.js 和 npm

**Ubuntu/Debian:**
```bash
# 使用 NodeSource 安裝最新版 Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**macOS:**
```bash
# 使用 Homebrew
brew install node
```

**Windows:**
- 下載並安裝 [Node.js 官方安裝包](https://nodejs.org/)

#### 3.2 安裝前端依賴

```bash
cd frontend

# 安裝依賴套件
npm install
```

#### 3.3 配置前端環境變數

```bash
# 複製環境變數範例檔案
cp .env.example .env.local

# 編輯 .env.local
nano .env.local
```

**`.env.local` 檔案範例**:
```env
# API 端點
VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_WS_BASE_URL=ws://localhost:8000/ws

# 其他設定
VITE_APP_NAME=QJudge
VITE_APP_VERSION=1.0.0
```

#### 3.4 啟動前端開發伺服器

```bash
# 啟動 Vite 開發伺服器
npm run dev

# 前端將在 http://localhost:5173 上運行
```

### 4. 驗證安裝

開啟瀏覽器並訪問：

- **前端**: http://localhost:5173
- **後端 API**: http://localhost:8000/api/v1
- **Django Admin**: http://localhost:8000/admin
- **API 文件**: http://localhost:8000/api/docs

---

## 🐳 Docker 開發環境

使用 Docker Compose 可以快速建立完整的開發環境，無需手動安裝各項服務。

### 1. 安裝 Docker 和 Docker Compose

**Ubuntu/Debian:**
```bash
# 安裝 Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 安裝 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 將當前使用者加入 docker 群組
sudo usermod -aG docker $USER
newgrp docker
```

**macOS:**
- 下載並安裝 [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop)

**Windows:**
- 安裝 [WSL2](https://docs.microsoft.com/zh-tw/windows/wsl/install)
- 下載並安裝 [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop)

### 2. 配置環境變數

```bash
# 複製環境變數範例
cp .env.example .env

# 編輯環境變數（使用預設值即可）
nano .env
```

### 3. 啟動 Docker 容器

```bash
# 啟動所有服務（開發模式）
docker-compose -f docker-compose.dev.yml up

# 或在背景執行
docker-compose -f docker-compose.dev.yml up -d

# 查看日誌
docker-compose -f docker-compose.dev.yml logs -f

# 停止服務
docker-compose -f docker-compose.dev.yml down
```

### 4. 初始化資料庫（首次執行）

```bash
# 執行資料庫遷移
docker-compose -f docker-compose.dev.yml exec backend python manage.py migrate

# 創建超級使用者
docker-compose -f docker-compose.dev.yml exec backend python manage.py createsuperuser

# 載入測試資料
docker-compose -f docker-compose.dev.yml exec backend python manage.py loaddata fixtures/test_data.json
```

### 5. 存取服務

Docker 環境啟動後，可以透過以下網址存取：

- **前端**: http://localhost:3000
- **後端 API**: http://localhost:8000/api/v1
- **Django Admin**: http://localhost:8000/admin
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

### 6. Docker 常用指令

```bash
# 查看容器狀態
docker-compose -f docker-compose.dev.yml ps

# 查看特定服務日誌
docker-compose -f docker-compose.dev.yml logs backend
docker-compose -f docker-compose.dev.yml logs frontend

# 進入容器 Shell
docker-compose -f docker-compose.dev.yml exec backend bash
docker-compose -f docker-compose.dev.yml exec frontend sh

# 重新建置容器
docker-compose -f docker-compose.dev.yml build

# 清理容器和資料
docker-compose -f docker-compose.dev.yml down -v
```

---

## 🚀 生產環境部署

詳細的生產環境部署步驟請參考 [DEPLOYMENT.md](../DEPLOYMENT.md)，其中包含：

- Docker Compose 生產環境配置
- Cloudflare Tunnel 設置
- Nginx 反向代理配置
- SSL 憑證設置
- 自動化部署流程
- 監控和日誌管理

### 快速部署步驟

```bash
# 1. 在生產伺服器上複製專案
git clone https://github.com/quan0715/QJudge.git
cd QJudge

# 2. 配置生產環境變數
cp .env.example .env.prod
nano .env.prod  # 修改為生產環境配置

# 3. 啟動生產環境
docker-compose -f docker-compose.yml up -d

# 4. 初始化資料庫
docker-compose exec backend python manage.py migrate
docker-compose exec backend python manage.py collectstatic --noinput

# 5. 創建管理員帳號
docker-compose exec backend python manage.py createsuperuser
```

---

## 🧪 執行測試

### 後端測試

```bash
cd backend

# 執行所有測試
pytest

# 執行特定測試檔案
pytest tests/test_problems.py

# 產生測試覆蓋率報告
pytest --cov=apps --cov-report=html

# 查看覆蓋率報告
open htmlcov/index.html
```

### 前端測試

```bash
cd frontend

# 執行單元測試
npm run test

# 執行端對端測試
npm run test:e2e

# 產生測試覆蓋率報告
npm run test:coverage
```

---

## ❓ 常見問題

### 資料庫連接錯誤

**問題**: `psycopg2.OperationalError: could not connect to server`

**解決方案**:
1. 確認 PostgreSQL 服務已啟動
2. 檢查 `.env` 中的資料庫連接設定
3. 確認資料庫使用者權限正確

```bash
# 檢查 PostgreSQL 狀態
sudo systemctl status postgresql

# 重啟 PostgreSQL
sudo systemctl restart postgresql
```

### Redis 連接錯誤

**問題**: `redis.exceptions.ConnectionError`

**解決方案**:
1. 確認 Redis 服務已啟動
2. 檢查 Redis 連接設定

```bash
# 檢查 Redis 狀態
sudo systemctl status redis-server

# 測試 Redis 連接
redis-cli ping  # 應該回傳 PONG
```

### 前端無法連接後端

**問題**: CORS 錯誤或 API 無法存取

**解決方案**:
1. 確認後端伺服器已啟動
2. 檢查 `ALLOWED_HOSTS` 設定
3. 確認 CORS 設定正確

```python
# backend/config/settings/base.py
ALLOWED_HOSTS = ['localhost', '127.0.0.1', 'your-domain.com']

CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
]
```

### Docker 容器無法啟動

**問題**: 容器啟動失敗或立即停止

**解決方案**:
```bash
# 查看容器日誌
docker-compose logs backend

# 檢查容器狀態
docker-compose ps

# 重新建置容器
docker-compose build --no-cache

# 清理並重新啟動
docker-compose down -v
docker-compose up --build
```

### 評測系統無法運作

**問題**: 提交後卡在 Pending 狀態

**解決方案**:
1. 確認 Celery Worker 已啟動
2. 檢查 Redis 連接
3. 查看 Celery 日誌

```bash
# 查看 Celery Worker 狀態
celery -A config inspect active

# 查看任務佇列
redis-cli
> LLEN celery

# 重啟 Celery Worker
# 停止現有 worker 後重新啟動
celery -A config worker -l info
```

### 記憶體不足

**問題**: 系統效能變慢或容器被終止

**解決方案**:
```bash
# 限制 Docker 記憶體使用
# 編輯 docker-compose.yml
services:
  backend:
    mem_limit: 2g
  frontend:
    mem_limit: 1g
```

---

## 📚 延伸閱讀

- [DEPLOYMENT.md](../DEPLOYMENT.md) - 完整部署指南
- [BACKEND_API.md](../BACKEND_API.md) - 後端 API 文件
- [DATABASE_DESIGN.md](../DATABASE_DESIGN.md) - 資料庫設計
- [學生使用指南](./STUDENT_GUIDE.md) - 學生操作說明
- [教師使用指南](./TEACHER_CONTEST_GUIDE.md) - 教師操作說明

---

## 💡 開發建議

### 推薦的開發工具

- **IDE**: VS Code、PyCharm Professional
- **API 測試**: Postman、Insomnia
- **資料庫管理**: pgAdmin、DBeaver
- **Redis 管理**: RedisInsight
- **Git 客戶端**: GitKraken、SourceTree

### VS Code 推薦擴充套件

- Python (Microsoft)
- Pylance
- ESLint
- Prettier
- Docker
- GitLens
- REST Client

---

**更新日期**: 2025-12-03  
**文件版本**: 1.0.0
