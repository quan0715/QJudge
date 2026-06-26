# Rubric — Page Table Entries

## 題目
A system has 32-bit addresses and 2 GB (2^31) main memory where each page is 1 MB (2^20). How many entries of a page table will contain?

## 滿分：2 分

## 評分原則

| 分數 | 條件 | 範例正確答案 |
|------|------|-------------|
| **2 分** | 答案等於 4096 或等效表達（2^12、4K、4096 entries 等） | 4096, 2^12, 4K, 2^12 = 4096 entries |
| **1 分** | 答案為 2048 或 2^11（使用了 physical memory 2^31 而非 virtual address 2^32 來計算，但理解 page 概念） | 2048, 2^11, 2^(31-20) = 2048 |
| **0 分** | 其他錯誤答案（不含上述數值或其等效表達） | 2^19, 1024, 4GB, 12, 21, 2^21, 等 |

## 注意事項
- 單位誤寫（如「4KB」而非「4K entries」）不扣分，因多數學生以此簡寫表達「4096 個 entry」。
- 答案前後有額外說明文字不影響評分。
- 純數字或純數學表達式足以給分，不需完整句子。

## Reason 政策
- 滿分 (2 分) → reason 留空
- 非滿分 (0 或 1 分) → 必填 reason

## 參考答案推導
Page size = 1 MB = 2^20 bytes → offset bits = 20  
Address = 32 bits → page number bits = 32 − 20 = 12  
Page table entries = 2^12 = **4096**
