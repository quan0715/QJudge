# Rubric: Compare Many-to-One vs One-to-One Multithreading Models

**Max Score**: 3

## 評分項目（每項 1 分）

### 1. 正確描述 Many-to-One 模型（1 分）
- 核心：多個 user-level threads 對應到 **一個** kernel thread
- 只要說出「多個 user thread / 一個 kernel thread」即給分
- 若明顯錯誤（如說成多個 kernel thread）不給分
- 若未提及此模型則不給分

### 2. 正確描述 One-to-One 模型（1 分）
- 核心：一個 user-level thread 對應到 **一個** kernel thread（1:1 對應）
- 若明顯錯誤不給分
- 若未提及此模型則不給分

### 3. 正確選擇 One-to-One 為較佳 + 合理解釋（1 分）
- 必須明確說 One-to-One 較好（或 1:1 較好）
- 合理解釋方向（任一即給分）：
  - kernel thread 才能被 OS scheduler 分配到不同 core
  - Many-to-One 只有一個 kernel thread，無法平行執行在多核心上
  - One-to-One 讓每個 user thread 有獨立 kernel thread，可跨核平行執行
  - OS 只看得到 kernel thread，Many-to-One 對 OS 來說只有一個執行單元

### 扣分說明
- 選擇 Many-to-One 為較佳 → 第 3 項不給分（概念錯誤）
- 回答過於簡略無法判斷理解程度 → 對應項目不給分
- 答案與題目無關（空白/亂碼）→ 0 分
- 理由與核心觀念矛盾 → 第 3 項不給分
