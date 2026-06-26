# Rubric: Mode Switch vs Context Switch

**題目**: What is the difference between a mode switch and a context switch?

**滿分**: 2 分

## 評分標準

本題要求說明 mode switch 與 context switch 的差異，需明確區分兩者的定義與核心概念。

### Mode Switch（1 分）
- **1 分**：正確說明 mode switch 是 CPU 執行模式／權限等級 (privilege level) 的切換，並提及 user mode ↔ kernel mode，或提及透過 trap / system call 觸發。
- **0.5 分**：僅提及 user mode 與 kernel mode 之間的切換，但未說明是權限等級/執行模式的改變；或概念大致正確但表述不夠清楚。
- **0 分**：未提及、完全錯誤、或將 mode switch 與 process state transition（running/ready/waiting）混淆。

### Context Switch（1 分）
- **1 分**：正確說明 context switch 是儲存 (save) 當前 process 的執行上下文 (execution context)，並恢復 (restore) 另一個 process 的上下文，涉及 process 之間的切換。
- **0.5 分**：提及 process 之間的切換，但未明確說明 save/restore 機制；或概念大致正確但表述不完整。
- **0 分**：未提及、完全錯誤、或描述成 address space switch 等不相關概念。

### 給分彙總
- 2 分：兩部分皆完整正確
- 1.5 分：一部分完整（1 分）+ 另一部分不完整（0.5 分）
- 1 分：兩部分皆不完整（各 0.5 分），或一部分完整另一部分缺失/錯誤
- 0.5 分：僅一部分不完整，另一部分缺失/錯誤
- 0 分：兩部分皆缺失或完全錯誤，或未作答

### Reason 政策
- 滿分 (2 分)：reason 留空
- 非滿分：reason 簡短說明扣分或給分依據
