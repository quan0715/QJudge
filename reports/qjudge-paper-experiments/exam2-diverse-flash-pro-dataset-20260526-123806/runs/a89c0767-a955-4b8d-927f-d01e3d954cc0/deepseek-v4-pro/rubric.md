# Cache Coherence — Short Answer Rubric

**滿分**: 2 分  
**題型**: short_answer

## 題目要求
Explain the Cache Coherence problem AND the basic rules a system must follow when a CPU wants to write a cached word.

## 評分維度（兩部分各佔 1 分）

### Part A: Cache Coherence Problem 說明（0-1 分）
- **1 分**: 清楚說明問題本質 — 同一筆資料存在多個 cache 中，當某 CPU 修改時導致其他 cache 持有過時/不一致的資料。
- **0.5 分**: 有觸及但表達模糊、不完整，或混雜錯誤概念。
- **0 分**: 未說明或完全錯誤。

### Part B: Write 時的 Basic Rules（0-1 分）
- **1 分**: 完整說明兩條規則：
  - Clean copy → discard（捨棄/丟棄/失效）
  - Dirty (modified) copy → write back to memory **或** transfer to writer
- **0.5 分**: 只說明其中一條規則，或規則大致正確但有明顯缺漏。
- **0 分**: 未說明或完全錯誤。

## 給分對照
| 分數 | 條件 |
|------|------|
| 2 | Part A 完整 + Part B 完整 |
| 1.5 | Part A 完整 + Part B 0.5，或 Part A 0.5 + Part B 完整 |
| 1 | Part A 完整 + Part B 0，或 Part A 0.5 + Part B 0.5，或 Part A 0 + Part B 完整 |
| 0.5 | Part A 0.5 + Part B 0，或 Part A 0 + Part B 0.5 |
| 0 | 完全離題、空白、Skip、或答案無關 |

## Reason 政策
- 滿分 (2) → reason 留空
- 非滿分 → 簡短說明扣分原因（指出哪部分不足）
