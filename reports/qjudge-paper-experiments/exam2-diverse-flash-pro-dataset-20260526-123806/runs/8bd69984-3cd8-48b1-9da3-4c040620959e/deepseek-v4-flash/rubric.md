# 評分準則：Master-Slave Architecture for Multiprocessors

## 題目
Provide two advantages and two disadvantages of a Master-Slave architecture for multiprocessors.

## 滿分：4 分

## 配分方式（各 1 分 × 4 項）

| 項目 | 滿分 | 給分條件 | 部分給分 (0.5) |
|------|------|----------|----------------|
| **Advantage 1: 簡單設計/管理** | 1 | 明確指出架構簡單、容易設計/實作/管理（如：只需維護 master、single OS copy） | 僅提及「簡單」但未具體說明 |
| **Advantage 2: 有效資源分配/負載平衡** | 1 | 明確指出 master 統一分配任務、資源使用效率高、避免 workload 不均 | 僅提及「resource allocation」但未說明 |
| **Disadvantage 1: 擴展性限制/瓶頸** | 1 | 明確指出 master 成為效能瓶頸、擴展性受限、slave 增加時效能下降 | 僅提及 bottleneck 但未說明原因或影響 |
| **Disadvantage 2: 單點故障** | 1 | 明確指出 master 故障會導致整個系統故障/癱瘓 | 僅提及 single point of failure 但未說明後果 |

## 評分原則
- 每個項目獨立給分，可給 0 / 0.5 / 1 分。
- 用語不拘中英文，只要意思正確即可。
- 如果該項目完全未提及或內容錯誤 → 0 分。
- 如果學生寫了超過 2 個 advantages 或 2 個 disadvantages，只取前兩個合理者計分。
- 如果學生把 advantage 寫成 disadvantage（或反過來），該項不給分。
- **reason 政策**：滿分（得 4 分）→ reason 留空。未滿分 → 必填 reason 說明扣分原因。
