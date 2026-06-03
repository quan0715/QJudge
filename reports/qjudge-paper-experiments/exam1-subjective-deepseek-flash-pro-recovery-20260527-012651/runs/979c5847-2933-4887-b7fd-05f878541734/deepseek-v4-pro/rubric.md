# Rubric: TLB Effective Memory Access Time (EAT)

**題目**: In a system with a TLB hit ratio of 85%, if TLB access time is 15ns and memory access time is 100ns, calculate the effective memory access time (EAT).

**滿分**: 2

**參考答案**: EAT = 0.85 * (15 + 100) + 0.15 * (15 + 100 + 100) = 0.85 * 115 + 0.15 * 215 = 97.75 + 32.25 = 130ns

## 評分標準

### 2 分 (滿分)
- 最終答案正確（130ns，含單位或無單位均可接受，如 130、130ns、130 ns、130.00ns）
- 公式與計算過程正確，或至少可確認得出了正確數值結果
- 使用等價的替代公式得出正確答案亦可（如 EAT = TLB + Mem + miss_rate * Mem = 130ns）

### 1 分 (部分正確)
- 公式/方法正確但最終數值計算有誤（如 130.22、131.5）
- 公式正確但未算出最終數值答案
- 加權平均架構正確但 miss path 漏計 TLB access time（得出 127.75）

### 0 分 (錯誤)
- 公式或方法根本錯誤（如漏計 memory access、權重錯誤、僅回傳部分時間）
- 答案明顯偏離 130ns 且無合理推導
- 僅回答 TLB access time 或 memory access time 而非 EAT
- 無意義答案或完全不相關

## Reason 政策
- 滿分 (2 分)：reason 留空
- 非滿分 (1 或 0 分)：必須填寫 reason，簡述扣分依據
