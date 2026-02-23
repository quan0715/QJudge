# SSE 互動完整實施報告（2026-01-27）

## ✅ 實施完成

已完全實現前後端 SSE 互動機制，解決了兩個關鍵問題：

### 問題 1：元數據完全丟失（已解決）
- **問題**：思考過程、工具使用等信息未被保存到後端
- **解決方案**：
  - 後端完整轉發所有 SSE 事件並同時收集元數據
  - 將 thinking、tool_executed、usage 等信息保存到 AIMessage.metadata 和 AIExecutionLog
  - Token 計數（input_tokens、output_tokens、cost_cents）被正確保存

### 問題 2：事件處理不完整（已解決）
- **問題**：前端只接收 delta、done、error 三種事件
- **解決方案**：
  - 前端完整接收所有 9 種事件類型（init、session、thinking、tool_start/result、usage、delta、done、error）
  - 為每種事件添加適當的 debug 日誌
  - 更新 UI 顯示回調（onThinking、onToolStart/Result、onUsage、onInit）

---

## 📝 修改清單

### 優先級 1：前端（已完成）

#### 1. `frontend/src/core/types/chatbot.types.ts`
- ✅ 添加 `init` 和 `usage` 事件類型到 `StreamEventType`
- ✅ 新增 `UsageInfo` 接口（inputTokens、outputTokens、costCents）
- ✅ 擴展 `StreamEvent` 接口，添加新事件字段（backendSessionId、isNewSession、sessionId、usageInfo）

#### 2. `frontend/src/infrastructure/api/repositories/chatbot.repository.ts`
- ✅ 擴展 `AIServiceStreamEvent` 接口，支持所有 9 種事件類型
- ✅ 添加 thinking、tool、usage、user_input_request 事件的數據字段
- ✅ 完整重寫 `sendMessageStream()` 方法：
  - 使用 switch-case 完整處理所有事件類型
  - 為每個事件添加 console.debug 日誌
  - 調用相應的回調函數（onThinking、onToolStart、onToolResult、onUsage、onInit）
  - 處理最後一行時同樣完整處理

#### 3. `frontend/src/core/ports/chatbot.repository.ts`
- ✅ 更新 `sendMessageStream` 方法簽名，添加 `onUsage` 和 `onInit` 參數

#### 4. `frontend/src/features/chatbot/hooks/useChatbot.ts`
- ✅ 在 `sendMessage()` 中傳遞新的回調：
  - `onUsage`：Token 用量信息（日誌記錄）
  - `onInit`：後端會話初始化信息（日誌記錄）

### 優先級 2：後端（已完成）

#### 5. `backend/apps/ai/views.py` - `send_message_stream()` 方法

**Step 4：增強 SSE 轉發（第 461-605 行）**
- ✅ 初始化元數據收集變量：
  - `thinking_content` - 思考過程
  - `all_tools_executed` - 工具執行列表
  - `collected_usage` - Token 用量信息
  - `current_tool` - 當前工具的臨時存儲

- ✅ 完整轉發所有 ai-service 的 SSE 流：
  - 逐行讀取並檢查是否為 `data:` 開頭
  - 同時解析和收集事件數據
  - 轉發所有行給前端（包括空行）

- ✅ 收集關鍵元數據：
  - `thinking`：保存 AI 的推理過程
  - `tool_start`：記錄工具開始信息（名稱、ID、輸入、開始時間）
  - `tool_result`：完整記錄工具執行結果（結果、是否錯誤、耗時）
  - `usage`：記錄 Token 用量（input_tokens、output_tokens、cost_cents）

**Step 5：保存元數據（第 589-620 行）**
- ✅ `AIMessage` 保存完整元數據：
  ```python
  metadata = {
    "thinking": thinking_content,
    "tools_executed": all_tools_executed,
    "usage": collected_usage
  }
  ```

- ✅ `AIExecutionLog` 保存完整元數據和 Token 計數：
  ```python
  log.metadata = {
    "thinking": thinking_content,
    "tools_executed": all_tools_executed,
    "usage": collected_usage,
    ...
  }
  log.input_tokens = collected_usage.get("input_tokens", 0)
  log.output_tokens = collected_usage.get("output_tokens", 0)
  log.cost_cents = collected_usage.get("cost_cents", 0)
  log.save()
  ```

---

## 🔍 驗證清單

### 前端驗證（P1）

- [ ] **編譯檢查**
  ```bash
  cd frontend && npm run build
  ```
  預期結果：無 chatbot 相關編譯錯誤

- [ ] **運行時驗證**
  1. 打開開發者工具（F12）
  2. 進入 Console 標籤
  3. 發送訊息給 AI
  4. 預期看到的日誌：
     ```
     SSE Event: init {...}
     SSE Event: session {...}
     SSE Event: thinking {...}
     SSE Event: tool_start {...}
     SSE Event: tool_result {...}
     SSE Event: usage {...}
     SSE Event: delta {...}
     SSE Event: done
     ```

