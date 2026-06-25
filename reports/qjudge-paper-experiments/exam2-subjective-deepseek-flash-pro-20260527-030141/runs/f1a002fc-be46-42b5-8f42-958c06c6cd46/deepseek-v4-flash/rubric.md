# 批改 rubric：Multiprocessor Operating Systems 三種基本架構

## 題目
What are the three basic architectural approaches for Multiprocessor Operating Systems?

## 滿分
3 分（每個 correct approach 得 1 分）

## 參考答案
1. Each CPU has its own Operating System.（每個 CPU 有自己的 OS）
2. Master-Slave Multiprocessors.（主從式多處理器，MS-MP）
3. Symmetric Multiprocessors (SMP).（對稱式多處理器）

## 評分標準

| 分數 | 條件 |
|------|------|
| 3 分 | 三種架構皆正確列出，名稱可略有差異但概念正確 |
| 2 分 | 只正確列出兩種架構，第三種缺失或明顯錯誤 |
| 1 分 | 只正確列出一種架構 |
| 0 分 | 完全未答出任何正確架構，或答案離題無關 |

## 給分指引

- **Approach 1 (Each CPU has its own OS)**：學生表述包含「each CPU/processor has its own OS」、「各自擁有自己的 OS」、「separate OS per CPU」等皆可視為正確。
- **Approach 2 (Master-Slave Multiprocessors)**：學生表述包含「Master-Slave」、「MS-MP」、「主從式」等皆可視為正確。
- **Approach 3 (Symmetric Multiprocessors / SMP)**：學生表述包含「Symmetric」、「SMP」、「對稱式」等皆可視為正確。
- 順序不拘，只要三種概念都明確出現即給滿分。
- 名稱拼寫小錯誤（如 "symmertric"、"mulitprocessor"）不扣分，仍算正確。
- 若學生只寫縮寫（如 MS-MP、SMP）且概念正確，視為正確。
- 若學生寫了第四種或多種架構但前三種正確，仍給滿分；不因多寫而扣分。
- 若答案完全離題（如談 memory architecture、UMA/NUMA、naming 等），給 0 分。

## Reason 政策
- 滿分（3 分）→ reason 留空（無需填寫原因）
- 未滿分（0-2 分）→ 必填 reason，簡述扣分原因
