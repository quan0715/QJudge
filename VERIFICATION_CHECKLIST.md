# SSE 互動實施驗證檢查表

## 🎯 快速驗證（5 分鐘）

### Step 1: 確認代碼修改已應用

```bash
# 驗證前端修改
grep -n "onUsage\|onInit" frontend/src/infrastructure/api/repositories/chatbot.repository.ts
# 預期：應看到 onUsage 和 onInit 回調的定義和使用

# 驗證後端修改
grep -n "thinking_content\|all_tools_executed\|collected_usage" backend/apps/ai/views.py
# 預期：應看到元數據收集變量

# 驗證類型定義
grep -n "UsageInfo\|tool_start\|thinking" frontend/src/core/types/chatbot.types.ts
# 預期：應看到新的事件類型和接口
```

### Step 2: 前端編譯驗證

```bash
cd frontend
npm run build 2>&1 | grep -i "chatbot.*error\|ts2554\|ts7006" || echo "✅ No chatbot compilation errors"
```

預期：沒有 chatbot 相關的編譯錯誤

### Step 3: 後端語法驗證

```bash
cd backend
python3 -m py_compile apps/ai/views.py && echo "✅ Backend syntax OK"
```

預期：無語法錯誤提示

---

## 🧪 功能驗證（10-15 分鐘）

### Step 4: 前端運行時驗證

1. **啟動前端開發伺服器**
   ```bash
   cd frontend
   npm run dev
   ```

2. **打開開發者工具**
   - 按 F12 打開開發者工具
   - 進入 Console 標籤
   - 設置日誌級別顯示 debug 訊息

3. **發送測試訊息**
   - 在 ChatBot 中輸入簡單訊息：「你好」
   - 觀察 Console 輸出

4. **預期的 Console 日誌輸出**（按順序）：
   ```
   Sending message to session: {...}
   SSE Event: init {...}
   SSE Event: session {...}
   SSE Event: thinking {...}
   SSE Event: tool_start {...}
   SSE Event: delta {...}
   SSE Event: delta {...}
   SSE Event: tool_result {...}
   SSE Event: usage {...}
   SSE Event: done
   ```

**驗證清單：**
- [ ] 看到 `init` 事件（後端會話初始化）
- [ ] 看到 `session` 事件（Claude SDK 會話信息）
- [ ] 看到 `thinking` 事件（至少一次）
- [ ] 看到 `tool_start` 和 `tool_result` 事件對
- [ ] 看到 `usage` 事件（Token 用量信息）
- [ ] 看到 `delta` 事件（流式內容）
- [ ] 看到 `done` 事件（完成信號）

### Step 5: 後端日誌驗證

1. **啟動後端開發伺服器**（如果未運行）
   ```bash
   cd backend
   python3 manage.py runserver
   ```

2. **設置日誌級別**
   確保 Django 設置中 AI 應用的日誌級別為 DEBUG

3. **觀察後端日誌**
   在伺服器日誌中應該看到：
   ```
   Captured thinking: XXX chars
   Tool start: skill_name
   Tool result: skill_name (success)
   Usage: {'input_tokens': 123, 'output_tokens': 456, 'cost_cents': 78}
   ```

**驗證清單：**
- [ ] 看到「Captured thinking」日誌
- [ ] 看到「Tool start」日誌
- [ ] 看到「Tool result」日誌
- [ ] 看到「Usage」日誌

---

## 💾 數據庫驗證（10 分鐘）

### Step 6: 檢查 AIMessage 元數據

```python
# Django shell 中執行
python3 manage.py shell

from apps.ai.models import AIMessage
import json

# 查詢最新的 AI 訊息
msg = AIMessage.objects.filter(role='assistant').order_by('-created_at').first()

if msg and msg.metadata:
    print("=== AIMessage Metadata ===")
    print(json.dumps(msg.metadata, indent=2, ensure_ascii=False))

    # 驗證各字段
    print("\n✅ 驗證結果:")
    print(f"  - 有 thinking: {'thinking' in msg.metadata and bool(msg.metadata.get('thinking'))}")
    print(f"  - 有 tools_executed: {'tools_executed' in msg.metadata}")
    print(f"  - 有 usage: {'usage' in msg.metadata}")

    if msg.metadata.get('tools_executed'):
        print(f"\n工具執行詳情:")
        for tool in msg.metadata['tools_executed']:
            print(f"  - {tool.get('tool_name')}: {tool.get('duration_ms')}ms")
else:
    print("❌ 未找到 AI 訊息或元數據為空")
```

