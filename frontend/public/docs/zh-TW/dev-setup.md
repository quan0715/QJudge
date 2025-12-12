# 開發環境設定

本文說明如何設定 QJudge 的本地開發環境。

## 系統需求

- Node.js 18+
- Python 3.10+
- Docker & Docker Compose
- Git

## 快速開始

### 1. 複製專案

```bash
git clone https://github.com/your-org/qjudge.git
cd qjudge
```

### 2. 前端設定

```bash
cd frontend
npm install
npm run dev
```

前端將在 `http://localhost:5173` 啟動。

### 3. 後端設定

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

後端將在 `http://localhost:8000` 啟動。

### 4. 評測系統

評測系統使用 Docker 運行：

```bash
docker compose up -d judge
```

## 專案結構

```
qjudge/
├── frontend/          # React 前端
│   ├── src/
│   │   ├── domains/   # 功能模組
│   │   ├── ui/        # UI 組件
│   │   └── i18n/      # 多語系
│   └── public/
├── backend/           # Django 後端
│   ├── api/           # API 端點
│   ├── judge/         # 評測邏輯
│   └── core/          # 核心模組
└── docker/            # Docker 設定
```

## 常用指令

### 前端

| 指令            | 說明           |
| --------------- | -------------- |
| `npm run dev`   | 啟動開發伺服器 |
| `npm run build` | 建置生產版本   |
| `npm run lint`  | 檢查程式碼風格 |
| `npm run test`  | 執行測試       |

### 後端

| 指令                               | 說明           |
| ---------------------------------- | -------------- |
| `python manage.py runserver`       | 啟動開發伺服器 |
| `python manage.py migrate`         | 執行資料庫遷移 |
| `python manage.py test`            | 執行測試       |
| `python manage.py createsuperuser` | 建立管理員帳號 |

## 環境變數

### 前端 (.env)

```
VITE_API_URL=http://localhost:8000
```

### 後端 (.env)

```
DEBUG=True
SECRET_KEY=your-secret-key
DATABASE_URL=sqlite:///db.sqlite3
```

## 常見問題

### 前端無法連接後端

確認後端已啟動，並檢查 CORS 設定。

### 資料庫遷移失敗

嘗試刪除遷移檔案並重新生成：

```bash
python manage.py makemigrations
python manage.py migrate
```

### Docker 容器無法啟動

檢查 Docker 服務是否正在運行：

```bash
docker ps
docker compose logs
```

