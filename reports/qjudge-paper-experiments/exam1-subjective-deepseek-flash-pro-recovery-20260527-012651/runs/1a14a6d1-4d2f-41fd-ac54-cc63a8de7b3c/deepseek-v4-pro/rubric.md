# Rubric: Priority Inversion & Priority Inheritance

**題目**: What is priority inversion? Describe a scenario where busy waiting (spinlock) can lead to it. How can priority inheritance solve this issue?

**滿分**: 3 分（三子題各 1 分）

---

## 評分標準

### Part (a): What is priority inversion?（1 分）

**給 1 分** — 清楚說明「高優先權的 task/process/thread 被低優先權的 task 阻擋（blocked）」的核心概念。  
關鍵要素：high-priority task is blocked/waiting for a resource held by a low-priority task。

**給 0.5 分** — 有觸及概念但表述不完整或不精確，例如只說「優先權顛倒」但未點出 high 被 low 阻擋、或將 priority inversion 與其他概念（deadlock、starvation）混淆但仍有部分正確。

**給 0 分** — 完全錯誤或未作答。

---

### Part (b): Scenario with busy waiting / spinlock（1 分）

**給 1 分** — 清楚描述情境：low-priority process 持有 lock（或進入 critical section），high-priority process 以 spinlock/busy waiting 等待，scheduler 選擇執行 high-priority，導致 low-priority 拿不到 CPU 而無法釋放 lock，形成互相卡住的局面。  
關鍵要素：lock holder（low）+ spinlock waiter（high）+ CPU 被 high 佔走 + low 無法執行釋放 lock。

**給 0.5 分** — 情境大致正確但缺少關鍵細節（如未提及 scheduler 把 CPU 給 high 導致 low 無法執行、或未明確說明 spinlock 的角色）。

**給 0 分** — 情境描述錯誤（如因果顛倒、說成 deadlock、或使用不相關的場景）。

---

### Part (c): How priority inheritance solves it（1 分）

**給 1 分** — 清楚說明：暫時將持有 lock 的 low-priority task 的 priority 提升到等待者的最高 priority（或與 high-priority task 相同），使其能夠取得 CPU 執行並釋放 lock，釋放後恢復原 priority。  
關鍵要素：boost priority of lock holder → execute & release lock → restore original priority。

**給 0.5 分** — 概念正確但表述不完整，例如只說「提高 priority」但未提及暫時性與恢復、或提到 aging 等其他機制但仍有觸及 inheritance 核心。

**給 0 分** — 完全錯誤（如說成 priority inversion 是解法、說成對調 priority、或用完全無關的機制）。

---

## 給分／扣分原則

- 滿分（3/3）時 reason 留空。
- 非滿分時 reason 必填，簡述扣分原因，格式如：
  - 「(a)正確 (b)未提及 scheduler 搶走 CPU (c)正確 → 2/3」
  - 「(a)(b)正確 (c)未完整說明暫時提升後恢復 → 2.5/3」
  - 「(a)僅說 priority 顛倒未說明 high 被 low block (b)正確 (c)正確 → 2.5/3」
- 對 mixed-language（中英夾雜）不扣分，只看內容正確性。
