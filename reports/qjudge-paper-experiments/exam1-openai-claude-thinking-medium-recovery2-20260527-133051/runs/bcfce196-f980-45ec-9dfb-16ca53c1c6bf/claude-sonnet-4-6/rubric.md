# Rubric: Thread Shared vs. Not-Shared Attributes

## 題目
List three attributes that are **shared** among threads in the same process, and three that are **not shared**.

## 滿分
6 分

## 參考答案
- **Shared**：Memory space（記憶體空間）、File descriptors（檔案描述符）、Global variables（全域變數）
- **Not shared**：Thread ID（執行緒 ID）、Registers（暫存器）、Stack（堆疊）

---

## 評分準則

### 總體結構（6 分 = Shared 3 分 + Not Shared 3 分）

| 部分 | 分配 | 說明 |
|------|------|------|
| Shared（共享屬性）| 3 分 | 每答對 1 項得 1 分，最多 3 分 |
| Not Shared（非共享屬性）| 3 分 | 每答對 1 項得 1 分，最多 3 分 |

### 可接受的答案（不限於參考答案）

**Shared（共享）— 以下任一項均可得分**
- Memory space / address space / virtual address space / heap / memory
- File descriptors / open files / file handles
- Global variables / global data / static variables / BSS segment / data segment
- Code / text segment / program code / executable code
- Signal handlers / signal dispositions
- Process ID (PID) / parent PID
- Working directory / current directory
- Environment variables
- User ID / group ID

**Not Shared（非共享）— 以下任一項均可得分**
- Thread ID (TID)
- Registers（包含 PC/program counter / instruction pointer）
- Stack / stack pointer / stack frame / local variables
- Program counter（若未計入 registers 中）
- CPU state / execution context
- Signal mask / pending signals（部分情況）
- errno

### 扣分規則
- 每個**錯誤答案**（把非共享說成共享，或反之）扣 1 分，但本題總分不低於 0。
- 語意含糊但可合理推斷正確（如 "memory" → shared，"local vars" → not shared）視為正確。
- 重複列同一類目（如同時寫 "stack" 與 "stack pointer"）只算 1 項。
- 超出 3 項者，以前 3 項計分（多餘答案忽略）。

### 特殊情況
- 完全空白 → 0 分
- 只答一部分（如只答 shared 沒答 not shared）→ 依實際正確項目給分
- 答案書寫格式不影響得分（條列、段落、英文、中文均可）
