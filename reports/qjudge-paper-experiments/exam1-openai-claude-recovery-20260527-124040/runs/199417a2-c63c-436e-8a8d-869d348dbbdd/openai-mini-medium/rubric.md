# 題目評分準則

- 題目：列出 kernel-level threads 相較於 user-level threads 的兩個優點
- 滿分：2 分
- 參考答案：
  1. 可在多核心/多處理器上同時執行，提高 multiprocessor utilization
  2. 一個 thread 阻塞時，不會阻塞整個 process

## 給分標準

- 2 分：清楚寫出兩個正確優點，且語意明確
- 1 分：只寫出一個正確優點，或兩點中只有一點明確正確
- 0 分：未作答、離題、或答案不正確

## 可接受同義表達

- multiprocessor utilization / parallel execution on multiple CPUs / 多核心可同時執行
- one thread blocking doesn't block the entire process / blocking one thread does not stop the whole process / 單一執行緒阻塞不影響整個程序

## 批改原則

- 只根據學生作答內容給分
- 若答案含糊但可合理對應到上述任一優點，可給對應分數
- 若僅描述一般 thread 優點，但未對應到 kernel-level threads 相對於 user-level threads 的差異，不計分