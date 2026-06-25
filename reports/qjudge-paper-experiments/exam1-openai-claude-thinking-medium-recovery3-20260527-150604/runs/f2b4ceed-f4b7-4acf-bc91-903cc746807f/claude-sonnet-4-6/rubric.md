# Rubric — Internal vs External Fragmentation (max_score: 3)

## 題目
Explain the difference between 'Internal Fragmentation' and 'External Fragmentation'. Which one is typically associated with the Paging memory management scheme?

## 參考答案
- a. Internal Fragmentation：在已分配的固定大小區塊內，有未使用的記憶體空間。
- b. External Fragmentation：總可用記憶體足夠，但不連續（碎片化），無法分配給需要連續空間的請求。
- c. Paging 與 Internal Fragmentation 相關（最後一頁可能未完全使用）。

---

## 評分細則

| 得分 | 條件 |
|------|------|
| 3    | 正確說明 Internal Fragmentation、External Fragmentation 兩者定義，**且**正確指出 Paging 對應 Internal Fragmentation |
| 2    | 兩個定義皆正確，但未提及或誤答 Paging 對應哪種碎片；或定義有一項輕微不精確但 Paging 答對 |
| 1    | 僅正確說明其中一個定義，Paging 部分答錯/缺漏；或兩個定義都模糊但有基本概念 |
| 0    | 完全錯誤、空白、或內容完全無關 |

## 給分原則
- Internal Fragmentation 關鍵詞：fixed-size block、unused memory within allocated block、內部未用空間。
- External Fragmentation 關鍵詞：free memory not contiguous、scattered free blocks、外部零散空間。
- Paging 答案：必須點名 Internal Fragmentation（last page / page frame 未被完全填滿）。
- 答 External Fragmentation 對應 Paging 者，該部分不給分。
- 滿分（3 分）→ reason 可留空。
