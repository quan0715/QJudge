# Rubric：Page Table Entries 計算題

## 題目
A system has 32-bit addresses and 2 GB (2³¹) main memory where each page is 1 MB (2²⁰). How many entries of a page table will contain?

## 滿分
2 分

## 參考答案
- Each page = 1 MB = 2²⁰ bytes → offset bits = 20
- Page number bits = 32 − 20 = 12 bits
- Number of page table entries = 2¹² = **4096**

---

## 評分標準

| 分數 | 條件 |
|------|------|
| 2    | 答案正確（4096 或 2¹²），且有完整或合理的推導過程（offset 20 bits、page number 12 bits → 2¹²）|
| 1    | 答案正確（4096 或 2¹²）但缺乏推導過程；**或**推導過程正確但最終答案有小錯（如筆誤） |
| 0    | 答案錯誤且無正確推導；或空白/無關作答 |

## 備註
- 2 GB (2³¹) 的 main memory size 是題目多餘資訊（不影響 page table entries 數量），若學生使用此值計算而得出不同答案，以推導邏輯評分。
- 若學生以 physical memory bits（31 bits）做計算（2³¹ / 2²⁰ = 2¹¹ = 2048），推導邏輯自洽可給 1 分（混淆了 virtual/physical address space）。
- reason 政策：滿分（2 分）者 reason 留空；非滿分者必填 reason。
