# Rubric: Critical Section Problem Requirements

## 題目
Describe the three requirements that a solution to the Critical Section problem must satisfy to be considered correct.

## 滿分
3 分

## 參考答案
1. **Mutual Exclusion**：同一時間只能有一個 process 在 Critical Section 中執行。
2. **Progress**：若沒有 process 在 Critical Section，且有 process 希望進入，則選擇下一個進入的 process 不可無限期延遲（不能靠不在 remainder section 的 process 之外來阻擋）。
3. **Bounded Waiting**：從一個 process 提出進入 CS 的請求到被允許之間，其他 process 進入 CS 的次數有上限（不能讓某個 process 等待無限次）。

---

## 評分標準

| 分數 | 條件 |
|------|------|
| 3    | 正確列出三個條件，且每個條件有合理說明（即使用詞略異，概念正確即可）。 |
| 2    | 正確描述其中兩個條件（第三個完全缺漏或概念錯誤）。 |
| 1    | 只正確描述一個條件，或有三個名稱但說明明顯錯誤兩項以上。 |
| 0    | 完全未答、答非所問、或三個條件全部概念錯誤。 |

### 判斷原則
- 名稱不需完全一致，概念正確即給分（例如："only one process at a time" 視為 Mutual Exclusion 正確）。
- Progress 最易混淆：需有「不能無限期推遲選擇」或「無人在 CS 時不應阻擋進入」的核心概念。
- Bounded Waiting 需有「等待次數/時間有上限」的概念。
- 滿分（3分）時 reason 留空；非滿分時 reason 必填，簡述扣分原因。
