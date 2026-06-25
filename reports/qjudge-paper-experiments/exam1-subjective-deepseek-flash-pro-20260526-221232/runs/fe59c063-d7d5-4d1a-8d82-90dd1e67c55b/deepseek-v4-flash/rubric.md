# Rubric: Belady's Anomaly（滿分 2 分）

## 題目
Explain Belady's Anomaly in the context of page replacement algorithms. Which replacement algorithm has this anomaly?

## 滿分結構（2 parts × 1 分 = 2 分）

### Part (a) — 定義 Belady's Anomaly（1 分）
- **1 分**：清楚說明「allocating more page frames → more page faults（反直覺現象）」。
- **0.5 分**：概念大致正確但不夠精準（例如只說「page fault 增加」但未明確對應 frame 增加）。
- **0 分**：定義完全錯誤、無關，或空白。

### Part (b) — 指出有此 anomaly 的演算法（1 分）
- **1 分**：正確指出 **FIFO**（或同義的 **FCFS**、First-In-First-Out、First-Come-First-Serve）。
- **0 分**：錯誤演算法（LRU、LFU、SSTF、EDF、ESJ、PFF、local/global replacement 等），或未回答。

## 特殊原則
- 若學生以 FCFS 回答，視同 FIFO，給分。
- 若定義+演算法都正確 → 滿分 2 分（reason 留空）。
- 若非滿分 → 必填 reason，簡短說明扣分原因。
- 部分正確（例如定義對但演算法錯，或反之）→ 各別給分，reason 說明。
