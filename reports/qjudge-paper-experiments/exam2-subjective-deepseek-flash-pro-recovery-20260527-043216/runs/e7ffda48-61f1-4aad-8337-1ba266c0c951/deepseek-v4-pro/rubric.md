# Rubric: Why are non-blocking operations less prone to deadlock?

**Question:** Why are non-blocking operations less prone to deadlock?

**Reference Answer:** They allow processes to continue execution without waiting.

**Max Score:** 2

## Scoring Criteria

### 2 分（滿分）
清楚解釋核心概念：non-blocking operations 讓 processes/threads 在送出或接收訊息後**不需等待對方回應**即可繼續執行，因此避免了 deadlock 的必要條件（如 circular wait 或 hold-and-wait）。回答明確指出「不需等待」或「可繼續執行」並連結到 deadlock 的避免。

### 1 分（部分正確）
- 提到「不需等待」或「不會 blocked」但未清楚連結到 deadlock 的因果關係
- 解釋方向正確但過於簡略（如只寫 "no wait, no deadlock" 而無進一步說明）
- 提到 deadlock 的必要條件但未完整說明 non-blocking 如何打破該條件
- 有部分混淆或不明確，但整體方向正確

### 0 分（錯誤或無效）
- 回答完全錯誤或與題目無關
- 空白回答、僅有標點符號
- 誤解 non-blocking 的意義（如與 blocking 混淆、方向相反）
- 給出明顯錯誤的因果關係（例如說 non-blocking 會造成 deadlock）

## 常見給分範例
- "It not need to wait." → 1 分（方向對但過於簡略）
- "They allow processes to continue execution without waiting." → 2 分（命中核心）
- "因為non-blocking不需要等待，會不斷檢查lock狀態，導致系統最後無法負荷，造成deadlock" → 0 分（因果關係錯誤）
