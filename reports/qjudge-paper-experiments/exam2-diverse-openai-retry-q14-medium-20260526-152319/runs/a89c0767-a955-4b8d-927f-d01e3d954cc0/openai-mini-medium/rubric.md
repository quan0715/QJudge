# 批改準則

## 題目重點
- 說明 Cache Coherence（快取一致性）問題：同一記憶位置可能被多個 cache 同時持有副本，寫入時必須避免各 cache 內容不一致。
- 寫入 cached word 的基本規則：
  - 若同一資料有多個 cache 副本，系統必須通知所有 cache 有寫入請求。
  - 若某 cache 持有 clean copy，可直接丟棄該副本。
  - 若某 cache 持有 dirty/modified copy，必須先寫回 memory，或將修改過的內容直接轉給 writer，之後才可繼續寫入。

## 配分建議（滿分 2 分）
- 2 分：
  - 清楚說明 cache coherence 的核心概念，且
  - 有提到寫入時需通知其他 caches / invalidation / 協調多份副本，並
  - 有提到 dirty copy 需 write-back 或 transfer，clean copy 可丟棄。
- 1 分：
  - 有抓到 cache coherence 或多 cache 一致性的概念，但敘述不完整；或
  - 只提到部分寫入規則（例如只說要通知其他 cache、或只說 dirty copy 要寫回）。
- 0 分：
  - 未回答題意、內容明顯無關，或只有極少量片段且無法看出理解。

## 批改原則
- 以題意是否被完整涵蓋為主，不要求逐字一致。
- 有同義描述可視為正確，例如：
  - invalidate / discard / remove clean copy
  - write back / flush dirty copy
  - transfer modified data directly to writer
- 若答案只泛談快取、記憶體效能、命中率，而未碰到一致性與寫入規則，分數偏低。
- 若答案提到 coherence 但混淆成 cache miss、replacement、或一般同步機制，需扣分。
