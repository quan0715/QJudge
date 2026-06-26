# Rubric: Counting Semaphore in Linda

**題目**: Demonstrate how a counting semaphore initialized to N can be implemented using the Linda coordination language.

**滿分**: 3 分

**參考答案**:
1. Initialization: execute out("sem") N times.
2. Wait(): execute in("sem").
3. Signal(): execute out("sem").

---

## 評分標準（3 分制）

本題要求學生展示如何用 Linda 協調語言的 primitive（out / in）實作 counting semaphore。三個關鍵操作各佔 1 分：

### 1. Initialization（初始化，1 分）
- 必須明確指出初始化時需執行 `out("sem")` **N 次**（或 N times / N 回）。
- 僅寫 `out("sem")` 一次而未提 N 次 → 0 分（此項）。
- 使用其他 tuple 名稱（如 "semaphore", "key", "lock" 等）仍可接受，只要邏輯一致。
- 若寫成 `out("sem", N)` 表示嘗試傳遞數值參數（非 Linda 標準用法）→ 酌情扣 0.5 分（非標準語法但仍捕捉到 N 次概念）。

### 2. Wait / P operation（等待/獲取，1 分）
- 必須使用 `in("sem")`（或等價寫法）來取得 semaphore。
- 若寫成 `out` 或其他錯誤 primitive → 0 分（此項）。
- 僅提概念而未寫出 Linda 的 in 操作 → 0 分。

### 3. Signal / V operation（釋放/歸還，1 分）
- 必須使用 `out("sem")`（或等價寫法）來釋放 semaphore。
- 若寫成 `in` 或其他錯誤 primitive → 0 分（此項）。
- 僅提概念而未寫出 Linda 的 out 操作 → 0 分。

---

## 給分與 reason 政策

| 分數 | 條件 | reason |
|------|------|--------|
| 3 | 三項全部正確（init N 次 + in 等待 + out 釋放） | 留空（滿分預設不留評語） |
| 2 | 兩項正確，或三項都有但有小錯誤 | 簡述扣分點 |
| 1 | 僅一項正確，或有重大概念錯誤 | 簡述扣分點 |
| 0 | 完全錯誤、無關回答、或未回答 | 簡述原因 |

### 常見扣分情境
- 初始化漏寫 N 次：-1
- wait/signal 的 in/out 寫反：-1（該項）
- 僅用文字描述概念，未實際寫出 Linda primitive：視情況 -1 至 -2
- 使用非 Linda 語法（如 sem = N、allocate memory）：整題可能 0-1 分
- 僅寫出部分操作（如只寫 init）：依缺少項數扣分
- tuple 名稱前後不一致：不扣分，只要邏輯正確
