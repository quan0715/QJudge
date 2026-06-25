# Rubric: Non-blocking Message Passing — Receiver Notification Methods

**題目**: List four methods to notify a receiver in a non-blocking message passing system that a message has arrived.

**滿分**: 4 分（每項正確方法 1 分）

---

## 四項標準答案（每項 1 分）

| # | Method | Key Concepts |
|---|--------|-------------|
| 1 | **Interrupt** | 訊息抵達時，以 interrupt 中斷 receiver 使其處理訊息 |
| 2 | **Polling** | Receiver 定期檢查 buffer/mailbox 狀態以確認訊息是否抵達（需 poll() 等操作） |
| 3 | **Pop-up thread** | 訊息抵達時動態建立一個新 thread（或 process）來處理訊息 |
| 4 | **Active message** | 在 interrupt handler 內直接處理抵達的訊息（需在完全信任的環境中） |

---

## 評分規則

- 每答對一項 → +1 分（需核心概念正確，用詞可以不同但語意須對應）
- 每項部分正確但敘述不完整/模糊 → +0.5 分
- 缺項、答錯、不相關 → +0 分
- 若四項全對但多答一項無關內容 → 不扣分（仍 4 分）
- 若學生將同一方法用不同措辭重複（例如 method 2 和 3 都在說 polling）→ 只算一次

---

## 常見錯誤／部分給分範例

| 情境 | 給分 |
|------|------|
| 只寫 "interrupt"（無進一步說明）| 1 分（關鍵字正確即視為對） |
| "polling" 寫成 "check periodically" | 1 分（語意等價） |
| "pop-up thread" 寫成 "create a new thread/process" | 1 分 |
| "active message" 寫成 "handle in interrupt handler" | 1 分 |
| 寫 "signal" 替代 interrupt | 0.5 分（signal 不等同 interrupt，但若上下文合理可給半分） |
| 寫 "mailbox/message buffer" 作為方法 | 0 分（buffer 是機制，不是通知方法） |
| 寫 "ACK / send request / condition variable" | 0 分（不相關） |
| 完全未作答或給無關內容 | 0 分 |

---

## Reason 政策

- 滿分（4 分）且答案完整清晰 → reason 留空
- 非滿分 → reason 必填，簡述缺哪些方法或哪些答錯
