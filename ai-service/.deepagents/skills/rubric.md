# Cache Coherence 題目評分標準

## 題目
"Explain the Cache Coherence problem and the basic rules a system must follow when a CPU wants to write a cached word."

## 滿分：2 分

### 評分維度
- **A（問題定義）**：多個 cache 副本 + 寫入造成不一致
- **B（寫入規則）**：通知所有持有者 + clean copy discard + dirty copy write-back/transfer

### 給分標準
- **2 分**：同時涵蓋 A 與 B
- **1 分**：只有部分正確（只涵蓋 A 或 B 其中之一，或兩者皆不完整）
- **0 分**：與題目無關、過於簡略、Skip、答非所問

### Reason 政策
- 滿分（2 分）→ reason 留空（除非有值得提供的改進建議）
- 非滿分（0 或 1 分）→ 必填 reason，說明遺漏了什麼
