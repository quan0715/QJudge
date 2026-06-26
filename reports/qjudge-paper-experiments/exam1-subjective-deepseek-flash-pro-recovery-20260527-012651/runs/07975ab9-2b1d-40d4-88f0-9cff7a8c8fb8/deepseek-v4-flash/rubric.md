# Rubric: Aging in Priority Scheduling

## 基本資訊
- 題目：What is the "Aging" technique in priority scheduling, and what specific problem does it solve?
- 滿分：**2 分**
- 題型：short_answer

## 評分準則

### Part (a) — Aging 機制說明（1 分）
**核心要求**：必須提及 aging 會隨著時間提高等待中／低優先權 process 的 priority。
- 1 分：清楚描述 priority 隨等待時間增加而提升
- 0 分：未提及或描述錯誤（如說成降低 priority、或完全未說明 aging 是什麼）

### Part (b) — Aging 解決的問題（1 分）
**核心要求**：必須提及 starvation（飢餓）問題，即低優先權 process 可能永遠無法獲得 CPU。
- 1 分：明確指出 starvation（或等同描述如「低優先權 process 永遠無法執行」）
- 0 分：未提及 starvation 或描述錯誤（如說成 priority inversion、deadlock 等）

### 總分對照
| 分數 | 標準 |
|------|------|
| 2 | 正確說明 aging 提升 priority + 正確指出解決 starvation |
| 1 | 只答對其中一部分 |
| 0 | 兩部分皆錯誤、空白或完全離題 |

## reason 政策
- 滿分（2 分）→ reason 留空
- 非滿分（0 或 1）→ 必填 reason，簡述缺失
