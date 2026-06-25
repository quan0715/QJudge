# Rubric: Thread / Process / Program

**題目**: Briefly describe the concepts of "thread," "process," and "program." How do they relate?

**滿分**: 3

**參考答案**:
- Program: a static file containing code (and static data).
- Process: an active execution instance of that program (program in execution).
- Thread: a unit of execution within a process; a process can contain multiple threads that share the same resources.

---

## 評分標準（每項 1 分，共 3 分）

### 1. Program 概念（1 分）
- 必須提到「靜態檔案」（static file）或「含有 code/data 的檔案」
- 僅寫「程式」或「code」但未點出靜態/檔案性質 → 0.5 分
- 明顯錯誤（如說 program 是執行中的東西、或與 process 混淆）→ 0 分

### 2. Process 概念（1 分）
- 必須提到「執行中的 program」（program in execution / running program）
- 僅說「process 是程序」但未提及執行 → 0.5 分
- 明顯錯誤（如說 process 是靜態檔案、或與 program 混淆）→ 0 分

### 3. Thread 概念與三者關係（1 分）
- Thread：必須點出「process 內的執行單位 / execution flow」
- 關係：需點出 process 可含多個 thread，或 thread 隸屬於 process
- 僅寫「thread 是 process 的一部分」但未提執行 → 0.5 分
- 若 thread 概念正確但完全未提關係 → 0.5 分
- 明顯錯誤（如說 thread 與 process 無關、或 thread = process）→ 0 分

---

## 給分規則
- 3/3：三個概念皆正確且點出關係
- 2/3：兩個概念正確，或三個概念有但缺關係；或有一個概念部分正確
- 1/3：僅一個概念正確，或多處模糊/錯誤
- 0/3：全錯或未作答

## Reason 政策
- 滿分（3 分）：reason 留空
- 非滿分（0-2 分）：簡述扣分原因，如「program 描述不完整」、「thread 未提關係」、「process 與 program 混淆」
