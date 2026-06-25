# Rubric：Deadlock 四個必要條件

## 題目
List the four necessary conditions that must hold simultaneously for a system-wide deadlock to occur.

## 滿分
4 分

## 參考答案（四條，每條 1 分）
1. **Mutual Exclusion（互斥）** — 資源一次只能被一個 process 持有。
2. **Hold and Wait（持有並等待）** — Process 持有至少一個資源，同時等待取得其他資源。
3. **No Preemption（不可搶奪）** — 資源只能由持有者主動釋放，不可被強制奪走。
4. **Circular Wait（循環等待）** — 存在一個 process 等待鏈，形成環形依賴。

## 評分規則
- 每答對一條得 **1 分**，共 4 分。
- 不要求完整英文名稱，中英文或縮寫皆可，意義正確即算對。
- 多寫錯誤條件**不扣分**，但不補分。
- 答案重複列同一條件只算 1 分。

## reason 政策
- 滿分（4 分）→ reason 留空。
- 非滿分 → 簡述答對幾條、哪條錯誤或漏答。
