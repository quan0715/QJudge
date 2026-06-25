# Rubric: Crossbar vs Omega Network Switches

## 題目
Compare the number of switches required for a crossbar network versus an Omega network for n CPUs and n memory modules.

## 滿分：2 分

## 參考答案
- Crossbar network: n^2 switches
- Omega network: (n/2) log2(n) switches

## 評分準則

### Crossbar（1 分）
- 正確寫出 n^2（或 n*n、n squared 等同意義表述）→ 得 1 分
- 寫錯（如 n、2N、O(n)、常數等）→ 0 分

### Omega（1 分）
- 正確寫出 (n/2) × log2(n) 或其等價形式（如 n/2 * log2 n、n/2 * log n 但標明底數為 2、n/2 * lg n、0.5n log2 n 等）→ 得 1 分
- 僅寫 n/2 或僅寫 log n 而缺另一半 → 0 分
- 公式明顯錯誤（如 1/n * log2(n)、log(n) only、2 log n 等）→ 0 分
- log 未標底數但寫成 lg n → 預設理解為 log2，給分
- log 未標底數僅寫 log n → 在網路結構上下文中視為 log2，給分

### 總分計算
- 兩者皆正確 → 2 分
- 僅一者正確 → 1 分
- 兩者皆錯 → 0 分

### 備註
- 大小寫 N/n 混用不扣分（視為同一變數）
- 附加額外說明（如 blocking/non-blocking、成本比較）不影響評分，除非這些說明本身有誤且改變了對公式的理解
- reason 政策：滿分（2 分）→ reason 留空；非滿分 → 必填 reason，簡述扣分原因
