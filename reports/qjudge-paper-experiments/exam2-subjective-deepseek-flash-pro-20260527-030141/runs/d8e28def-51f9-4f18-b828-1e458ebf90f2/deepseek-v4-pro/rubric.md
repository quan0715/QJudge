# 評分準則 — TSL Bus Contention Mitigation

## 題目
While using the Test-and-Set-Lock (TSL) instruction for mutex locks in MPs may cause system bus contention, please suggest two ways to mitigate it.

## 滿分：2 分

## 正解（參考答案）
1. **Read before TSL (TTAS)**：先以一般 read 指令讀取 lock 狀態（可在 local cache 中進行），僅在 lock 顯示為 free 時才發出 TSL 指令。避免頻繁鎖定 bus。
2. **TSL with back-off**：TSL 失敗後等待一段延遲再重試，延遲時間可逐步增加（如 exponential backoff），減少多個 CPU 同時競爭 bus。

## 評分規則

### 2 分
兩項方法皆**正確**且可辨識，名稱或描述與參考答案一致：
- 方法一：Read before TSL / Test-and-Test-and-Set / TTAS / 先讀再 TSL
- 方法二：TSL with back-off / backoff / exponential backoff / 延遲重試 / 指數退避

只要兩項都正確給出（即使只列名稱而無詳細解釋），即可得 2 分。

### 1 分
- 只正確給出一項方法（另一項缺失或錯誤）
- 或兩項都列出但其中一項明顯錯誤（如 "Read after TSL"、"Send before TSL"、"Write-back after TSL"、"Mock off with TSL" 等）
- 或兩項實質指向同一概念（如 "backoff" 與 "exponential backoff" 視為同一方法的不同描述）

### 0 分
- 兩項皆錯誤或不相關
- 回答與 TSL bus contention mitigation 無關（如 spinlock、queue、caching 等非針對 TSL 的通用解法）
- 只給出一項且該項錯誤
- 未作答或完全離題

## 常見錯誤（不給分）
- "Read **after** TSL" → 順序顛倒，錯誤
- "Send before TSL" → 無此方法
- "Write-back after TSL" → 無此方法
- "Mock off" → 拼寫錯誤，無法辨識為 back-off
- "TSL with spinlock" → spinlock 本身就是 TSL 實作，非 mitigation
- "get key before TSL" → 語意不清，非標準解法
- "blocking / queue / cache 暫存" → 非針對 TSL bus contention 的標準解法
- "讓每個處理器都存有部分的os系統" → 離題

## 給分備註
- 滿分 (2) → reason 留空
- 非滿分 → reason 簡述扣分原因（如「缺少 Read before TSL」、「方法二錯誤」等）
