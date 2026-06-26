# 評分準則：MP vs CMP 兩大差異

## 基本資訊
- 滿分：**2 分**（每個 valid difference 1 分）
- 題型：short_answer
- 語言不拘（中英文皆可）

## 評分原則（每點獨立給分，共兩點）

### Point 1（1 分）：Shared L2 cache / 共享快取造成效能競爭
符合以下任一敘述即給 1 分：
- CMP 共享 L2 cache（或 on-chip cache），MP 無此設計
- 因共享 cache，greedy core 可能佔用大量 cache 空間，影響其他 core 的效能
- 共享資源造成效能瓶頸或快取競爭（cache contention）

**不給分**：僅提到「有 L2 cache」而無共享或效能影響之描述；僅說「MP 有 cache」但未區分差異。

### Point 2（1 分）：緊密整合 → 故障傳播 / 單點故障 / 擴充限制
符合以下任一敘述即給 1 分：
- CMP 的 core/processor 緊密整合在同一晶片上，若共享元件故障可能導致多個 CPU 同時失效（single point of failure）
- CMP 因物理空間、散熱限制，scalability（擴充性）比 MP 差
- CMP 的 core 之間距離近、連結緊密，故障容易互相影響

**不給分**：僅說「CMP 在一個 chip 上」而無進一步的故障/擴充性影響描述；僅說「MP 用 bus 連接」而無比較性差異。

## Reason 政策
- 滿分（2 分）→ reason 留空
- 非滿分（0 或 1 分）→ 必填 reason，簡述缺哪一點或為何不足
