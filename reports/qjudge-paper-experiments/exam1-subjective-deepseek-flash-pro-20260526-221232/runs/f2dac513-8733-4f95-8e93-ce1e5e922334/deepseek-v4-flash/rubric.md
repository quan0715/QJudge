# Demand Paging — 評分準則

## 題目
Describe the concept of "demand paging" as a virtual memory implementation. Why is it commonly used?

## 滿分：2 分

## 評分面向

### 核心概念（佔 ~1 分）
正確說明 demand paging 是：
- 只有當 process 需要某個 page 時（發生 page fault / referenced），才將該 page 從 disk 載入 memory
- **不是**在 process 啟動時就把所有 pages 一次載入

### 常用原因（佔 ~1 分）
至少提到以下任一理由（合理即可）：
- 節省 memory 空間（不載入未使用的 pages）
- 縮短 initial load time / process 啟動更快
- 允許 logical address space 大於 physical memory
- 讓更多 process 能同時執行（提高多工）
- 提升 memory 利用效率

## 給分標準

| 分數 | 標準 |
|------|------|
| **2** | 正確解釋 demand paging 概念（按需載入）**且**至少給出一個合理的常用原因 |
| **1** | 只有概念正確但原因缺失/錯誤，或概念模糊但原因合理，或只觸及技術細節（如 valid/invalid bit）卻未說明本質 |
| **0** | 完全答錯、離題、空白、只抄題目、或內容完全不正確 |

## 備註
- 僅提到 valid/invalid bit、TLB、page table 等實作機制但未解釋「按需載入」本質 → 不算概念正確
- 英文/中文皆可，語法錯誤不扣分，意思對即可
- reason 政策：滿分（2 分）reason 留空；非滿分必填 reason
