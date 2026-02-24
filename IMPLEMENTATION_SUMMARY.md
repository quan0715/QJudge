# QJudge 專案實作現況摘要（2026-02-24）

本文件用於描述 `ta-agent` 分支目前的實作狀態，供開發、測試與 PR 檢視時快速對齊。

## 一、已完成的主要項目

### 1) AI Agent 流程（DeepAgent 化）

- `ai-service` 已從舊版 `claude_service` 流程轉為 DeepAgent runner
- 新增工具註冊與調用基礎設施（tool registry / tool client）
- 新增 SSE 事件轉接層（event adapter），將 agent 事件標準化輸出給前端
- 新增模型工廠（model factory）支援多模型配置

### 2) Chatbot 串流與體驗

- 前後端 SSE 事件鏈路已可處理 `init/session/thinking/tool_start/tool_result/usage/delta/done/error`
- 後端會收集並保存 `thinking/tools_executed/usage` 到訊息與執行紀錄
- 前端已完成 session 串流修正：
  - 以後端 `session_id` 對齊資料模型
  - 追蹤串流回傳 session 並在 `done` 時正確 reload
  - 首次訊息建立正式 session 後可同步更新 `currentSessionId`
- 使用者互動相關 UX 修正已落地（刪除 session、Modal 行為、中斷保護等）

### 3) Backend AI 內部流程與安全

- 新增內部 HMAC 驗證路徑，供 AI service 與 backend 內部動作互信
- 新增 PendingAction 與核准/取消流程端點（Human-in-the-loop 基礎）
- 新增 `resume_stream` 相關能力，支援中斷後續流

### 4) Exam V2 骨架

- 後端新增 ExamQuestion 相關 model / migration / serializer / API
- 前端新增 Exam V2 多頁流程骨架（註冊、前檢、作答、送出檢查、評分、結果）
- 比賽設定頁已加入 exam model / questions 管理入口

## 二、目前仍在進行或待收斂

### 1) 前端型別與建置收斂

- 專案尚有既有 TypeScript/Storybook/Contest 區域錯誤，會影響全量 `npm run build`
- 本次分支已修正 chatbot 核心串流映射問題，但未一次處理所有歷史型別問題

### 2) 測試環境一致性

- backend 在 `dev` 設定下可能受 cloud DB alias 影響，需用 `config.settings.test` + 明確 `DATABASE_URL`
- frontend `test:api` 目前仍有本地授權測試帳號/初始化依賴（可能出現 Unauthorized）

### 3) PR 流程限制

- 遠端目前沒有 `dev` 分支，因此 PR 暫時以 `main` 為 base（見下方）
- 現行 pre-push gate 對全域 build/型別錯誤非常敏感，與本次局部修正耦合度高

## 三、最新分支與 PR 狀態

- 當前分支：`ta-agent`
- 開放中的 Draft PR：[https://github.com/quan0715/QJudge/pull/51](https://github.com/quan0715/QJudge/pull/51)
- PR 標題：`fix: stabilize ta-agent session streaming and recap progress`
- Base / Head：`main <- ta-agent`

## 四、最新驗證紀錄（重點）

### 已驗證

- `docker compose -f docker-compose.dev.yml up -d --build` 可成功啟動主要服務
- `GET http://localhost:8001/health` 回應 healthy
- backend（test settings）smoke 測試可通過：
  - `pytest apps/ai/tests/test_session_creation.py::AISessionCreationTest::test_session_model_with_pk -q`

### 尚未全綠（已知）

- backend 全量 `apps/ai/tests`：在 dev 設定時可能誤走 cloud 連線造成失敗
- frontend `npm run test:api`：目前受本地授權測試依賴影響（Unauthorized）
- frontend 全量 build：仍有既有 contest/storybook 型別錯誤

## 五、建議後續順序

1. 固化 backend 測試執行入口（預設走 `config.settings.test` + local `DATABASE_URL`）
2. 補齊 frontend API 測試專用登入/資料種子流程
3. 分批清理非 AI 核心區域的 TS 錯誤（contest/storybook 優先）
4. pre-push gate 拆分為「核心必檢」與「全量檢查」兩層，降低開發阻塞
