# Rubric: Cache Coherence Problem (max_score=2)

## 題目
Explain the Cache Coherence problem and the basic rules a system must follow when a CPU wants to write a cached word.

## 參考答案
When a CPU wants to write a word which is in more than one cache, the system must inform all caches of the write request. If a cache has a clean copy, it can just discard the copy. If a cache has a "dirty" (modified) copy, the cache must either write the modified copy back to the memory before the write request can proceed or transfer the modified copy to the writer directly.

## 評分項目（共 2 分）

### Part A: Cache Coherence Problem 解釋（1 分）
- 核心概念：同一筆資料存在於多個 cache 中，當某個 CPU 寫入/修改該資料時，會造成不同 cache 之間的資料不一致（inconsistency / stale data）。
- 只要清楚表達「多 cache 共享資料 + 寫入導致不一致」即可給分。
- 若僅提到「cache 需一致」但未說明「為何會不一致」或「不一致的後果」→ 0.5 分。
- 若完全未提及或解釋錯誤 → 0 分。

### Part B: 寫入時的基本規則（1 分）
必須涵蓋三個要點：
1. 系統必須通知所有持有該資料的 cache（inform / broadcast / notify all caches）
2. Clean copy → 直接丟棄（discard / invalidate）
3. Dirty (modified) copy → 寫回 memory 或直接傳給 writer（write-back or transfer to writer）

- 三點全部正確 → 1 分
- 缺一點或部分錯誤 → 0.5 分
- 缺兩點以上或全錯 → 0 分

## 評分總表
| 分數 | 條件 |
|------|------|
| 2/2 | Part A 正確 + Part B 正確（三點齊全） |
| 1.5/2 | Part A 正確 + Part B 部分正確，或 Part A 部分正確 + Part B 正確 |
| 1/2 | 僅 Part A 正確 或 僅 Part B 正確（另一部分明顯不足或缺失） |
| 0.5/2 | Part A 或 Part B 僅有模糊/部分提及，另一部分缺失 |
| 0/2 | 完全離題、空白、或內容與 Cache Coherence 無關 |

## 其他注意事項
- 若學生僅回答 Part A 或僅回答 Part B，依上述分項給分。
- 跳過（Skip）或無關回答 → 0/2。
- 概念正確但用詞不精確（如把 dirty 說成 modified、把 discard 說成 invalidate）不扣分。
- 中英文混用不影響評分。
