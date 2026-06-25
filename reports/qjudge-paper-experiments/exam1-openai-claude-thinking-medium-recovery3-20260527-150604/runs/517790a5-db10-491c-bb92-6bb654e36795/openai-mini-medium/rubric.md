# 批改準則

- 題目：32-bit 位址、主記憶體 2 GB、page size 1 MB，求 page table entries 數量。
- 滿分：2 分

## 參考作法
- 1 MB = 2^20 bytes，所以 page offset 需要 20 bits。
- 32-bit address 去掉 offset 後，page number 共有 32 - 20 = 12 bits。
- page table 最多需要 2^12 = 4096 entries。

## 給分規則
- 2 分：答案正確指出 page size 對應 20-bit offset，並算出 2^12 = 4096 entries。
- 1 分：有正確觀念但計算有小錯，或只算出 12-bit page number / 4096 entries 其中一部分。
- 0 分：未掌握 page size 與 page number 的關係，或答案明顯不符。

## 補充
- 若學生寫出等價表述，例如「2 GB main memory 不影響 entries 數，entries 由 address 與 page size 決定」，可視為正確。
- 以最終答案為準；若推導正確但最後數字錯，依錯誤程度給 1 或 0 分。