# Belady's Anomaly 評分準則 (滿分 2 分)

## 題目要求（兩部分）
1. **定義 Belady's Anomaly**：在 page replacement 中，增加 page frame 數量反而導致 page fault 次數增加的反直覺現象。
2. **指出哪個演算法有此異常**：FIFO（First-In-First-Out）或 FCFS（First-Come-First-Serve，與 FIFO 等價）。

## 評分規則

| 分數 | 條件 |
|------|------|
| **2** | 兩部分皆正確。定義清楚（提到「增加 frame 數量 → page fault 增加」），且正確指出 FIFO / FCFS。 |
| **1** | 僅一部分正確（如定義正確但演算法錯誤/未回答；或演算法正確但定義明顯錯誤/過於模糊/未回答）。定義僅部分正確（如未明確提到反直覺性，但意思接近）亦屬此級。 |
| **0** | 兩部分皆錯誤，或回答完全離題、無意義、未回答。 |

## 細節判斷
- **FIFO / FCFS 視為相同答案**，皆給分。
- 演算法部分若答 **LRU、Optimal、Clock、Second-Chance、PFF、Global/Local replacement、EDF、ESJ、ESTF、SSTF、Priority Inversion、Stack algorithm** 等非 FIFO 的答案 → 演算法部分錯誤。
- 定義部分若混淆 Belady's Anomaly 與其他概念（如 thrashing、internal fragmentation、working set、page size 等）→ 定義部分錯誤。
- 若學生僅回答「FIFO」或僅回答定義但未完整回答另一部分 → 1 分。
- 若學生回答定義完全錯誤且演算法也錯誤 → 0 分。
