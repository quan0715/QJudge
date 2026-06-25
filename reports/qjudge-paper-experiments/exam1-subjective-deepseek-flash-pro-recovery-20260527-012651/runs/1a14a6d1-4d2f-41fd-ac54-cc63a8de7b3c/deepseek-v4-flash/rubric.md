# 評分準則：Priority Inversion

## 題目
What is priority inversion? Describe a scenario where busy waiting (spinlock) can lead to it. How can priority inheritance solve this issue?

## 滿分：3 分

## 各項配分與標準

### (1) 定義 Priority Inversion — 1 分
- 核心概念：higher-priority task 被 lower-priority task 阻擋／等待 low-priority 持有的資源。
- 滿分：清楚說出 high-priority 被 low-priority blocked / waiting for resource held by low-priority。
- 部分（0.5）：只提到「高優先權被低優先權卡住」但未說明資源持有關係。
- 0 分：未提及或完全錯誤。

### (2) Spinlock 導致 Priority Inversion 的情境 — 1 分
- 核心情境：Low-priority process 持有 lock／在 CS 中；High-priority process 用 spinlock (busy waiting) 等待；Scheduler 因 priority 讓 high-priority 佔 CPU，導致 low-priority 無法取得 CPU 來釋放 lock。
- 滿分：清楚描述低優先權持有 lock → 高優先權 busy waiting → 高優先權佔 CPU → 低優先權無法釋放 lock 的因果鏈。
- 部分（0.5）：提到 spinlock 造成問題，但因果鏈不完整（如只說「高優先權 busy waiting 佔 CPU」但未連結到低優先權無法釋放）。
- 0 分：未提及 spinlock/busy waiting 或情境完全錯誤。

### (3) Priority Inheritance 如何解決 — 1 分
- 核心機制：暫時提升持有 lock 的 low-priority process 的 priority 到最高（或到等待者的等級），讓它取得 CPU 完成 CS 並釋放 lock，之後恢復原 priority。
- 滿分：清楚說明暫時提升 low-priority 的 priority → 讓它先執行 → 釋放 lock → 恢復原 priority。
- 部分（0.5）：只說「提高低優先權的 priority」但未說明暫時性／恢復機制。
- 0 分：未提及或完全錯誤（如跟 aging 混淆、說對調 priority 等）。

## 評分原則
- 逐項給分，三項獨立計分後加總。
- 滿分（滿分 3 分） → reason 留空；非滿分 → reason 簡短說明扣分原因。
- 若學生有理解偏誤但仍有部分正確，依 rubric 給對應部分分數。
