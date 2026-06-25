# Rubric: Deadlock Four Necessary Conditions

**題目**: List the four necessary conditions that must hold simultaneously for a system-wide deadlock to occur.
**滿分**: 4 分（每正確列出一個條件得 1 分）

## 評分標準

四個必要條件（必須全部同時成立才會發生 deadlock）：

| # | 條件 | 可接受寫法 |
|---|------|-----------|
| 1 | Mutual Exclusion | mutex, mutual exclusive, 互斥, 資源不可同時共享 |
| 2 | Hold and Wait | hold & wait, 持有等待, 持有並等待 |
| 3 | No Preemption | non-preemptive, no preempt, 不可搶佔, 不可搶奪, 不可中斷 |
| 4 | Circular Wait | circular waiting, 循環等待, 環形等待 |

## 給分規則

- 每個正確條件 1 分，滿分 4 分。
- 條件用詞不必完全精確，但語意必須對應到上述四者之一（依可接受寫法判斷）。
- 列出同一條件多次只算一次。
- 完全不相關的答案（如 process state、CPU scheduling 等）不給分。
- 非英文答案若語意正確仍給分（如中文、中英混用）。

## Reason 政策

- 滿分（4 分）→ reason 留空。
- 非滿分 → 簡述缺少或錯誤的條件。
- 0 分 → 簡述為何完全不符合。