預期輸出：
```json
{
  "thinking": "思考過程的文本...",
  "tools_executed": [
    {
      "tool_name": "Skill",
      "tool_use_id": "xxx",
      "input": {...},
      "result": "...",
      "duration_ms": 123,
      "skill_metadata": {...}
    }
  ],
  "usage": {
    "input_tokens": 123,
    "output_tokens": 456,
    "cost_cents": 78
  }
}
```

**驗證清單：**
- [ ] metadata 包含 `thinking` 欄位
- [ ] metadata 包含 `tools_executed` 列表
- [ ] 每個 tool 都有 `duration_ms`
- [ ] metadata 包含 `usage` 信息

### Step 7: 檢查 AIExecutionLog Token 計數

```python
# 繼續在 Django shell 中執行
from apps.ai.models import AIExecutionLog

log = AIExecutionLog.objects.order_by('-created_at').first()

if log:
    print("=== AIExecutionLog ===")
    print(f"Input tokens: {log.input_tokens}")
    print(f"Output tokens: {log.output_tokens}")
    print(f"Cost (cents): {log.cost_cents}")
    print(f"\nMetadata: {json.dumps(log.metadata or {}, indent=2, ensure_ascii=False)}")

    print("\n✅ 驗證結果:")
    print(f"  - input_tokens > 0: {log.input_tokens > 0}")
    print(f"  - output_tokens > 0: {log.output_tokens > 0}")
    print(f"  - cost_cents >= 0: {log.cost_cents >= 0}")
    print(f"  - metadata not empty: {bool(log.metadata)}")
else:
    print("❌ 未找到執行日誌")
```

預期：
- `input_tokens` > 0
- `output_tokens` > 0
- `cost_cents` >= 0
- metadata 包含 thinking、tools_executed、usage

**驗證清單：**
- [ ] input_tokens 被正確保存
- [ ] output_tokens 被正確保存
- [ ] cost_cents 被正確保存
- [ ] metadata 包含所有必要的信息

---

## 🔍 詳細測試場景

### 場景 1: 簡單查詢（無思考、無工具）
- **訊息**：「2+2等於多少？」
- **預期**：
  - thinking 可能為空或很短
  - tools_executed 為空
  - 應有 usage 信息

### 場景 2: 複雜查詢（有思考、有工具）
- **訊息**：「分析這個代碼的複雜度」（附帶代碼片段）
- **預期**：
  - thinking 應該有詳細的分析過程
  - tools_executed 應該包含一個或多個工具調用
  - 每個工具應該有 result 和 duration_ms

### 場景 3: 技能調用
- **訊息**：「生成一個 Python 測試題」
- **預期**：
  - tools_executed 應包含 Skill 工具
  - skill_metadata 應包含 skill 和 gate 信息
  - 應有完整的執行時間記錄

---

## ⚠️ 常見問題排除

### 問題 1：看不到任何日誌
- [ ] 確認瀏覽器開發者工具已打開
- [ ] 確認 Console 日誌級別包括 debug
- [ ] 確認後端 API 無 CORS 或認證錯誤

### 問題 2：only see `delta` events
- [ ] 檢查 ai-service 是否正在運行
- [ ] 檢查後端日誌中 SSE 解析是否失敗
- [ ] 驗證 ai-service 返回的 SSE 格式是否正確

### 問題 3：metadata 為空
- [ ] 檢查後端日誌中「Captured」信息
- [ ] 驗證 ai-service 是否發送相應的事件
- [ ] 檢查 final 塊中元數據是否正確構建

### 問題 4：Token 計數為 0
- [ ] 驗證 ai-service 是否返回 usage 事件
- [ ] 檢查 collected_usage 是否被正確賦值
- [ ] 確認 save() 被調用

---

## 📋 驗證清單完成標誌

當以下所有項目都完成時，實施可視為 ✅ 成功：

### 前端（4 個檢查點）
- [ ] 代碼修改已應用（grep 驗證）
- [ ] 編譯無錯誤
- [ ] Console 顯示所有 9 種 SSE 事件
- [ ] UI 正確更新（thinking、tool 執行等顯示）

### 後端（4 個檢查點）
- [ ] 代碼修改已應用（grep 驗證）
- [ ] Python 語法檢查通過
- [ ] 後端日誌顯示元數據收集
- [ ] Token 計數在日誌中可見

### 數據庫（4 個檢查點）
- [ ] AIMessage.metadata 包含完整元數據
- [ ] AIExecutionLog.metadata 包含完整元數據
- [ ] input_tokens、output_tokens、cost_cents 被保存
- [ ] 至少 3 個不同的測試訊息都符合上述要求

---

**驗證完成時間**：______
**驗證人**：______
**驗證結果**：☐ 通過 ☐ 部分通過 ☐ 失敗

如有失敗項，請記錄具體信息並參考「常見問題排除」部分。
