# Rubric: "What is busy waiting (spinlock)?"

**Max score**: 2

## 參考答案核心要素
1. 定義：thread/process 在 looping，持續檢查（continuously checking）某個條件是否成立
2. 目的：等待條件滿足後可以繼續執行（allow it to continue）
3. 常見情境：檢查能否進入 critical section、polling I/O device

## 評分標準

### 2 分（滿分）
清楚寫出 busy waiting 是一種 looping / continuously checking 的行為，且扣合等待條件／資源／lock／critical section 的脈絡。不需三個核心要素全寫，但**必須包含 looping + 條件檢查／資源等待的語意**。

### 1 分
- 只寫出「在 loop 中等待」但未說明檢查條件或資源等待的脈絡
- 只聚焦 priority inversion 而沒有明確描述 looping/continuous checking（偏離核心定義）
- 描述大致正確但過於模糊或缺乏關鍵詞（如 looping、continuously checking）
- 將 busy waiting 誤定義為「process 無法釋放 lock／卡住」而非「主動 looping 檢查」

### 0 分
- 完全錯誤、答非所問
- 將 busy waiting 與不相關概念混淆（如 virtual memory）
- 完全空白或無意義內容
