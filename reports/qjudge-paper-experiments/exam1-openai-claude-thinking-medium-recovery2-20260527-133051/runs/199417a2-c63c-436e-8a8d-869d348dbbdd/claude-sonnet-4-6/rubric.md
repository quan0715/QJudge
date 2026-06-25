# Rubric — Kernel-level Threads vs User-level Threads

## 題目
List two advantages of kernel-level threads over user-level threads.

## 滿分
2 分

## 參考答案
a. Multiprocessor utilization: kernel-level threads can run on different CPUs simultaneously (true parallelism on multiprocessor/multicore systems).  
b. One thread blocking (e.g., system call) does not block the entire process; the kernel can schedule other threads in the same process.

---

## 評分標準

| 得分 | 條件 |
|------|------|
| 2 | 正確列出**兩個**優點，兩者均符合參考答案精神 |
| 1 | 只列出**一個**正確優點；或兩個都提到但其中一個說法明顯錯誤/不完整到無法辨識 |
| 0 | 未列出任何正確優點；或答案完全偏離 kernel-level vs user-level 的比較 |

## 可接受的同義表述（每點獨立判斷）

**優點 a — 多處理器/平行執行：**
- 可在多個 CPU/核心上並行執行
- 真正的 parallelism（multiprocessor utilization）
- 多核心系統上可同時執行多個 thread

**優點 b — 阻塞隔離：**
- 一個 thread 發出 blocking system call，不會阻塞同 process 的其他 thread
- kernel 可繼續排程同 process 內其他 thread
- I/O blocking 不影響整個 process

## 不計分的回答
- 只說「kernel 管理」「效能較好」等未說明具體優點
- 混淆 kernel-level 與 user-level 優缺點方向（把 user-level 的優點誤答）
- 重複同一個優點（用不同措辭描述同一件事），只計 1 分
