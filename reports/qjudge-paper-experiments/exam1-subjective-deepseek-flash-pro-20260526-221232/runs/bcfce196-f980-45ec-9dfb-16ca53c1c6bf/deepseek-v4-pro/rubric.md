# Rubric — Threads Shared/Not-Shared Attributes

## 題目
List three attributes that are shared among threads in the same process, and three that are not shared.

## 滿分：6 分

## 評分細則

### Part A: Shared attributes（3 分，每個正確屬性 1 分）
須為同一 process 內 threads 之間**共享**的屬性。可接受答案：
- memory space / address space / memory
- code / text / text segment
- data / data segment
- BSS segment
- heap
- global variables / static data / static variables
- file descriptors / open files
- process ID (PID)
- user ID / group ID
- signals（注意：signal mask 屬非共享，須區分）
- page table
- PCB（process control block，屬 process 層級）
- working directory / current directory

**不給分**：
- CPU / OS（非 thread attribute）
- program counter / stack / registers / thread ID（屬非共享）
- 排程屬性如 priority、utilization、throughput、waiting time（概念混淆）
- mutex / semaphore（是同步物件，非 thread attribute；但可視為 shared resource，從寬給分）
- local variables（在 stack 上，非共享）
- 「parent and child」、「linked allocation」等明顯文不對題

### Part B: Not shared attributes（3 分，每個正確屬性 1 分）
須為同一 process 內 threads 之間**不共享**的屬性。可接受答案：
- thread ID (TID)
- stack / stack pointer (SP)
- program counter (PC)
- registers / CPU registers / saved CPU registers
- signal mask
- priority
- local variables（在 stack 上）

**不給分**：
- memory / code / data / heap / file 等共享屬性
- PCB（屬於 process，實際上共享）
- CPU / OS（非 thread attribute）
- process ID / user ID / group ID（共享）

## 評分原則
1. 每個正確且分類正確的 attribute 得 1 分，共 6 分。
2. 超過 3 個的答案：只看前 3 個（或擇優給分，只要 3 個正確即滿分該 part）。
3. 屬性分類錯誤（shared 寫到 not shared 或反之）：該 attribute 0 分。
4. 語意模糊但可辨識者從寬認定（如 "memory" → address space OK；"code" → text OK）。
5. 拼字錯誤不扣分，只要可辨識即可。
6. 中英文混用：可接受，依語意判斷。
7. Reason 政策：滿分（6 分）reason 留空；非滿分必填扣分依據。
