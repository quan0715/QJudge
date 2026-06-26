# Rubric — TLB 短答題

## 題目
What is the primary purpose of the 'Translation Lookaside Buffer' (TLB) in a paging system?

## 滿分
2 分

## 參考答案
To speed up logical-to-physical address translation by caching frequently used page table entries, reducing the need for multiple memory accesses per reference.

---

## 評分標準

| 分數 | 條件 |
|------|------|
| 2 | 明確提及「加速邏輯→實體位址轉換」**且**說明機制為「快取（cache）常用的 page table entry」或「減少存取記憶體次數」（兩個核心概念皆到位） |
| 1 | 僅提及其中一個核心概念：<br>• 只說 TLB 加速位址轉換，但未說明 cache/page table entry 的機制；**或**<br>• 只說 TLB 是 cache / 快取 page table entry，但未連結到加速位址轉換的目的 |
| 0 | 概念錯誤、空白、與 TLB 無關，或僅抄寫關鍵字而無意義 |

## 評分要點
- 核心概念 A：目的為「加速邏輯對實體位址的轉換」（speed up address translation）。
- 核心概念 B：機制為「快取 page table entry（TLB hit 直接取得 frame number，避免多次記憶體存取）」。
- 不要求完美文法或精確術語；只要意義正確即給分。
- 滿分（2）→ reason 留空；非滿分 → 必填 reason。
