# Rubric：Belady's Anomaly

## 題目
Explain Belady's Anomaly in the context of page replacement algorithms. Which replacement algorithm has this anomaly?

## 滿分
2 分

## 參考解答
a. Belady's Anomaly 是指：增加 page frame 數量反而導致更多 page fault 的現象。  
b. FIFO 替換演算法具有此異常。原因是 FIFO 不考慮頁面的存取模式，即使某頁面未來還會被用到，也可能因進入最早而被替換。

---

## 評分標準

| 分數 | 條件 |
|------|------|
| **2** | 正確說明 Belady's Anomaly 的定義（增加 frame 數導致更多 page fault），**且**正確指出 FIFO 演算法具有此異常。 |
| **1** | 僅正確說明其中一項：(1) 只有正確定義，未或錯誤指出演算法；或 (2) 只有正確指出 FIFO，但未或錯誤解釋異常定義。部分說明但意義正確亦給 1 分。 |
| **0** | 完全錯誤、空白，或與題目無關。 |

## 評分細節說明
- 「增加 frame 數 → 更多 page fault」是核心概念，需明確表達。
- 演算法只有 FIFO 正確；答 LRU、OPT 等均不給此部分分數。
- 可接受略有不完整但核心概念正確的回答給 1 分。
- 滿分時 reason 可留空。
