# 評分準則

- 題型：短答題
- 滿分：4 分
- 作答重點：列出「非阻塞式 message passing」中，用來通知接收端訊息已到達的四種方法。

## 可接受的四種方法
每列出 1 種方法得 1 分，合計最多 4 分：

1. `interrupt` / `signal` receiver（中斷或訊號通知接收端）
2. `polling` buffer/status（週期性輪詢 buffer 狀態，必要時搭配 `poll()` / `get_message()`）
3. `pop-up thread` / 新執行緒 / callback thread（建立額外執行緒處理到達訊息）
4. `active message` 於 `interrupt handler` 中直接處理（通常需 trusted environment）

## 計分原則
- 只要語意明確對應上述方法，即可給分。
- 同一種方法的不同說法只算 1 次。
- 僅答到部分方法，依正確數量給分。
- 完全無關、空白或無法辨識者給 0 分。

## 備註
- 若答案提到 `signal`、`callback`、`event` 等，但能明確對應到「通知接收端訊息已到達」的機制，可視情況酌予接受。