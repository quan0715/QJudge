# Rubric: What is busy waiting (spinlock)?

## 題目
What is busy waiting (spinlock)?

## 滿分
2 分

## 參考答案
Busy waiting (spin lock) is the situation when a thread is looping, continuously checking whether a condition exists that will allow it to continue. It is often used to check if a thread can enter a critical section or to poll a device to see if data is ready (or written/sent).

---

## 評分標準

| 分數 | 判斷條件 |
|------|----------|
| 2    | 完整說明兩個核心要素：(1) 執行緒持續循環/反覆檢查某條件；(2) 目的是等待進入 critical section 或等待資源/裝置就緒。概念正確、語意清楚即可，不要求逐字相符。 |
| 1    | 只提到其中一個核心要素（例如只說「持續循環檢查」但未提目的/用途，或只提 critical section/spinlock 名詞但未解釋機制），或解釋方向大致正確但不完整/有部分錯誤。 |
| 0    | 完全空白、完全無關、嚴重概念錯誤（如誤認為 blocking、sleep-wait 等完全相反的概念）。 |

## 給分細則
- **核心要素 1**：執行緒在一個迴圈中**持續檢查**（loop / repeatedly check / continuously poll）某條件是否成立，才能繼續執行。
- **核心要素 2**：用途為進入 critical section（互斥鎖）或等待裝置/資料就緒（polling）。
- 不需要同時提及兩種用途，有一種即算涵蓋要素 2。
- 提到 CPU 不放棄（不 yield/sleep）、浪費 CPU 等副作用描述，可視為對核心要素 1 的補強，但單獨提副作用而無機制說明只給 1 分。
- reason 政策：滿分（2 分）可留空；非滿分必填 reason。
