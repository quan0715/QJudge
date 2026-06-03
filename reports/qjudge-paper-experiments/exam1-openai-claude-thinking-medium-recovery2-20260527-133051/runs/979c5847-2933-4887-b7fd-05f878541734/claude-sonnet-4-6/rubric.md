# Rubric：Effective Memory Access Time (EAT) 計算題

## 題目
In a system with a TLB hit ratio of 85%, if TLB access time is 15ns and memory access time is 100ns, calculate the effective memory access time (EAT).

## 參考答案
EAT = 0.85 × (15 + 100) + 0.15 × (15 + 100 + 100)
    = 0.85 × 115 + 0.15 × 215
    = 97.75 + 32.25
    = **130 ns**

## 滿分：2 分

---

## 評分標準

| 分數 | 條件 |
|------|------|
| 2    | 公式正確（TLB hit：15+100；TLB miss：15+100+100），且最終答案 **130 ns** 正確。過程略有書寫瑕疵但邏輯無誤，仍給滿分。 |
| 1    | 公式結構大致正確（有區分 hit/miss 兩項），但計算過程有誤導致最終答案錯誤；或答案正確但過程說明不足（如只寫 130 ns 無任何過程）；或 miss 路徑少加一次 memory access（即只算 15+100+100 中的其中兩項），方向正確但不完整。 |
| 0    | 完全未作答、答非所問、公式根本錯誤（如未區分 hit/miss、或完全忽略 TLB 存取時間）、或僅列參數無計算。 |

## 關鍵檢查點
1. **TLB hit 路徑**：TLB access + 1 memory access = 15 + 100 = 115 ns
2. **TLB miss 路徑**：TLB access + 2 memory accesses = 15 + 100 + 100 = 215 ns
   - （第一次 memory access 取 page table，第二次取實際資料）
3. **加權**：0.85 × 115 + 0.15 × 215 = 97.75 + 32.25 = 130 ns
4. 答案若為 130 或 130ns 均接受
