# Rubric: Kernel-Level Threads vs User-Level Threads

**題目：** List two advantages of kernel-level threads over user-level threads.

**滿分：** 2 分

---

## 參考答案

a. Multiprocessor utilization — kernel-level threads can run on different CPUs simultaneously (true parallelism).  
b. One thread blocking (e.g., on a system call) does not block the entire process; the kernel can schedule another thread.

---

## 評分標準

| 分數 | 條件 |
|------|------|
| 2 | 正確列出兩個優點，皆符合參考答案核心概念（多處理器利用 / 一個 thread 阻塞不影響整個 process） |
| 1 | 只正確列出一個優點；或兩個優點中有一個明顯錯誤/模糊到無法辨識 |
| 0 | 完全未答、或兩個優點皆錯誤/與題意無關 |

## 判斷原則

- **多處理器利用**：提到 parallelism、multiple CPUs/cores、concurrent execution on different processors 等，均視為正確。
- **阻塞不影響整體**：提到 one thread blocks → kernel schedules another thread / process continues、system call blocking 不影響其他 threads，均視為正確。
- 其他合理且正確的 kernel-level thread 優點（如 kernel 可主動搶佔 preemption、更好的排程公平性等）若確實是相對 user-level thread 的優點，可酌情給分。
- 語意正確但用詞非標準術語，只要核心概念正確，不扣分。
- 若學生列出超過兩點，以最佳兩點計分。
