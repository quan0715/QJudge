# Rubric — Priority Inversion (max_score: 3)

## 題目
What is priority inversion? Describe a scenario where busy waiting (spinlock) can lead to it. How can priority inheritance solve this issue?

## 參考解答要點
- **a. Priority inversion 定義**：高優先權任務被低優先權任務阻擋（blocked/delayed）而無法執行的情況。
- **b. Spinlock 導致 priority inversion 的情境**：
  - 低優先權任務 A 持有鎖（lock）；高優先權任務 B 自旋等待（busy waiting）該鎖。
  - 排程器讓 B 持續佔用 CPU，A 無法被執行 → A 永遠無法釋放鎖 → 形成 priority inversion。
- **c. Priority inheritance 解法**：
  - 暫時將持鎖的低優先權任務（A）提升至等待方（B）的優先權等級，使 A 得以執行並儘快釋放鎖。

---

## 評分標準（3 分滿分）

| 分數 | 給分條件 |
|------|----------|
| **3** | 三個面向（a 定義、b spinlock 情境、c priority inheritance 解法）皆完整且正確。 |
| **2** | 任兩個面向完整正確，第三個面向缺失、模糊或有明顯錯誤；**或**三個面向都提到但其中一個有輕微不完整。 |
| **1** | 僅一個面向完整正確，其餘缺失或錯誤；**或**對概念有基本理解但描述不清/缺少關鍵機制。 |
| **0** | 完全空白、完全無關、或三個面向皆錯誤。 |

## 評分細則
- **a 面向**（定義）：需明確提及「高優先權被低優先權阻擋/延遲」；僅說「優先權問題」不足。
- **b 面向**（spinlock 情境）：需說明 spinlock/busy waiting 如何讓持鎖低優先任務無法執行（CPU 被高優先任務佔用，低優先任務無法釋放鎖）；只說「會 deadlock」不算正確。
- **c 面向**（priority inheritance）：需說明「提升持鎖者優先權」這個機制；僅說「用 priority inheritance 解決」而無解釋不足。
- 術語不需完全一致，意思正確即可給分。
- 滿分條件：三個面向均達標。
