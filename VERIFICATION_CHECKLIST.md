# QJudge 驗證檢查清單（2026-02-24）

本清單以目前 `ta-agent` 分支狀態為基準，聚焦「可快速確認專案是否可運作」。

## 一、環境啟動

- [ ] 執行 `docker compose -f docker-compose.dev.yml up -d --build`
- [ ] `docker compose -f docker-compose.dev.yml ps` 顯示 `frontend/backend/ai-service/postgres/redis/celery` 均為 `Up`
- [ ] `curl http://localhost:8001/health` 回傳 `status=healthy`

## 二、AI 串流核心（Chatbot）

- [ ] 前端可建立/載入 chat session
- [ ] 串流期間可收到 `delta` 內容
- [ ] 可觀察到 `thinking` / `tool_*` 事件（若該請求有觸發）
- [ ] `done` 後前端訊息最終狀態正確（沒有卡在 loading）
- [ ] 首次訊息建立正式 session 後仍可繼續送訊息（session id 不失聯）

## 三、後端與資料庫行為

- [ ] backend 日誌可看到 SSE 事件代理過程
- [ ] assistant 訊息有寫入資料庫
- [ ] execution log 有寫入 `metadata` 與 token usage（若該請求有 usage 事件）

## 四、測試命令（建議順序）

### 1) AI service 單元測試

```bash
cd ai-service
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python3 -m pytest tests/test_api.py -q
```

### 2) backend（測試設定 + 本機 DB）

```bash
docker compose -f docker-compose.dev.yml exec -T backend \
  env DJANGO_SETTINGS_MODULE=config.settings.test \
  DATABASE_URL=postgresql://postgres:postgres@postgres:5432/online_judge \
  PYTEST_ADDOPTS='--no-cov' \
  pytest apps/ai/tests/test_session_creation.py::AISessionCreationTest::test_session_model_with_pk -q
```

### 3) frontend API 整合測試（需本地測試帳號/資料）

```bash
cd frontend
API_BASE_URL=http://localhost:8000 npm run test:api
```

## 五、已知阻塞（目前）

- [ ] frontend 全量 `npm run build` 尚未全綠（既有 contest/storybook 型別錯誤）
- [ ] frontend `test:api` 目前可能因授權測試帳號/初始化資料不足出現 Unauthorized
- [ ] backend 若用 `dev` 設定跑測試，可能誤用 cloud DB alias 造成連線失敗

## 六、PR 前最低確認

- [ ] 本次改動相關功能在本地手動流程可重現
- [ ] 相關 smoke test 至少一條通過（AI service + backend）
- [ ] PR 描述已註明「已驗證範圍」與「尚未全綠原因」
