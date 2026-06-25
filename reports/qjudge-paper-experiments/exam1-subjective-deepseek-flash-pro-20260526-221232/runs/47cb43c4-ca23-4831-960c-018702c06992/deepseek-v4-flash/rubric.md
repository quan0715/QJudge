# 批改評分準則 — Preemptive vs Non-preemptive Scheduler

## 題目
What is the difference between a preemptive scheduler and a non-preemptive scheduler? Provide an example scenario where preemptive scheduling is beneficial.

## 滿分：3 分

## 評分項目

### (1) Preemptive 的正確定義 — 1 分
- 能中斷一個正在執行的 thread/process，強制切換（running → ready），即使它還沒執行完。
- **錯誤觀念**：把 preemptive 拿來形容 I/O blocking（running → blocked）、或是講成 process 自己會讓出 CPU → 扣 1 分。

### (2) Non-preemptive 的正確定義 — 1 分
- Process/thread 一旦獲得 CPU，就會一直執行到結束或主動 yield/block 為止，OS 無法強制搶走。
- 如果只說「照順序執行」但沒有區分是否可被打斷，則視為不完整 → 扣 0.5 分。

### (3) 舉例說明 Preemptive 的好處 — 1 分
- 合理情境：time-sharing / interactive system 需要公平分配 CPU、避免長任務獨佔、提高 responsiveness、處理緊急/高優先權任務、縮短平均等待時間等。
- 必須具體說明為何 preemptive 在該情境比 non-preemptive 好。

## 給分原則
- 每項獨立給分（0 / 0.5 / 1）。
- 若回答很簡短（僅一行）且核心概念正確 → 依完整性給 1~2 分。
- 若答非所問或完全空白 → 0 分。
- 若只正確回答了部分項目 → 依對應子項給分。
- 英文或中文作答皆可，內容正確性為評分依據。

## Reason 政策
- 滿分（3 分）→ reason 留空。
- 非滿分 → 簡短說明扣分原因。
