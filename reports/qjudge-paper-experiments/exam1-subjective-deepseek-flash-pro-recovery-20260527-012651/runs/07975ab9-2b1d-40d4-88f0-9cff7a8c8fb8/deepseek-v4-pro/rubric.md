# Rubric: Aging in Priority Scheduling

**題目**: What is the 'Aging' technique in priority scheduling, and what specific problem does it solve?

**滿分**: 2 分

---

## 評分項目（各 1 分）

### (a) 定義 Aging（1 分）
- 核心要件：gradually increases the priority of processes/threads that have been waiting in the system for a long time
- 給分條件：清楚表達「隨著時間/等待時間增加，逐步提高 process/thread 的 priority」
- 不給分：未提及 priority 逐步提高（例如只說「避免 starvation」卻沒解釋 aging 是什麼）或描述錯誤

### (b) 指出解決的問題（1 分）
- 核心要件：Starvation（low-priority processes indefinitely blocked, never get to execute）
- 給分條件：明確指出 starvation（飢餓）問題，或清楚描述低優先權 process 永遠無法執行的狀況
- 不給分：未提及 starvation 或描述不相關的問題（如 priority inversion、deadlock 等）

---

## 評分速查

| 分數 | 條件 |
|------|------|
| 2/2 | 正確定義 Aging + 正確指出 Starvation |
| 1/2 | 僅正確回答其中一部分，或兩部分皆有但其中一部分有瑕疵 |
| 0/2 | 兩部分皆錯誤、無關、或未作答 |

---

## 常見扣分情形
- 只回答 starvation 而未解釋 aging → 至多 1/2
- 將 aging 描述為「降低 priority」或描述方向錯誤 → (a) 不給分
- 將解決的問題誤認為 priority inversion、deadlock、race condition → (b) 不給分
- 僅寫 "starvation" 一字無任何 aging 說明 → 0~1/2（視 starvation 是否被提及）
