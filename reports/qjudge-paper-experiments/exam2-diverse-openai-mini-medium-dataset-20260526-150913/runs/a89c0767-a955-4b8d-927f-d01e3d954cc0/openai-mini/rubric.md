# 本題評分準則

- 滿分：2 分
- 題意重點：
  - 說明 cache coherence problem：同一份資料同時存在多個 cache 時，若其中一個 CPU/核心寫入，其他 cache 可能持有過時副本，造成不一致。
  - 寫入時的基本規則：系統需通知/廣播所有持有該 word 的 cache。
  - 若對方是 clean copy：可直接丟棄/invalid。
  - 若對方是 dirty copy：必須先 write-back 到 memory，或直接 transfer 給 writer，之後再繼續寫入。

## 配分建議
- 2 分：
  - 清楚說出 cache coherence 的不一致問題，且完整描述 clean / dirty 兩種處理規則。
- 1 分：
  - 有提到 cache 一致性、通知其他 cache、invalidate，或 clean/dirty 其中一半；但不完整或表述較模糊。
- 0 分：
  - 與題意無關、明顯錯誤，或幾乎沒有回答。

## 批改原則
- 只看作答內容，不看既有分數或評語。
- 若答題主要在講「多個 cache 的資料一致性」且有基本寫入處理方向，通常至少給 1 分。
- 若只回答非常泛泛的同步、快取、replication 等，未提 clean/dirty 或寫入規則，可給 0 或 1 分視完整度而定。
