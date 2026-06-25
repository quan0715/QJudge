# Rubric：Aging in Priority Scheduling

## 題目
What is the 'Aging' technique in priority scheduling, and what specific problem does it solve?

## 滿分
2 分

## 參考解答
a. Aging 會隨著 process 在系統中等待的時間增長，逐漸提升其優先權（priority gradually increases for long-waiting processes）。  
b. 解決的問題是 **Starvation**（飢餓）：低優先權的 process 可能因高優先權 process 不斷到來而無限期無法執行。

---

## 評分細則

| 得分 | 條件 |
|------|------|
| 2 | 同時答對 (a) Aging 機制（逐漸提升等待 process 的優先權）與 (b) 解決 Starvation，兩者皆完整且正確。 |
| 1 | 只答對其中一點（機制或問題），或兩點皆有提及但描述明顯不完整／模糊。 |
| 0 | 完全未作答、與題目完全無關、或兩點均錯誤。 |

## 評分注意事項
- 關鍵字允許同義詞：「indefinite blocking」、「indefinite waiting」、「process never executes」均視同 Starvation 的有效描述。
- Aging 機制須含「隨時間增加」與「提升優先權」兩個核心概念，缺一給 0.5 → 整體降為 1 分。
- reason 政策：滿分（2分）可留空；非滿分須填寫扣分依據。
