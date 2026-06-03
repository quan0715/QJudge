# Rubric: Many-to-One vs One-to-One Multithreading Models

## 題目
Compare the 'Many-to-One' and 'One-to-One' multithreading models.  
Which one allows better utilization of multi-core processors, and why?

## 滿分：3 分

---

## 評分準則

每個要點各 1 分，共 3 分：

| 要點 | 說明 | 分數 |
|------|------|------|
| **a. Many-to-One 定義** | 正確說明 Many-to-One 將多個 user thread 映射到一個 kernel thread | 1 分 |
| **b. One-to-One 定義** | 正確說明 One-to-One 將每個 user thread 映射到一個 kernel thread | 1 分 |
| **c. 多核心優勢說明** | 說明 One-to-One 更能利用多核心：因可讓多個 thread 真正並行執行；Many-to-One 因 kernel 只看到一個實體，同一時間只能執行一個 thread | 1 分 |

## reason 政策
- 滿分（3 分）→ reason 留空
- 非滿分 → 必須填寫 reason，說明缺少哪個要點或哪裡不正確

## 評分細節
- 用語不需完全相同，意思正確即給分
- 若只答出哪個模型較好但未解釋原因，c 點不給分
- 若混淆 user thread / kernel thread 方向，a 或 b 視情況扣分
