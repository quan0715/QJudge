# 評分準則：Thread / Process / Program 概念與關係

## 題目
Briefly describe the concepts of "thread," "process," and "program." How do they relate?

## 滿分：3 分

參考答案拆解為以下三個面向，各 1 分：

### 1. Program (1 pt)
- 正確描述：program 是**靜態的檔案**，包含 code 和 static data。
- 常見正確表述：a file with code and data, static entity, stored in disk, not executing.
- **扣分**：若答成「執行中的程式」或概念與 process 混淆 → 0 pt。

### 2. Process (1 pt)
- 正確描述：process 是 **program in execution**，正在執行中的程式實例。
- 常見正確表述：a running program, an active execution instance, loaded into memory.
- **扣分**：若答成靜態概念或與 program 混淆 → 0 pt。

### 3. Thread (1 pt)
- 正確描述：thread 是 **process 內部的執行單位**，與 execution flow 相關，一個 process 可包含多個 threads。
- 常見正確表述：unit of execution within a process, part of process related to execution flow, lightweight, shares resources.
- **扣分**：
  - 若答成 thread 就是 process 或完全混淆 → 0 pt。
  - 若僅說「thread is part of process」但未提及 execution flow 或執行單位概念 → 斟酌給 0.5 pt（視表達精確度）。
  - 有正確核心概念但表達略模糊 → 仍可給 1 pt。

## 評分原則
- **給整數分數**（0, 1, 2, 3）。
- 滿分 (3) → reason 留空；非滿分 → 必填 reason 說明扣分依據。
- 三項中有兩項正確但一項明顯錯誤 → 2 分。
- 只能正確定義 1 項 → 1 分。
- 全部混淆 → 0 分。

## reason 政策
- 滿分 3 分 → reason 留空。
- 不滿分 → reason 簡述扣分原因（如「program 定義混淆」）。
