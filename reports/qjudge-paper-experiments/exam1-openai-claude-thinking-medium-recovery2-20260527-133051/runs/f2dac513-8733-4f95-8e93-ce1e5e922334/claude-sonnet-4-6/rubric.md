# Rubric — Demand Paging (Essay)

**題目：** Describe the concept of "demand paging" as a virtual memory implementation. Why is it commonly used?

**滿分：** 2 分

## 參考答案要點

1. **機制說明（What）**：Demand paging 只在頁面被存取且引發 page fault 時才將該頁載入記憶體，而非在程序啟動時載入所有頁面。
2. **優點 / 常用原因（Why）**：
   - 減少初始載入時間（faster startup）
   - 節省記憶體（不載入未使用的頁面）
   - 允許執行超過實體記憶體大小的程式

---

## 評分標準

| 分數 | 條件 |
|------|------|
| **2** | 同時說明「按需載入/page fault 觸發」機制 **且** 至少一個合理優點（減少載入時間 / 節省記憶體 / 支援大程式）。 |
| **1** | 僅說明機制**或**僅說明優點；或兩點都有但描述過於模糊、不完整。 |
| **0** | 完全偏離主題、空白、或說法明顯錯誤。 |

## 評分注意事項

- 用字不需與參考答案完全一致，只要概念正確即可。
- Page fault 可以用「缺頁」「page miss」「page not present」等同義表達。
- 原因只需答出一個合理優點即可得滿分（前提是機制也答對）。
- 滿分者 reason 留空；非滿分者必須填寫扣分原因。
