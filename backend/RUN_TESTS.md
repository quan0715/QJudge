# Backend 測試執行指南（2026-02-24）

本指南以 Docker Compose 開發環境為主，目標是降低環境差異造成的假性失敗。

## 一、前置條件

先確保開發容器已啟動：

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

## 二、建議測試設定

請優先使用 `config.settings.test` 與明確本機 `DATABASE_URL`：

```bash
docker compose -f docker-compose.dev.yml exec -T backend \
  env DJANGO_SETTINGS_MODULE=config.settings.test \
  DATABASE_URL=postgresql://postgres:postgres@postgres:5432/online_judge \
  PYTEST_ADDOPTS='--no-cov' \
  pytest <test-path> -q
```

說明：

- `config.settings.test`：避免 `dev` 設定造成資料庫路由副作用
- `DATABASE_URL`：明確指定 docker 內 postgres，避免誤連 cloud
- `PYTEST_ADDOPTS='--no-cov'`：先跑功能驗證，不受全域 coverage gate 影響

## 三、常用測試命令

### 1) AI app smoke test

```bash
docker compose -f docker-compose.dev.yml exec -T backend \
  env DJANGO_SETTINGS_MODULE=config.settings.test \
  DATABASE_URL=postgresql://postgres:postgres@postgres:5432/online_judge \
  PYTEST_ADDOPTS='--no-cov' \
  pytest apps/ai/tests/test_session_creation.py::AISessionCreationTest::test_session_model_with_pk -q
```

### 2) AI app 全部測試

```bash
docker compose -f docker-compose.dev.yml exec -T backend \
  env DJANGO_SETTINGS_MODULE=config.settings.test \
  DATABASE_URL=postgresql://postgres:postgres@postgres:5432/online_judge \
  PYTEST_ADDOPTS='--no-cov' \
  pytest apps/ai/tests -q
```

### 3) submissions 測試

```bash
docker compose -f docker-compose.dev.yml exec -T backend \
  env DJANGO_SETTINGS_MODULE=config.settings.test \
  DATABASE_URL=postgresql://postgres:postgres@postgres:5432/online_judge \
  PYTEST_ADDOPTS='--no-cov' \
  pytest apps/submissions/tests -q
```

## 四、常見問題

### 問題 1：誤連 cloud DB

症狀：

- 測試錯誤訊息出現 Supabase host
- `FATAL: Tenant or user not found`

處理：

- 使用本指南中的 `DJANGO_SETTINGS_MODULE=config.settings.test`
- 同時指定 `DATABASE_URL=postgresql://postgres:postgres@postgres:5432/online_judge`

### 問題 2：coverage 阻擋測試流程

症狀：

- 測試項目通過，但整體因 coverage 門檻失敗

處理：

- 開發階段先加 `PYTEST_ADDOPTS='--no-cov'`
- CI 或合併前再執行完整 coverage 流程

### 問題 3：測試資料庫衝突

症狀：

- `database "test_xxx" already exists`

處理：

```bash
docker compose -f docker-compose.dev.yml exec -T postgres \
  psql -U postgres -c "DROP DATABASE IF EXISTS test_online_judge;"
```

## 五、建議策略

1. 先跑單一 smoke case（確認環境）
2. 再跑目標 app 測試
3. 最後才跑全量測試與 coverage
