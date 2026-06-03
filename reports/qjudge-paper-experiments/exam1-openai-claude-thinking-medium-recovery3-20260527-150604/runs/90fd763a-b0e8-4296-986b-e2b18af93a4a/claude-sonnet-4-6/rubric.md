# Rubric: UNIX inode Maximum File Size Calculation

## 題目
In a UNIX inode with 12 direct blocks and 1 single indirect block, assuming a block size of 8KB and address size of 4 bytes, calculate the maximum file size.

## 滿分
2 分

## 參考答案
- Direct blocks: 12 × 8 KB = 96 KB
- Single indirect block: (8 KB / 4 B) × 8 KB = 2048 × 8 KB = 16,384 KB
- **Total = 96 KB + 16,384 KB = 16,480 KB（≈ 16.096 MB）**

---

## 評分標準

| 分數 | 條件 |
|------|------|
| 2 | 計算過程與結果均正確：direct = 96 KB、indirect entries = 2048、indirect data = 16,384 KB、total = 16,480 KB（或等值單位換算）。允許合理單位寫法差異（如以 MB 表示但數值正確）。 |
| 1 | 部分正確：計算步驟有一處錯誤或遺漏（如只算 direct 或只算 indirect、indirect entries 數錯但結果邏輯連貫、單位換算有小誤差但方法正確）。 |
| 0 | 完全錯誤、空白、或方法根本錯誤（如未使用 block size / address size 推導 indirect entries）。 |

## 評分重點
1. **Indirect entries 計算**：8 KB / 4 B = 2048 entries，此步驟是否正確。
2. **Direct 總量**：12 × 8 KB = 96 KB。
3. **Indirect 資料量**：2048 × 8 KB = 16,384 KB。
4. **加總**：96 + 16,384 = 16,480 KB（或等值）。
5. 若四個步驟全對 → 2 分；有一步錯或漏 → 1 分；方法/答案皆錯 → 0 分。
