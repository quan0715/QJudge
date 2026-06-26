# Cache Coherence 問題與寫入規則 — 評分準則

## 題目
"Explain the Cache Coherence problem and the basic rules a system must follow when a CPU wants to write a cached word."

## 滿分：2 分

## 評分面向

### 面向一：Cache Coherence problem 的定義（佔 ~1 分核心概念）
- 指出在多處理器/多核心系統中，同一份資料可能同時存在於多個 CPU 的 cache 中
- 當某個 CPU 修改（write）該資料時，會導致其他 cache 中的副本變成過時（inconsistent/stale）
- 需要機制來維持所有 cache 的一致性

### 面向二：寫入時的基本規則（佔 ~1 分核心規則）
- 當 CPU 要 write 一個存在於多個 cache 的 word 時，系統必須**通知所有 cache** 此寫入請求
- 若其他 cache 持有的是 **clean copy**（未修改過的副本）→ 直接丟棄（discard/invalidate）即可
- 若其他 cache 持有的是 **dirty/modified copy**（修改過的副本）→ 必須：
  - 將修改過的副本寫回（write back）到主記憶體，**或者**
  - 將修改過的副本直接**轉移（transfer）給要寫入的 CPU**

### 給分原則

| 分數 | 條件 |
|------|------|
| **2 分** | 同時正確解釋問題（多 cache 共享資料 + 寫入造成不一致）**與**規則（通知所有 cache + clean→discard + dirty→write back 或 transfer to writer），且無重大錯誤 |
| **1 分** | 部分正確：僅正確說明問題但規則有缺漏，或規則大致正確但問題說明不足；或有概念但細節模糊 |
| **0 分** | 完全文不對題、空白、跳過（Skip）、只寫不相干關鍵字（如"catching replication"）、嚴重誤解 |

### reason 政策
- 滿分（2 分）→ reason 留空
- 非滿分（0 或 1 分）→ 必填簡短 reason，說明扣分原因
