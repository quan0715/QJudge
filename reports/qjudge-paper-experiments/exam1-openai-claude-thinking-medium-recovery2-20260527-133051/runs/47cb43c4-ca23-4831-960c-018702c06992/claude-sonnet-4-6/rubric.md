# Rubric：Preemptive vs Non-Preemptive Scheduler

**題目**：What is the difference between a preemptive scheduler and a non-preemptive scheduler? Provide an example scenario where preemptive scheduling is beneficial.

**滿分**：3 分

---

## 評分標準

| 分項 | 分值 | 說明 |
|------|------|------|
| A. 說明 preemptive scheduling | 1 分 | 正確描述：排程器可在執行緒 burst 結束前強制中斷、切換至其他執行緒 |
| B. 說明 non-preemptive scheduling | 1 分 | 正確描述：執行緒執行到完成或主動 yield 才讓出 CPU，排程器不強制中斷 |
| C. 提供 preemptive 有利的範例情境 | 1 分 | 合理範例，例如：time-sharing 系統、互動式使用者公平共享 CPU、防止長時間任務壟斷 CPU 等 |

---

## 評分原則

- 三個分項各自獨立給 0 或 1 分，合計 0–3 分。
- 只要核心概念正確即給分，不要求用詞一致；允許以例子間接呈現定義。
- 若 A/B 混淆（定義對調）則兩分均不給。
- 範例情境（C）須明確指出情境為何有利於 preemptive；僅說「real-time system」而未解釋原因，給 0.5→四捨五入為 0（整數評分）。
- 答案空白或完全無關給 0 分。
- **最終 score 必須為整數（0、1、2、3）。**
