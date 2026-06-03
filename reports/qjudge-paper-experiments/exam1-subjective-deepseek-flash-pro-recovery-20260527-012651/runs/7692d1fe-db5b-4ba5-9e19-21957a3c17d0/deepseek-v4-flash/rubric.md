# Rubric: Critical Section Problem 三大需求

**題目：** Describe the three requirements that a solution to the Critical Section problem must satisfy to be considered correct.

**滿分：** 3 分（每個需求 1 分）

## 三個正確需求

### 1. Mutual Exclusion（互斥）— 1 分
- 同一時間最多只能有一個 process/thread 在 critical section 中。
- 常見關鍵字：mutual exclusion / 互斥 / only one / at most one / 同時只能一個

### 2. Progress（推展／前進）— 1 分
- 如果沒有 process 在 critical section 中，則必須在有限的時間內決定哪一個 process 可以進入 critical section；不在 CS 中的 process 不能阻擋其他 process 進入 CS。
- 常見關鍵字：progress / 前進 / 不能阻擋 / finite time / 有限時間內決定

### 3. Bounded Waiting（有限等待）— 1 分
- 當一個 process 請求進入 critical section 後，在它被允許進入之前，其他 process 最多只能進入有限次數（不能無限期等待）。
- 常見關鍵字：bounded waiting / 有限等待 / no starvation / 不能無限等待 / 有上限

## 給分原則

- **每說對一個需求（命名 + 大致描述正確）得 1 分**，共 3 分。
- **只列名稱未描述或描述完全錯誤**：該項給 0 分。
- **描述模糊但方向正確**（例如只寫出「不能同時有兩個進入」但未講明 mutual exclusion 名稱）：可給 0.5 分，但建議仍盡量以 0 或 1 為單位評分。
- **完全答非所問**（例如講到 priority inversion、deadlock、lock 實作細節等 CS 以外主題）：0 分。
- **滿分（3 分）→ reason 留空**；**非滿分 → 必填 reason**，簡述缺少或錯誤的項目。
