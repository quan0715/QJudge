# Rubric: Multilevel Feedback Queue Scheduling Parameters

**滿分**: 3 分  
**評分方式**: 計點制，每列出一個正確參數得 1 分，上限 3 分。

## 正確參數（5 選 N，任列即得分）

1. **Number of queues** — queue 的數量 / 有幾層 queue
2. **Scheduling algorithm for each queue** — 每個 queue 各自的排程演算法
3. **Method to determine when to upgrade a process** — 決定何時將 process 升級到更高優先權 queue 的方法/條件
4. **Method to determine when to demote a process** — 決定何時將 process 降級到較低優先權 queue 的方法/條件
5. **Method to determine which queue a process enters initially** — 決定新 process 進入哪個 queue 的方法

## 給分規則

| 狀況 | 分數 |
|------|------|
| 列出 3+ 個正確且不重複的參數 | 3 |
| 列出 2 個正確參數 | 2 |
| 列出 1 個正確參數 | 1 |
| 完全錯誤 / 答非所問 / 無關內容 | 0 |

## 判定細則

- **不給分**的項目（非 MLFQ 參數）：
  - queue size / queue 大小
  - time quantum（屬 RR 參數，非 MLFQ 參數本身）
  - priority 本身（MLFQ 用 queue level 代表 priority，但"priority"不是獨立參數）
  - throughput / CPU utilization / data size / page fault 等排程指標或不相關概念
  - context switch 頻率
  - process size
  - 各 level 能等待的任務數量
  - 「queue 的順序」
  - 「初始狀態」（太模糊，需指明是進入哪個 queue）
  
- **同義詞合併**：upgrade = promote = 升級 = 提升優先權；demote = downgrade = 降級。同一參數的不同表述只計一次。
- **中英文混用**：只要語意正確即給分。
- **拼字錯誤**：不影響辨認即不扣分（如 "quene" → queue、"alogrithm" → algorithm）。

## Reason 政策

- 滿分 (3 分)：reason 留空
- 非滿分：簡述缺少或錯誤的參數
