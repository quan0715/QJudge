# Rubric: Thread Shared / Not-Shared Attributes

## 題目
List three attributes that are shared among threads in the same process, and three that are not shared.

## 滿分：6 分

## 配分方式
- **Shared (3 分)**：每正確列出一個 shared attribute 得 1 分
- **Not Shared (3 分)**：每正確列出一個 not shared attribute 得 1 分
- 若某項答案同時列於兩邊但概念不對（如 stack 放在 shared），該項不給分
- 若只列出 2 個正確項目則得 2 分（該側），依此類推
- 若列出超過 3 個，最多仍以 3 個計

## 正確 shared attributes（符合任一即可，同義概念可接受）
1. Memory space / address space
2. Global variables
3. Static data / data segment
4. Code / text segment
5. Heap
6. File descriptors / open files
7. Process ID
8. Working directory / current directory
9. Signal handlers / signal disposition (但 signal mask 不算)
10. User ID / Group ID
11. Environment variables
12. BSS segment
13. Shared libraries
14. Socket / pipe / IPC resources

## 正確 not shared attributes（符合任一即可，同義概念可接受）
1. Thread ID (TID)
2. Program Counter (PC)
3. CPU registers / saved CPU registers / register set
4. Stack (call stack)
5. Stack Pointer (SP)
6. Signal mask
7. Thread priority / scheduling parameters
8. Local variables (因屬 stack)
9. errno (per-thread)
10. Thread-specific data (TSD)

## 扣分原則
- 答案概念正確但用詞模糊 → 仍給分（如 "memory" 可接受為 shared，"pointer" 若指 stack pointer 則給 not shared）
- 明顯錯誤概念 → 該項 0 分（如 "PCB" 非 thread 層級、"CPU" 為整台機器共享）
- 嚴重誤解（shared/not shared 完全搞反多項）→ 依正確項給分
- 未作答或完全離題 → 0 分
- reason 政策：滿分 6 → reason 留空；非滿分 → 必填簡短 reason
