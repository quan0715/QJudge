# 評分準則：Please briefly describe the Direct Memory Access (DMA)

- **滿分**: 2 分
- **題型**: short essay（英文作答或中英文混合均可）
- **評分維度**：

## 2 分（滿分）
同時滿足以下兩項：
1. **核心概念正確**：指出 DMA 是一種讓 device 不需 CPU 介入即可直接存取/傳輸資料到主記憶體的技術。
2. **延伸理解**：至少提及下列之一 —
   - 減少 CPU 使用率 (reduce CPU usage/utilization)
   - 提升系統效能 (improve system performance)
   - 適合大量資料傳輸 (large/bulk data transfer)
   - DMA controller 獨立運作，完成後中斷通知 CPU
   - 舉例硬碟/網卡/音效卡等具體 device

## 1 分
只說出核心概念（device 直接存取記憶體、不經 CPU），但未提及任何延伸理解或 benefit。

## 0 分
- 空白/只寫 "no"/"I don't know"
- 完全答非所問
- 描述明顯錯誤（如 DMA = direct memory allocation、bypasses stack 等）

## 評分原則
- reason 政策：滿分（2 分）→ reason 留空；非滿分（0 或 1 分）→ 必填 reason，簡短說明扣分原因。
- 不懲罰拼字或文法錯誤，只要語意可理解即可。
- 關鍵概念正確但表達不清 → 酌情給 1 分。
