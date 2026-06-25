# Rubric: Multicasting Reliability Semantics

**題目**: In multicasting systems, specify the meaning of 0-reliable and M-out-of-N-reliable semantics.

**滿分**: 2 分（每項 1 分）

---

## 0-reliable（1 分）

| 分數 | 標準 |
|------|------|
| 1 | 正確表達核心概念：sender 不預期收到任何 receiver 的回應（no response expected from any receiver）。可接受等價說法如「不需要回應」、「不等待 ACK」、「no reply needed」等。 |
| 0.5 | 概念方向正確但表達有明顯瑕疵（如籠統到無法確認理解），或混入錯誤資訊但仍可辨識核心意圖。 |
| 0 | 完全錯誤（如「sender 預期收到一個回應」、「receiver 收不到訊息」、「沒有人能收到訊息」等）。 |

## M-out-of-N-reliable（1 分）

| 分數 | 標準 |
|------|------|
| 1 | 正確表達核心概念：sender 預期從 N 個 receiver 中收到 M 個回應（M responses expected from N receivers）。必須具備兩個要素：N（接收者總數）與 M（預期回應數），且 M 與 N 的關係合理（1<M<N、M≤N、0<M<N 等皆可）。 |
| 0.5 | 部分正確但缺少關鍵要素（如未提及 N、未提及 M 與 N 的關係、約束條件明顯錯誤但方向正確），或概念正確但表達模糊。 |
| 0 | 完全錯誤（如 M 與 N 角色互換、定義為「收不到訊息」、「N 個人中有 N 個回應」等明顯偏離定義）。 |

---

## 給分原則

- 滿分（2 分）→ reason 留空
- 非滿分 → reason 簡述扣分依據
- 評分以概念正確性為核心，不扣拼字/文法錯誤
- 範例（如 time signal generator、RAID）不影響評分，僅作為輔助理解
