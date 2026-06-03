# 評分準則

## 題目
What is the difference between a mode switch and a context switch?

## 滿分：2 分

### 2 分
- 明確區分兩者：
  - **mode switch**：CPU 執行模式／權限層級切換，例如 user mode ↔ kernel mode，常由 trap / system call 觸發。
  - **context switch**：在不同 process / thread 之間切換，需保存目前執行上下文並載入另一個行程／執行緒的上下文。

### 1 分
- 只正確說明其中一項，或兩者都有提到但描述不完整、略有混淆。

### 0 分
- 內容明顯錯誤、完全未回答，或把兩者混為同一件事。

## 批改原則
- 以是否分清「權限模式切換」與「執行上下文切換」為核心。
- 若學生答案有等價說法，可給分。
- 語言簡潔但概念正確者可給滿分。