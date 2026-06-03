# Rubric: UNIX Inode Maximum File Size Calculation

## 題目
In a UNIX inode with 12 direct blocks and 1 single indirect block, assuming a block size of 8KB and address size of 4 bytes, calculate the maximum file size.

## 滿分：2 分

## 參考答案
- Direct: 12 × 8KB = 96KB
- Single Indirect: (8KB / 4B) × 8KB = 2048 × 8KB = 16,384KB = 16MB
- Total: 16,480KB ≈ 16.096MB = 96KB + 16MB

## 評分標準

### 2 分（完全正確）
- 答案正確（16,480KB / 16.096MB / 96KB+16MB / 16MB+96KB 或等價數值），且
- 計算過程正確（或答案本身已展示正確理解），包含：
  - Direct: 12 × 8KB = 96KB
  - Single Indirect: 8KB/4B = 2048 個 pointer → 2048 × 8KB = 16,384KB
  - Total 正確加總

### 1 分（部分正確）
- 答案本身正確（96KB+16MB 等），但缺少計算過程，或
- 計算邏輯大致正確但有小錯誤（如把 2048 算成 2048 但單位標錯、KB/MB 轉換有小誤差但方向對），或
- 只算對 direct 或 indirect 其中一部分，另一部分有誤

### 0 分（錯誤）
- 答案明顯錯誤（如 16GB、4MB、112KB、56 等），且計算邏輯無據
- 完全未展示對 inode 結構的理解
- 未作答或無關內容

## 注意事項
- 接受各種等價表示法：16,480KB / 16.096MB / 96KB+16MB / 16MB+96KB 等
- k/K 大小寫不拘
- KB/MB 單位不拘，只要數值對應正確
- 接受近似值（如 "約 16MB"、"roughly 16MB"），但需有正確的計算成分支撐
- 若僅寫 "16MB" 而無計算過程，視為不完整（缺少 96KB 部分且無過程證明理解），給 1 分