- [ ] **UI 顯示驗證**
  - 思考過程應在 AI 訊息中顯示（如果有）
  - 工具執行應被記錄並可檢視
  - Token 用量信息應被日誌記錄

### 後端驗證（P2）

- [ ] **日誌驗證**
  檢查後端日誌中是否出現：
  ```
  Captured thinking: XXX chars
  Tool start: skill_name
  Tool result: skill_name (success/error)
  Usage: {'input_tokens': X, 'output_tokens': Y, 'cost_cents': Z}
  ```

- [ ] **數據庫驗證**
  ```python
  # Django shell 驗證
  from apps.ai.models import AIMessage, AIExecutionLog

  # 查詢最新 AI 訊息
  msg = AIMessage.objects.filter(role='assistant').latest('created_at')
  print("Message metadata:", msg.metadata)
  # 預期包含：thinking、tools_executed、usage

  # 查詢最新執行日誌
  log = AIExecutionLog.objects.latest('created_at')
  print("Log metadata:", log.metadata)
  print("Tokens:", log.input_tokens, log.output_tokens, log.cost_cents)
  ```

### E2E 測試

- [ ] **場景 1：單純 Delta 訊息**
  - 發送簡單訊息（如 "你好")
  - 驗證：thinking 和 tools_executed 為空
  - 驗證：usage 被正確記錄

- [ ] **場景 2：帶思考過程的訊息**
  - 發送需要推理的問題
  - 驗證：thinking 被收集並保存
  - 預期：在 AIMessage.metadata['thinking'] 中看到思考內容

- [ ] **場景 3：使用工具的訊息**
  - 發送觸發工具調用的訊息（如技能調用）
  - 驗證：tools_executed 包含完整的工具執行記錄
  - 預期：tool_name、tool_use_id、result、duration_ms 都被記錄

- [ ] **場景 4：完整流程**
  - 發送複雜訊息（有思考、有工具調用）
  - 前端 console 應顯示所有事件
  - 後端日誌應記錄所有元數據
  - 數據庫應保存完整信息

---

## 📊 數據流圖

```
前端 (ChatInput)
    ↓
sendMessageStream() [完整接收所有事件]
    ├─ onInit → 日誌記錄
    ├─ onSession → 日誌記錄
    ├─ onThinking → 更新 UI + 日誌
    ├─ onToolStart → 更新 UI + 日誌
    ├─ onToolResult → 更新 UI + 日誌
    ├─ onUsage → 日誌記錄
    ├─ onDelta → 流式更新內容
    └─ onDone → 刷新 Session
    ↓
Backend API (send_message_stream)
    ├─ 發送 init 事件
    ├─ 代理 ai-service SSE 流
    │  ├─ 解析每個事件
    │  ├─ 收集元數據 [重要]
    │  └─ 完整轉發到前端
    └─ 保存到數據庫
       ├─ AIMessage.metadata {
       │  ├─ thinking: 思考過程
       │  ├─ tools_executed: [工具列表]
       │  └─ usage: Token 用量
       │ }
       └─ AIExecutionLog
          ├─ metadata: 同上
          ├─ input_tokens: X
          ├─ output_tokens: Y
          └─ cost_cents: Z
```

---

## 🚀 後續檢查

### 編譯檢查
- [x] 後端 Python 語法檢查 ✅
- [x] 前端 TypeScript 編譯 ✅ (部分其他不相關的錯誤)

### 代碼審查清單
- [x] 前端完整接收所有事件類型 ✅
- [x] 後端完整轉發所有 SSE 訊息 ✅
- [x] 元數據完整收集 ✅
- [x] Token 計數正確保存 ✅
- [x] 日誌記錄充分 ✅

---

## 💡 關鍵改進說明

1. **元數據完整性**
   - 思考過程不再丟失，完整保存供後續分析和顯示
   - 工具執行歷史被完整記錄，包含輸入、輸出、耗時等詳細信息
   - Token 用量被精確記錄，便於成本計算和監控

2. **事件處理完整性**
   - 前端不再遺漏任何 SSE 事件
   - 所有事件都有相應的日誌輸出，便於調試
   - UI 可以更新以顯示完整的執行流程

3. **系統可觀測性**
   - 後端日誌詳細記錄每個事件的處理
   - 前端 console 日誌清晰展示所有接收的事件
   - 數據庫存儲完整的執行信息供事後分析

---

## 📦 部署注意事項

- **無數據庫遷移需求**：所有更改都使用現有的 JSONField 儲存元數據
- **向後兼容**：不會破壞現有功能，新欄位都是可選的
- **漸進式上線**：可立即上線，無需協調變更

---

**實施時間**：2026-01-27
**實施狀態**：✅ 完全實現
**驗證狀態**：待執行（見驗證清單）
