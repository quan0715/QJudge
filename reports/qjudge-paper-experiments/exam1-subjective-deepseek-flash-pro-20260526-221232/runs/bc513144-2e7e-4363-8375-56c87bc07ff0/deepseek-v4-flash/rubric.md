# Rubric: Busy Waiting (Spinlock)

## 滿分：2 分

### 2 分（滿分）
清楚表達以下核心概念：
- 一個 thread/process 以 **迴圈／不斷重複檢查** 的方式等待
- 檢查的對象是某個 **條件**（如 lock 是否釋放、能否進入 critical section、資源是否可用）
- 此等待方式 **佔用 CPU**（不 sleep/block，持續在 CPU 上跑）

只要有「重複檢查／迴圈等待」的核心機制，且沒有明顯概念錯誤，即可給 2 分。

### 1 分
- 僅提及「等待 lock/資源」但 **未說明是透過迴圈不斷檢查**
- 僅描述了 priority inversion（優先權反轉）現象，未定義 busy waiting 本身的等待機制
- 描述過於模糊或不完整，但方向正確
- 提及背景脈絡（如多執行緒、critical section）但未清晰定義 busy waiting

### 0 分
- 定義完全錯誤（如：記憶體管理、CPU 排班）
- 離題或無關答案
- 完全未提及 busy waiting 的機制

## 評分注意事項
- 若答案同時描述了 priority inversion，但只要仍有正確定義 busy waiting 機制，仍可給 2 分
- reason 政策：滿分 → reason 留空；非滿分 → 必填簡短 reason
