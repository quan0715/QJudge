# Rubric: What is the race condition?

**滿分：2 分**

## 參考答案
> A race condition occurs when two or more threads or processes access a shared resource such as a variable, file, or database record, and the final outcome of the program depends on the order in which the threads or processes execute.

## 評分標準

### 關鍵要素（共 3 項）
| # | 要素 | 說明 |
|---|------|------|
| A | 多個執行單元 | 提到兩個以上的 threads / processes |
| B | 共享資源 | 提到 shared resource（variable / file / data 等） |
| C | 結果取決於執行順序 | 提到 outcome / result 因執行順序不同而不同 |

### 給分原則
| 分數 | 條件 |
|------|------|
| **2 分**（滿分） | 正確涵蓋 A、B、C 三項要素。reason 留空（依預設政策）。 |
| **1 分** | 僅涵蓋其中 1-2 項要素，或有部分概念但缺關鍵要素。reason 必填。 |
| **0 分** | 完全無關、嚴重偏離、或描述 deadlock / critical section 以外概念。reason 必填。 |
