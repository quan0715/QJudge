# Rubric: Master-Slave Architecture for Multiprocessors

**滿分：4 分**（兩個優點各 1 分 + 兩個缺點各 1 分）

## 評分原則

- 每提供一個正確且有說明的 advantage → 1 分（最多 2 分）
- 每提供一個正確且有說明的 disadvantage → 1 分（最多 2 分）
- 若學生列出超過兩個同類別答案，取最好的兩個計分
- 僅有標籤而無任何說明（如只寫 "simple" 無上下文）→ 該點 0.5 分
- 方向正確但表述模糊者 → 該點 0.5 分
- 完全錯誤或不相關 → 該點 0 分

## 可接受的 Advantage 答案（擇二給分）

1. **Easy to design / manage / implement**（設計管理簡單）
   - 理由：只需 programming/monitoring master processor；single OS copy
2. **Efficient resource allocation / load balancing**（資源分配有效率 / 負載平衡）
   - 理由：master 統一分配任務給 slave，無 unbalanced workload
3. 其他合理且正確說明者亦可

## 可接受的 Disadvantage 答案（擇二給分）

1. **Limited scalability / performance bottleneck**（擴展性受限 / master 成效能瓶頸）
   - 理由：效能取決於 master，slave 增加時 master 負擔過重
2. **Single point of failure**（單點故障）
   - 理由：master 故障導致整個系統癱瘓
3. 其他合理且正確說明者亦可

## Reason 政策

- 滿分（4 分）→ reason 留空，除非有值得給的改進建議
- 非滿分 → 必填 reason，簡述扣分點（如「缺點只寫一個，-1」、「advantage 無說明，-0.5」）
