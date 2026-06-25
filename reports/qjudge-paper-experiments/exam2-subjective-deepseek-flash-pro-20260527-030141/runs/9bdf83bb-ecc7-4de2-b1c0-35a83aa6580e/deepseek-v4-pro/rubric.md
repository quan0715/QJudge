# Rubric: MP vs CMP Differences

**題目**: Identify two major differences between a traditional Multiprocessor (MP) and a Chip-level Multiprocessor (CMP).

**滿分**: 2 分（每個正確且明確的差異 1 分）

---

## 參考答案涵蓋的兩個核心差異

1. **Shared L2 Cache / Greedy Core 問題**  
   CMP 共享 L2 cache，若有 greedy core 佔用大量 cache 空間，會拖累其他 core 的效能；傳統 MP 無此問題（各處理器 cache 獨立）。

2. **Failure Propagation（故障蔓延）**  
   CMP 的所有 CPU 緊密整合在同一晶片上，共享元件故障可能導致多個 CPU 同時停擺；傳統 MP 的各處理器較獨立，不會互相拖累。

---

## 評分準則

- **2 分**：清楚寫出兩個正確、有實質內容且互不重疊的差異。
- **1 分**：只寫出一個正確且清楚的差異；或兩個差異中有一個過於模糊/不完整/錯誤。
- **0 分**：未作答、完全錯誤、過於空泛無法辨識出任何有效差異。

---

## 可接受的差異類別（不限於參考答案兩點）

除參考答案外，以下面向若清楚陳述亦可得分：

| 面向 | 可接受說法舉例 |
|------|---------------|
| Cache 共享 | CMP 共享 L2 cache，greedy core 會影響他人；MP 無共用 L2 cache |
| 故障蔓延 | CMP 緊密整合，共享元件壞掉會拖垮多個 CPU；MP 不會 |
| 擴充性 (Scalability) | MP 擴充容易（加 bus controller 即可）；CMP 受限於晶片空間/散熱 |
| 架構/連接方式 | MP 透過 shared bus 連接多處理器；CMP 將多處理器整合在單一晶片上 |
| 傳輸延遲 | CMP 晶片內通訊延遲較低；MP 透過外部 bus 延遲較高 |

## 不給分情況

- 只寫類別名稱而無說明（如只寫「cache」、「架構不同」）
- 兩個差異實質上是同一點換句話說
- 事實錯誤（如「CMP 沒有 shared memory」）
- 答案與題目無關
