# Rubric: Affinity Scheduling 對 Cache / TLB / Page Fault 的影響

**題目**：How does affinity scheduling impact cache misses, TLB misses, and page faults in a multiprocessor system?

**滿分**：3 分（三個面向各 1 分）

---

## 給分項目（各 1 分）

### A. Cache misses（1 分）
- 說明 affinity scheduling **減少** cache misses
- 原因：thread/process 留在同一 CPU，可重複利用該 CPU cache 中已有的資料

### B. TLB misses（1 分）
- 說明 affinity scheduling **減少** TLB misses
- 原因：TLB 是 per-CPU 的硬體資源，留在同一 CPU 可複用 TLB entries

### C. Page faults（1 分）
- 說明 affinity scheduling **不影響** page faults
- 原因：page faults 取決於 page 是否在 RAM（或 disk），而 multiprocessor 系統中 RAM 為所有 CPU 共享，與排程給哪個 CPU 無關

---

## 扣分原則

| 狀況 | 處理 |
|------|------|
| 該面向方向錯誤（例如說增加而非減少、或說會影響 page faults） | 該面向 0 分 |
| 該面向方向正確但缺乏解釋（僅說 reduce/no effect 而無理由） | 該面向 0.5 分（若 3 面向均只列結論無理由，總分最多 1.5） |
| 該面向方向正確且有合理簡短解釋 | 該面向 1 分 |
| 完全未提及該面向 | 該面向 0 分 |
| 答案空白或完全不相關 | 0 分 |

---

## Reason 政策
- 滿分（3 分）→ reason 留空
- 非滿分 → reason 必填，簡述扣分項目（例如「未解釋 page faults 不影響的原因」）
