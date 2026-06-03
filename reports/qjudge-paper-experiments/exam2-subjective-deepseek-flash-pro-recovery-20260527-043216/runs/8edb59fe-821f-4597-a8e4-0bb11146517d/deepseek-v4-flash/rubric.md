# Rubric: Counting Semaphore in Linda (滿分 3 分)

## 題目
Demonstrate how a counting semaphore initialized to N can be implemented using the Linda coordination language.

## 參考答案
- Initialization: execute `out("sem")` N times.
- Wait(): execute `in("sem")`.
- Signal(): execute `out("sem")`.

## 評分原則（每項 1 分，共 3 分）

| 項目 | 滿分條件 | 常見扣分 |
|------|----------|----------|
| **1. 初始化 (1 pt)** | 明確說明需執行 `out("sem")` N 次（或等價說法，如 for loop、重複 N 次） | 只寫 `out("sem")` 但未提及 N 次 → 0 pt；完全沒寫初始化 → 0 pt |
| **2. Wait / P (1 pt)** | 使用 `in("sem")` 作為 wait 操作（阻塞拿 token） | 誤用 `out` 做 wait → 0 pt；名稱不同但語意正確 → 可接受 |
| **3. Signal / V (1 pt)** | 使用 `out("sem")` 作為 signal 操作（歸還 token） | 誤用 `in` 做 signal → 0 pt；名稱不同但語意正確 → 可接受 |

## 給分細則

- **3 分**：三項皆正確（初始化含 N 次、wait=in、signal=out）
- **2 分**：三項中有兩項正確。例：初始化正確 + wait/signal 中僅一項正確
- **1 分**：僅一項正確
- **0 分**：全部錯誤或空白，或完全誤解 Linda 語意

## 容許彈性
- tuple 名稱不必是 `"sem"`，只要一致即可（如 `"semaphore"`, `"s"`, `"cnt"`）
- 順序不拘，但語意必須正確（wait 不能是 out, signal 不能是 in）
- 可用中文或英文等不同表述，關鍵是 Linda 的 `out` / `in` 操作正確
