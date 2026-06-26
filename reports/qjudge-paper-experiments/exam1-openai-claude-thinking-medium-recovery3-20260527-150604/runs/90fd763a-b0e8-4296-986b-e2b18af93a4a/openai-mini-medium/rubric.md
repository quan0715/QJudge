# 批改準則：UNIX inode 最大檔案大小

- 題目滿分：2 分
- 題意重點：12 個 direct blocks + 1 個 single indirect block，block size = 8KB，address size = 4 bytes。

## 標準計算
- Direct blocks：12 × 8KB = 96KB
- Single indirect：8KB / 4B = 2048 個位址
- Single indirect 可指向資料區塊：2048 × 8KB = 16,384KB
- 總和：16,480KB
- 等價表示：約 16.096MB

## 給分原則
- 2 分：
  - 算出正確總容量 16,480KB，或等價正確答案（可用 KB / MB / bytes 表示）。
  - 若有簡短文字說明但結論正確，仍給滿分。
- 1 分：
  - 觀念大致正確，但計算有小錯誤、單位換算不精確、或只算出部分容量。
  - 例如只算 direct / single indirect 其中一部分，或總和差一點。
- 0 分：
  - 公式概念錯誤、把 double indirect 等不存在的層級算進去、或答案與題意無關。

## 常見可接受寫法
- 16480KB
- 16,480 KB
- 約 16.1MB
- 96KB + 16,384KB = 16,480KB

## 注意
- 以題目給的 8KB、4B 為準。
- 若答案只寫最終數字且正確，可直接給滿分。
