# Rubric: Non-blocking Message Passing Notification Methods

**題目**: List four methods to notify a receiver in a non-blocking message passing system that a message has arrived.

**滿分**: 4 分（每正確方法 1 分）

## 正確答案（四種方法）

| # | 方法 | 可接受說法 |
|---|------|-----------|
| 1 | **Interrupt the receiver** | interrupt, 中斷, signal（若明確指中斷） |
| 2 | **Periodic polling of buffer status** | polling, poll, 輪詢, 定期檢查 buffer/status |
| 3 | **Creating a pop-up thread** | pop-up thread, pop-up, create a new thread, 建立新執行緒 |
| 4 | **Processing an active message inside the interrupt handler** | active message, interrupt handler 處理, 在 interrupt handler 中執行 |

## 評分規則

- 每正確列出一種方法得 1 分，滿分 4 分。
- 四種方法之間有重複／同義表述不重複計分（例如同時寫 interrupt 和 signal 指同一概念只算一次）。
- 完全錯誤或不相關的方法不給分（例如：mailbox, ACK, timer, message queue, Redis, shared memory 等與本題無關）。
- 作答不足四種方法：依實際正確數量給分。
- 作答超過四種方法：取其中正確且不重複者，最多 4 分。
- 答案完全離題或空白：0 分。

## reason 填寫規則

- 滿分（4 分）：reason 留空。
- 非滿分：簡述缺漏或錯誤（例如「缺 polling」「#3 非正確方法」「僅列 2 項正確」）。
