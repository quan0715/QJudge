# 評分準則：Redundancy Types for Fault Tolerance

## 題目
Describe the three main types of redundancy used to achieve fault tolerance.

## 滿分：3 分（每種 type 1 分）

## 參考答案
1. **Information Redundancy**: Adding extra bits (like Hamming code) for error detection/recovery.
2. **Time Redundancy**: Performing computations multiple times to recover from transient faults.
3. **Space Redundancy**: Adding extra physical components to handle hardware failures.

## 評分標準

| 分數 | 標準 |
|------|------|
| **3** | 正確列出全部三種 type（Information、Time、Space）且附上合理描述（即使簡短，但概念正確） |
| **2** | 列出全部三種 type 但**完全無描述**（只列名稱）；或列出三種但部分描述有誤；或只列出兩種 type 且有合理描述 |
| **1** | 只列出 1 種正確 type；或列了三種但描述均錯誤／離題 |
| **0** | 未列出任何正確 type，或答案完全無關 |

## 描述合理與否判斷原則
- **Information Redundancy**: 應提及「額外資訊/位元/資料」用於「錯誤偵測/更正/復原」，如 checksum、parity、Hamming code。
- **Time Redundancy**: 應提及「額外時間/重新計算/重複執行」來應對「暫態錯誤/故障」，如 recovery block、checkpoint、retry。
- **Space Redundancy**: 應提及「額外硬體/資源/元件/備援」來處理故障，如 TMR、replication、voter。
- 若描述與 type 不對應（如將 checkpoint 歸給 space、將 voting 歸給 time），視為描述有誤。
