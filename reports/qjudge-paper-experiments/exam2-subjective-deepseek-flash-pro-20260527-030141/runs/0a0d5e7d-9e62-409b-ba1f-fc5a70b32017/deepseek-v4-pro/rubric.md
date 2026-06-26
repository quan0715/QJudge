# Rubric: Spin Lock vs Blocking Lock in SMP

**題目**: In an SMP system, under what conditions is it more appropriate to use a spin lock versus a blocking lock?

**滿分**: 2

**參考答案**:
- Spin lock: Appropriate when the expected wait time is very short or contention is low.
- Blocking lock: Appropriate when the wait time is long or contention is high, allowing the CPU to be yielded.

---

## 評分標準

### 2 分（滿分）
同時正確說明兩者適用條件：
- Spin lock → 等待時間短 / critical section 短 / 競爭者少 / 等待時間小於 context switch overhead
- Blocking lock → 等待時間長 / critical section 長 / 競爭者多 / 讓出 CPU

### 1 分
僅正確說明其中一方的適用條件，或答案含糊但方向正確。
例如：只說 spin lock 適用於短等待、或只說 blocking lock 適用於長等待。

### 0 分
答案完全錯誤、答非所問、或無實質內容（如僅有 "."、"SKip" 等）。

---

## Reason 政策
- 滿分（2 分）：reason 留空。
- 非滿分（1 分或 0 分）：必填 reason，簡短說明扣分或給分依據。
