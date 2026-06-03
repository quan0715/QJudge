# 評分標準

- 滿分：3 分
- 題目：說明 Internal Fragmentation 與 External Fragmentation 的差異，並指出 Paging 通常對應哪一種。

## 配分
1. **Internal Fragmentation 定義**（1 分）
   - 需說明：配置後的固定大小區塊內部有未被使用的空間。
2. **External Fragmentation 定義**（1 分）
   - 需說明：雖然總可用空間足夠，但空間分散、不連續，導致無法直接配置。
3. **Paging 的關聯**（1 分）
   - 正確答案：Paging 通常與 **Internal Fragmentation** 有關，常見於最後一頁未填滿。

## 可接受表述
- 文字不必完全一致，但需有正確概念。
- 若只提到「Paging 會造成內部碎片」但未解釋原因，可給 1 分（第 3 點）。
- 若兩種碎片定義互相混淆，則依正確部分給分。

## 扣分原則
- 少一個正確概念扣對應分數。
- 若將 Paging 說成 External Fragmentation，第三點不給分。
- 若答案過於空泛、只列名詞無解釋，視正確性酌量給 0–1 分。
