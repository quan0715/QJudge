# 評分準則：Why are non-blocking operations less prone to deadlock?

## 基本資訊
- **題型**：short_answer
- **滿分**：2 分
- **參考答案**：*"They allow processes to continue execution without waiting."*
- **核心概念**：Non-blocking operations 的 sender/receiver 不需要等待對方回應即可繼續執行，因此較不容易形成互相等待（circular wait）的 deadlock 情境。

## 評分標準

### 2 分（滿分）
- 正確指出 non-blocking operations **不會等待**（不需等 acknowledge / reply / response），sender/receiver 送出後可**繼續執行**，**且**明確說明此機制如何避免 deadlock（如避免互相等待、避免 circular wait、不會卡住）。
- 以中文或英文表達皆可，邏輯清晰即可。
- **reason 留空**（依預設政策：滿分不填 reason）。

### 1 分（部分正確）
- 提到「不等待」或「繼續執行」，但**未清楚連結到 deadlock 預防**，或解釋有部分模糊/偏差但核心方向正確。
- 或只提到 non-blocking 的某個面向（如「不用等 reply」），但缺乏進一步詮釋為何能避免 deadlock。
- **必填 reason**，簡述給 1 分的原因。

### 0 分（不正確／無效）
- 答案明顯錯誤（如「non-blocking 會 busy waiting」、「non-blocking 會 spin-lock」等混淆概念）。
- 答案與問題無關、空白、僅符號（"."）、JSON 空物件、複製題目卻無實質內容。
- **必填 reason**，簡述給 0 分的原因。

## 評分政策（reason 欄位）
- 滿分（2 分）→ reason **留空**。
- 非滿分（0 或 1 分）→ **必須填寫 reason**，簡短說明給分依據。
