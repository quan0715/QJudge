# Rubric：Compare Crossbar vs Omega Network Switches

## 題目
Compare the number of switches required for a crossbar network versus an Omega network for n CPUs and n memory modules.

## 滿分：2 分

## 配分方式（每子題 1 分）

### 1. Crossbar network（1 分）
- **正確答案：** n²（或 n^2、n*n、n 平方）
- **給分條件：** 明確寫出 n² 或等價表達（n^2, n×n, n 平方, O(n²) 等）。
- **不給分條件：**
  - 寫成 n（只寫 n）、2N、或其他錯誤數值。
  - 未提及或完全錯誤。

### 2. Omega network（1 分）
- **正確答案：** (n/2) log₂ n（或等價表達：(n/2) * log₂(n)、(n/2)*lg(n)、(n/2)*log₂ n、n/2 × log₂ n 等）
- **給分條件：** 正確寫出 (n/2) × log₂(n) 的型態。
  - log 的底數可以是 2、lg（CS 慣例底數 2）、或文字標明「以 2 為底」。
  - 若只寫 log(n) 未標底數，但 CS 語境下預設底數 2，仍可接受。
  - 若寫 O(n log n) / O((n/2)log₂(n)) 等漸進符號，只要能對應到正確公式即給分。
- **不給分條件：**
  - 寫成 ln(n)（自然對數，底數 e，非 log₂）。
  - 寫成 n/2 × log₂(n/2)（內部參數錯誤）。
  - 寫成 1/n × log₂(n) 或其他結構錯誤。
  - 寫成純 log(n) 缺少 n/2 因子（如 "about log(n)"）。
  - 完全錯誤或未提及。

### 特殊情況
- **交換答案：** 若兩個公式都對但配錯網路（如 crossbar 寫 Omega 公式、Omega 寫 crossbar 公式）→ 0 分（題目要求比較兩者，答非所問）。
- **僅有一邊正確：** 該邊給 1 分，另一邊 0 分。
