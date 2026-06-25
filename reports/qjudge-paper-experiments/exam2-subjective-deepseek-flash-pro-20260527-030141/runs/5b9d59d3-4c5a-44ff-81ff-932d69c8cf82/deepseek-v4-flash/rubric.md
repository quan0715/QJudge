# Rubric: Non-blocking Message Passing Notification Methods

## 題目
List four methods to notify a receiver in a non-blocking message passing system that a message has arrived.

## 滿分
4 分（每個正確方法 1 分）

## 參考答案
| # | 方法 | 說明 |
|---|------|------|
| 1 | Interrupt the receiver | 透過硬體或軟體中斷通知接收者 |
| 2 | Periodic polling of the buffer status | 接收者定期輪詢 buffer 狀態 |
| 3 | Creating a pop-up thread | 訊息抵達時開一個新 thread 處理 |
| 4 | Processing an active message inside the interrupt handler | 在 interrupt handler 中直接處理（需信任環境） |

## 評分原則

### 給分標準（每個 valid method 得 1 分）
1. **Interrupt** (1 pt) — 提到 interrupt / 中斷通知 receiver 即可。
2. **Polling** (1 pt) — 提到 polling / 輪詢 / 定期檢查 buffer 狀態即可。
3. **Pop-up thread** (1 pt) — 提到 pop-up thread / 開新 thread 處理即可。
4. **Active message / interrupt handler processing** (1 pt) — 提到在 interrupt handler 中處理 active message，或直接在 handler 處理訊息即可。

### 可接受的變體
- Interrupt: signal, interrupt handler notification
- Polling: poll(), check periodically, 輪詢
- Pop-up thread: create a new thread, pop-out thread, 建立新執行緒
- Active message / interrupt handler: 直接在 interrupt handler 處理, active message processing
- 以上四種方法順序不拘。

### 不給分的情況
- 只列出少於 4 項 → 依正確項數給分
- 方法概念與上述四種完全不同（如：mailbox, shared memory, event-driven architecture, Redis, queue, ACK, timer 等）→ 不計分
- 空白或無關答案 → 0 分
- 同義重複（如 polling 與 check periodically 寫成兩項）→ 只算一個方法

### 非滿分時 reason 必填
滿分（4/4）→ reason 留空；非滿分 → reason 簡述缺了哪幾項。
