# 評分 rubric — Kernel-level threads advantages over user-level threads

## 題目
List two advantages of kernel-level threads over user-level threads.

## 滿分
2 分（每個正確優勢 1 分）

## 參考答案
a. Multiprocessor utilization (can run on different CPUs). → **1 分**
b. One thread blocking doesn't block the entire process. → **1 分**

## 評分原則

### 關鍵優勢 1：多處理器／多核心利用（1 分）
- 學生需表達：kernel-level threads 可在不同 CPU / core 上**同時／平行**執行，而 user-level threads 受限於單一核心／process。
- 可接受的關鍵詞：multi-core, multiprocessor, 平行, 同時, scalability, 多核心, parallel, multiple CPUs
- 不給分：只提「效率較高」但沒連結到多核心利用。

### 關鍵優勢 2：阻斷／容錯（1 分）
- 學生需表達：當一個 kernel-level thread 被 block 或 fail 時，**其他 thread 仍可繼續執行**，不影響整個 process；而 user-level thread（N:1 model）一旦一個 thread 被 block，整個 process 都被 block。
- 可接受的關鍵詞：block, 阻塞, 崩潰, crash, fail, robust, 容錯, survive, 不影響其他
- 不給分：只說「較穩定」但未解釋原因。

### 其他不給分的常見論述（不屬於本題優勢）
- Context switch / mode switch 比較
- 共享記憶體 / shared memory
- OS 管理排程（除非結合 blocking 說明）
- 硬體直接存取 / privileged instruction（除非特別強調是 kernel thread 的優勢且與 user-level 做出區別）

### 部分給分原則
- 只寫對一個正確優勢 → 1 分
- 兩個都寫對 → 2 分
- 語意清楚但用詞略有瑕疵 → 仍給分
- 只寫關鍵字沒有說明 → 若關鍵字可明確對應到優勢 → 仍給分（如僅寫 "scalability, robustness" 但未解釋 → 給 2 分）

## reason 政策
- 滿分（2 分）→ reason 留空
- 非滿分 → 必填 reason，簡短說明缺了什麼
