# 評分準則：Cache Coherence 與寫入規則

- 題目滿分：2 分
- 核心要求：
  - 說明 cache coherence 是什麼：多個 cache/CPU 持有同一資料副本時，寫入會造成資料不一致，需維持一致性。
  - 說明 CPU 要寫入 cached word 時的基本規則：系統需通知其他 caches；
    - clean copy：可直接丟棄 / invalidate
    - dirty( modified ) copy：需先 write-back 到 memory，或直接把修改過的副本轉給 writer

## 給分標準

- 2 分：
  - 同時說明「問題本質」與「寫入時的基本處理規則」，且 clean / dirty 的處理大致正確。
- 1 分：
  - 有提到 cache coherence / 多個 cache 一致性問題，但寫入規則不完整、只有部分正確，或描述過於籠統。
  - 或有提到 clean / dirty 處理，但沒有清楚說明這是在解 cache coherence 問題。
- 0 分：
  - 明顯離題、只寫非常零碎片段、或內容與 cache coherence / 寫入規則無關。

## 批改原則

- 以答案是否正確傳達概念為主，不要求完全同字。
- 英文、中文混用可接受。
- 若把 dirty copy 說成要先寫回 memory / 轉交 writer，視為正確。
- 若只說「通知其他 cache / invalidate」但未提 clean/dirty 的差異，通常給 1 分。
- 若只提 cache 一致性但沒有寫入規則，通常給 1 分。
- 明顯錯誤如「清除所有 cache 後再寫」、「與 cache size/容量無關」等，扣分。