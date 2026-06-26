# Rubric: Channel-based Pub/Sub via Group Communication

**題目**: Explain how a channel-based publish/subscribe system can be implemented using group communication.
**滿分**: 2 分
**參考答案**: Each channel is mapped to a multicast group. Subscribing equates to joining the group. Publishing to the channel translates to multicasting the event to all group members.

## 核心概念（需涵蓋以下三點）

| 項目 | 說明 |
|------|------|
| ① Channel ↔ Group | Channel 對應到一個 multicast / communication group |
| ② Subscribe ↔ Join | 訂閱 channel 等同於加入該 group |
| ③ Publish ↔ Multicast | 發布訊息到 channel 等同於對 group 做 multicast / 發送訊息給所有成員 |

## 給分標準

| 分數 | 條件 |
|------|------|
| **2 分** | 清楚涵蓋以上 **三點核心概念**，且合理說明 channel-based pub/sub 如何用 group communication 實作。 |
| **1 分** | 涵蓋部分概念（1–2 點），或描述模糊／不完整，但方向正確。 |
| **0 分** | 完全無關、空泛、僅解釋 pub/sub 而無 group communication 對應、或未答。 |
