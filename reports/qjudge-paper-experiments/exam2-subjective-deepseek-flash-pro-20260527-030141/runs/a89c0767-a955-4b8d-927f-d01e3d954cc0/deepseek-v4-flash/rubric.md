# Rubric — Cache Coherence Problem & Basic Write Rules

**滿分：2 分**

## 配分 (1+1)

### 1 分 — 解釋 Cache Coherence Problem
- 指出當多個 CPU/cache 保有同一份資料的副本時，若某個 CPU 寫入，其他副本會不一致/過時。
- 需點出「多副本」、「寫入造成不一致」的核心概念。

**0 分**：未提及或多處錯誤；**0.5 分**：概念模糊但方向對；**1 分**：清楚正確。

### 1 分 — 說明 write a cached word 的基本規則
需涵蓋以下兩個情境（參考答案）：
- **clean copy**（未修改的副本）：可直接 discard / 捨棄。
- **dirty (modified) copy**（已修改的副本）：必須先 write back 回 memory，或 transfer 給要寫入的 CPU/writer。

**0 分**：未提及或錯誤；**0.5 分**：只講對一個情境（如只提 clean 或只提 dirty）；**1 分**：兩個情境都清楚說明。

## 評分政策 (reason)
- **滿分 (2 分)**：reason 留空（除非有值得給的改進建議）。
- **非滿分**：reason 必填，簡述缺失。
- 用分數區間 0、0.5、1、1.5、2。
