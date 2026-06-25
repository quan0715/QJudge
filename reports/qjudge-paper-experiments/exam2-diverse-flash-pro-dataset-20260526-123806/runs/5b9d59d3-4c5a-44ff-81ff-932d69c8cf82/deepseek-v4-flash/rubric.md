# Rubric — Non-blocking Message Passing Notification Methods

## 題目
List four methods to notify a receiver in a non-blocking message passing system that a message has arrived.

## 滿分：4 分（每個方法 1 分）

## 參考答案（正確四種方法）
1. **Interrupt the receiver** — 中斷接收者
2. **Periodic polling of the buffer status** — 定期輪詢緩衝區狀態
3. **Creating a pop-up thread** — 建立 pop-up thread 處理抵達訊息
4. **Processing an active message inside the interrupt handler** — 在中斷處理程式中處理 active message

## 評分原則
- 每正確列出一種方法且描述可辨識為該方法 → 1 分
- 只寫方法名稱未解釋 → 仍算正確（題目要求「List」）
- 同一概念重複列舉 → 只計 1 次
- 與上述四種完全無關的項目 → 不給分
- 部分正確但方向對 → 0.5 分（例如只寫 polling 但沒說 buffer status）

## 各方法接受的同義表述
| 方法 | 可接受的同義詞 |
|------|---------------|
| Interrupt | interrupt signal, 中斷, 打斷 receiver |
| Polling | poll, periodical check, 輪詢, 定期檢查 buffer |
| Pop-up thread | pop-up thread, create new thread, 建立新執行緒處理 |
| Active message / interrupt handler | active message, interrupt handler processing, 在 handler 中直接處理 |

## Reason 政策
- 滿分 4/4 → reason 留空
- 非滿分 → 簡短說明扣分原因（缺哪些方法）
