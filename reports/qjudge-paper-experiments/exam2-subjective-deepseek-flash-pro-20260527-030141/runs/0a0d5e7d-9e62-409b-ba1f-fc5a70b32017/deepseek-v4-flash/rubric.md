# 評分準則：Spin Lock vs Blocking Lock 適用條件

## 題目
In an SMP system, under what conditions is it more appropriate to use a spin lock versus a blocking lock?

## 滿分：2 分

## 參考答案
- **Spin lock**：當預期等待時間很短（短於 context switch 開銷）、或競爭程度低（low contention）時適用。
- **Blocking lock**：當預期等待時間長、或競爭程度高（high contention）時適用，可讓出 CPU 給其他執行緒。

## 給分標準

### 2 分（滿分）
同時正確說明 **spin lock 適用條件**（短等待 / 短 critical section / 低競爭 / 等待 < context switch 時間）**以及** **blocking lock 適用條件**（長等待 / 長 critical section / 高競爭）。
- 可用自己的話表達，核心觀念正確即可。
- 若包含少量不影響正確性的語法/拼寫錯誤，仍給滿分。

### 1 分
僅說明一方的條件（只講 spin lock 或只講 blocking lock），或內容部分正確但有明顯缺失。

### 0 分
- 答案與問題無關
- 完全錯誤的論述（例如將 spin lock 用於高競爭場景）
- 空白或無意義內容（如「.」、「SKip」）
- 過於模糊無法判斷指向哪種 lock

## reason 政策
- 滿分（2 分）→ reason 留空
- 非滿分（0 或 1 分）→ 必填 reason，簡述扣分原因
