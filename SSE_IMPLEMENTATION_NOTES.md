# SSE 串流實作現況（2026-02-24）

本文件聚焦 QJudge AI 助教的 SSE 串流設計與目前落地狀態。

## 一、目前事件模型

前端目前可處理以下事件型別：

- `init`
- `session`
- `thinking`
- `tool_start`
- `tool_result`
- `usage`
- `delta`
- `user_input_request`
- `done`
- `error`

## 二、資料流（目前版本）

```text
Frontend useChatbot
  -> chatbot.repository.sendMessageStream()
  -> Backend /api/v1/ai/sessions/{id}/send_message_stream/
  -> AI Service /api/chat/stream (DeepAgent runner)
  -> Backend 轉發並收集 metadata
  -> Frontend 增量更新訊息
```

關鍵點：

- backend 會在轉發過程中同步收集 `thinking`、`tools_executed`、`usage`
- assistant 訊息與 execution log 都會保存 metadata
- `done` 事件後前端會重新抓完整 session 以確保狀態一致

## 三、近期關鍵修正（已完成）

### 1) Session ID 對齊

- 修正前端讀取 session 詳細資料時欄位不一致（`id` vs `session_id`）問題
- 目前以後端回傳 `session_id` 為準

### 2) 串流完成後 session refresh 目標修正

- 先前 `done` 後可能用錯 session id 導致刷新失敗
- 現在會追蹤 SSE `session` 事件中的真實 session id，再做 `getSession`

### 3) 首次訊息建立正式 session 的 UI 同步

- 首次送出訊息後若 session id 由暫存值切為正式值，會同步更新 `currentSessionId`
- 避免 UI 留在舊 id 導致後續操作失效

## 四、目前仍需注意

- 若 `AI service` 中斷且沒有發出終止事件，前端仍需依賴錯誤保護邏輯收斂狀態
- 全專案型別錯誤尚未全數收斂，與 SSE 功能本身分離
- 測試環境要避免誤連 cloud DB，否則會讓 SSE 相關 backend 測試出現假性失敗

## 五、建議驗證命令

```bash
# 1) 啟動開發環境
docker compose -f docker-compose.dev.yml up -d --build

# 2) 檢查 AI service 健康
curl http://localhost:8001/health

# 3) 觀察 backend 串流日誌
docker compose -f docker-compose.dev.yml logs -f backend

# 4) 前端 API 整合測試（依專案測試帳號設定）
cd frontend && API_BASE_URL=http://localhost:8000 npm run test:api
```
