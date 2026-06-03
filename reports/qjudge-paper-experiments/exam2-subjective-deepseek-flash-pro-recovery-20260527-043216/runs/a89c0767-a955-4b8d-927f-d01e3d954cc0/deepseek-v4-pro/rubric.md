# Rubric: Cache Coherence Problem & Write Rules

**Question:** Explain the Cache Coherence problem and the basic rules a system must follow when a CPU wants to write a cached word.

**Max Score:** 2

---

## 評分項目（每項 1 分）

### Part A — Cache Coherence 問題解釋（1 分）
- 核心概念：同一筆記憶體資料存在於多個 CPU/cache 中（shared data / multiple copies），當其中一個 cache 修改該資料時，其他 cache 持有過時/不一致的副本（stale data），導致資料不一致（inconsistency）。
- 給分條件：有表達出「多個 cache 持有同一資料 → 寫入時會不一致」的核心概念即可。
- 常見缺失：只說「cache 之間要同步」但未說明為什麼會發生問題（multiple copies）；或完全沒提到 multiple caches / shared data。

### Part B — Write 時的基本規則（1 分）
- 必須涵蓋兩個子規則：
  1. **通知所有 cache**（inform/broadcast/notify all caches of the write request）
  2. 對持有副本的其他 cache 進行處理：
     - **Clean copy（未修改）**：直接丟棄（discard / invalidate）
     - **Dirty copy（已修改）**：先寫回記憶體（write back to memory）**或**直接傳給 writer（transfer to writer）
- 給分條件：兩個子規則都正確才給 1 分。漏掉一項給 0.5 分（但 score 只能是整數，故漏一項 → 0 分）。
- 常見缺失：只提到 discard clean / write-back dirty，但沒提到「要通知所有 cache」；或只說 invalidate 但沒區分 clean/dirty。

### Edge Cases
- Clean/dirty 規則寫反：Part B 不給分。
- 只回答其中一部分（如只解釋問題沒給規則，或只給規則沒解釋問題）：對應部分不給分。
- 回答與題目完全無關或空白/Skip：0 分。

---

## 評分速查
| 分數 | 條件 |
|------|------|
| 0 | 兩部分皆缺失或錯誤；無意義回答；Skip |
| 1 | 只有一部分正確（Part A 或 Part B） |
| 2 | Part A 與 Part B 皆正確完整 |
