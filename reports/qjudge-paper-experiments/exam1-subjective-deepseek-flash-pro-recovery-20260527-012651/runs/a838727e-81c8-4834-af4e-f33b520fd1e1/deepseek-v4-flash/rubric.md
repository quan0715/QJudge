# Rubric: Difference Between Mode Switch and Context Switch

**Question**: What is the difference between a mode switch and a context switch?
**Max Score**: 2 分
**Question Type**: short_answer

## Reference Answer

- **Mode switch**: change CPU execution mode from one privilege level to another, e.g., user → kernel via a trap or system call.
- **Context switch**: save one process' execution context & restore that of another process.

## Scoring Criteria (2 分滿分)

| Score | Criteria |
|-------|----------|
| **2** | 兩個定義皆正確且完整。Mode switch：說明是 CPU privilege level 切換（user ↔ kernel），通常透過 trap/system call。Context switch：說明是 process/thread 間的切換，涉及保存/恢復執行上下文。 |
| **1** | 其中一個定義正確完整，另一個模糊、不完整或有小錯誤；或兩個都僅部分正確。 |
| **0** | 兩個定義皆明顯錯誤、空白、或完全不相關。 |

## Reason Policy
- 滿分（2 分）→ reason 留空（除非有值得給的改進建議）
- 非滿分（0 或 1 分）→ 必填 reason，簡短說明扣分依據
