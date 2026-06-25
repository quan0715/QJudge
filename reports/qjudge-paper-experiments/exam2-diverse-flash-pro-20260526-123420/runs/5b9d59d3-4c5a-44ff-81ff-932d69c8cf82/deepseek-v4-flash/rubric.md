# Rubric: Non-blocking Message Passing Notification Methods

## 題目
List four methods to notify a receiver in a non-blocking message passing system that a message has arrived.

## 滿分
4 分

## 參考答案
1. Interrupt the receiver.
2. Periodic polling of the buffer status.
3. Creating a pop-up thread.
4. Processing an active message inside the interrupt handler.

## 評分原則
- **每列出一個 valid method 得 1 分**，滿分 4 分。
- 任何能正確通知 receiver「訊息已送達」的非阻塞機制皆算 valid。
- 不要求與參考答案用字完全相同，概念正確即可。
- 列出超過 4 個方法仍以 4 分為上限。
- 若回答少於 4 個，按 valid method 數量給分（0~3 分）。
- 若完全未作答或全不相關 → 0 分。
- reason 政策：滿分留空；非滿分必填扣分原因。
