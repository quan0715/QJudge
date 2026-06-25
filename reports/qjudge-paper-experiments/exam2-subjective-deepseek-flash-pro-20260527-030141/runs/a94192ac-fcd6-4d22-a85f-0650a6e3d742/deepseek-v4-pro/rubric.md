# Rubric: Channel-based Pub/Sub via Group Communication

**題目**: Explain how a channel-based publish/subscribe system can be implemented using group communication.

**滿分**: 2

**參考答案 (三核心對應)**:
1. channel ↔ multicast group（頻道對應群組）
2. subscribe ↔ join the group（訂閱即加入群組）
3. publish ↔ multicast/send to the group（發布即對群組群播/發送）

---

## 評分準則

### 2 分（完整）
- 清楚涵蓋三項核心對應至少兩項以上，且無重大錯誤：
  - 頻道 (channel) 對應群組 (group)
  - 訂閱 (subscribe) 對應加入群組 (join group)
  - 發布 (publish) 對應發送訊息給群組 (multicast/send to group)
- 以 group communication 的術語（group, join, multicast, send to group）清楚說明實作方式。

### 1 分（部分正確）
- 觸及核心概念但缺漏明顯：
  - 只提到 1-2 項對應，或
  - 方向大致正確但過於簡略、模糊，或
  - 有輕微理解偏差（如混淆 pub/sub 方向、混入不相關細節但主軸尚可）。

### 0 分（未達標）
- 答非所問、完全離題。
- 僅描述 pub/sub 概念而未說明如何用 group communication 實作。
- 「not sure」、空白、亂碼、未完成句子。
- 答案與 group communication 無關。

---

## 給分/理由政策
- 滿分 (2) → reason 留空。
- 非滿分 (0 或 1) → reason 必填，簡述扣分或給分依據。
