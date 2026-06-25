# Rubric: "What is the race condition?"

- **題型**: short_answer
- **滿分**: 2
- **參考答案**: A race condition occurs when two or more threads or processes access a shared resource such as a variable, file, or database record, and the final outcome of the program depends on the order in which the threads or processes execute.

## 評分三要素（各 1 分概念，合計 2 分制）

| 要素 | 說明 |
|------|------|
| **A. 多執行單元** | 提到兩個或以上的 threads/processes/tasks 同時/並行運作 |
| **B. 共享資源** | 提到存取 shared resource/data/variable/file/memory 等 |
| **C. 結果取決於執行順序** | 明確指出 final outcome 取決於 execution order / 順序不同導致結果不同 |

## 評分標準

| 分數 | 條件 |
|------|------|
| **2 / 2** | 三要素 A+B+C 皆具備，表達清晰正確，無重大錯誤 |
| **1 / 2** | 僅含兩要素，或三要素皆有但表達模糊/有小錯誤 |
| **0 / 2** | 僅含一要素或完全錯誤（例如將 race condition 與 deadlock 混淆、僅說「同時存取」而未提順序影響結果） |

## 給分/扣分細則
- 缺「結果取決於順序」(C) → 最多 1 分
- 缺「共享資源」(B) → 最多 1 分
- 缺「多執行單元」(A) → 最多 1 分
- 明顯概念錯誤（如 deadlock、I/O 錯誤、純排程描述） → 0 分
- 僅說「同時存取 shared resource」但未提結果與順序的關聯 → 1 分
- 僅提「結果取決於順序」但未提共享資源 → 1 分

## Reason 政策
- 滿分 (2 分) → reason 留空
- 非滿分 → reason 必填，簡述扣分原因（缺哪個要素）
