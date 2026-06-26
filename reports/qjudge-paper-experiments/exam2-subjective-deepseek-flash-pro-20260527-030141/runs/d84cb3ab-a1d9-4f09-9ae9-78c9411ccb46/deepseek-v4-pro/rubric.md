# Rubric: Describe the three main types of redundancy used to achieve fault tolerance.

**Max score: 3（每種 redundancy 正確命名 + 有意義描述得 1 分）**

## 評分要點

| # | Type | 得分條件 |
|---|------|----------|
| 1 | Information Redundancy | 提及「增加額外資訊/bit」用於 error detection 或 recovery（例：Hamming code, parity, checksum, ECC） |
| 2 | Time Redundancy | 提及「重複執行/多次計算/retry/recovery block/checkpoint」來應對 transient fault |
| 3 | Space Redundancy | 提及「增加額外硬體/資源/replication/voting/TMR」來應對硬體故障 |

## 給分原則

- 每項 **命名正確 + 描述合理** → 1 分
- 僅列出名稱而無描述 → 該項不給分（0 分）
- 名稱有誤但描述內容正確（例：把 space 講成 resource redundancy）→ 酌情給 0.5 分
- 三項全錯或完全無法辨識 → 0 分
- 滿分（3 分）→ reason 留空；非滿分 → 必填 reason 簡述扣分依據
