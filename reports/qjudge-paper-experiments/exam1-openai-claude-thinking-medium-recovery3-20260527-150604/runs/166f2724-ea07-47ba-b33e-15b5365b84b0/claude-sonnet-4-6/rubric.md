# Rubric — What is the race condition?

**題型**：short_answer  
**滿分**：2 分

## 參考解答
A race condition occurs when two or more threads or processes access a shared resource (e.g., a variable, file, or database record), and the final outcome of the program depends on the order in which the threads or processes execute.

---

## 評分標準

| 分數 | 給分條件 |
|------|----------|
| 2 | 完整說明：(1) 多個執行緒/行程存取共享資源，且 (2) 程式結果取決於執行順序——兩個核心要素均涵蓋，概念正確。 |
| 1 | 僅提及其中一個核心要素，例如：只說「多個執行緒存取同一資源」或只說「結果不確定/取決於時序」，但未完整涵蓋兩者；或概念大致正確但表述模糊不完整。 |
| 0 | 未作答、完全偏離題意、或敘述錯誤。 |

## 評分重點

- **核心要素 A**：提到多個執行緒（threads）或行程（processes）同時/並行存取同一個共享資源（shared resource / variable / file / database record 等）。
- **核心要素 B**：提到程式的最終結果（outcome / result / behavior）取決於執行順序（order of execution / timing / scheduling）。
- 用語不必與參考解答完全相同，只要語意正確即可。
- reason 政策：滿分（2 分）可留空；非滿分必填 reason。
