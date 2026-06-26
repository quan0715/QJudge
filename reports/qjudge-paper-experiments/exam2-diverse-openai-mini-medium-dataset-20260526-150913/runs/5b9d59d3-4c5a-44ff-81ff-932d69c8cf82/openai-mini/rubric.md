# 批改準則

- 題目：列出 non-blocking message passing system 中，通知接收端訊息已到達的四種方法。
- 滿分：4 分

## 參考答案重點
1. Interrupt the receiver
2. Periodic polling of the buffer status
3. Creating a pop-up thread
4. Processing an active message inside the interrupt handler

## 給分原則
- 每個正確方法 1 分，共 4 分。
- 同義表述可接受，只要意思明確對應到參考答案。
- 只寫出部分方法者，依已命中項目給分。
- 若答案含不相關內容，但仍有正確項目，正確項目可照給分。
- 若把不同方法混淆，但可明確判讀其意圖，酌情給分。
- 不清楚、空白、明顯錯誤或無法對應參考答案者不給分。

## 常見可接受同義
- interrupt / signal / 中斷通知接收端
- polling / periodic check / 定期檢查 buffer 狀態
- pop-up thread / new thread / 額外執行緒處理
- active message in interrupt handler / 由 interrupt handler 直接處理
