# Rubric: Page Table Entries

## 題目摘要
- **題目**: A system has 32-bit addresses and 2 GB (2^31) main memory where each page is 1 MB (2^20). How many entries of a page table will contain?
- **滿分**: 2
- **參考答案**: 4096 (2^12)

## 核心概念
Page table 的 entry 數由 virtual address space 決定（非 physical memory）。
- 32-bit address，page size = 2^20 → offset = 20 bits
- page number bits = 32 - 20 = 12
- page table entries = 2^12 = 4096
- 題目中 2 GB main memory 為干擾資訊

## 評分標準

### 2 分（滿分）
- 答案為 **4096** 或 **2^12**（不論是否附計算過程）
- 答案為 **4K** / **4k** / **4K entries** / **4096 entries** / **2^12 entries**（4K 為 4096 的常見簡寫）
- 附正確計算過程（如 32-20=12, 2^12=4096 或 2^32/2^20=2^12=4096）且最終答案正確
- **滿分時 reason 留空**，除非有值得提出的觀察

### 1 分（部分正確）
- 數字概念正確（4096 / 2^12）但**單位錯誤**：
  - 寫成 "4KB"、"4 KB"、"4Kb"、"4Kbyte"（將 entries 誤寫為 bytes/bits）
- 計算過程正確但最終答案寫錯格式（如僅寫 "2^12" 而題目明顯要求數字時仍給滿分，此處指其他輕微瑕疵）
- 答案為 "4096 pages"（用詞 pages 而非 entries，但概念對）

### 0 分（錯誤）
- 答案為 **2048** / **2^11**（誤用 physical memory 2^31 計算：2^31/2^20 = 2^11）
- 答案僅給 bit 數（如 "12"、"21"）而非 entry 數
- 答案為其他數值：1024, 1048, 2000, 11098, 16, 1, 2^19, 2^21, 2^22, 2K, 12K, 4GB 等
- 計算過程完全錯誤或無關
