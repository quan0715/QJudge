# Critical Section 三要件評分準則（滿分 3 分）

## 題目
Describe the three requirements that a solution to the Critical Section problem must satisfy to be considered correct.

## 參考答案
1. **Mutual Exclusion** — Only one process can be in the critical section at a time.
2. **Progress** — Selection of the next process to enter CS cannot be delayed indefinitely; processes outside CS cannot block others from entering.
3. **Bounded Waiting** — There is a bound/limit on the number of times other processes can enter before a waiting process is granted access (no starvation / finite waiting time).

## 評分規則

每項要件 **1 分**，共 3 分。項目名稱不要求逐字精確，但概念必須正確且實質描述到位。

### 1. Mutual Exclusion（互斥）— 1 分
- **給分標準**：明確表達「同一時間只有一個 process/thread 能在 CS 中」。
- **給 0.5 分**：僅列名稱無解釋，或解釋過於模糊（如「不能一起執行」）。
- **不給分**：概念錯誤或未提及。

### 2. Progress（進展）— 1 分
- **給分標準**：表達「不在 CS 內的 process 不能阻擋他人進入」或「當 CS 空閒時，必須在有限時間內選出下一個進入者」。
- **給 0.5 分**：僅列名稱無解釋，或解釋不完整（如只說「有 progress」）。
- **不給分**：概念錯誤或未提及。

### 3. Bounded Waiting（有限等待）— 1 分
- **給分標準**：表達「等待進入 CS 的時間是有限的」或「每個 process 不會無限期等待（no starvation）」或「最多等待 N-1 次」。
- **給 0.5 分**：僅列名稱無解釋，或解釋不完整（如只說「有限等待」未說明是針對什麼）。
- **不給分**：概念錯誤或未提及。

## 常見錯誤（不給分）
- 混淆為 deadlock 四條件（mutual exclusion, hold and wait, no preemption, circular wait）
- 混淆為 synchronization 機制（semaphore, lock, Peterson's solution, test-and-set）
- 混淆為 scheduling criteria（CPU utilization, throughput, turnaround time）
- 混淆為 priority inversion 相關概念
- 混淆為 memory allocation 條件
- 答案完全離題或空白

## 評語政策
- 滿分（3 分）：reason 留空。
- 非滿分（< 3 分）：reason 簡述扣分原因（如「缺少 Bounded Waiting」、「Progress 解釋錯誤」、「只列名稱無解釋」）。
