# 評分準則：Multicasting — 0-reliable / M-out-of-N-reliable

## 題目
"In multicasting systems, specify the meaning of 0-reliable and M-out-of-N-reliable semantics."

## 滿分：2 分

## 參考答案
- **0-reliable**: The sender expects no response from any receiver.
- **M-out-of-N-reliable**: The sender expects responses from exactly M receivers out of a group of N.

## 配分與判斷標準

### 1. 0-reliable（1 分）
- **1.0 分** — 清楚表達：sender 不期待任何 receiver 回覆／回應／確認。
- **0.5 分** — 方向正確但模糊（如僅說「不需要回應」未點明 sender 角色，或語意不完全）。
- **0.0 分** — 錯誤解釋（如：保證收到、無人收到、交換了 sender/receiver 角色）或未作答。

### 2. M-out-of-N-reliable（1 分）
- **1.0 分** — 清楚表達：在 N 個 receiver 的群組中，sender 期待 M 個 receiver 回應（M < N，或 1 < M < N）。
- **0.5 分** — 大致提到 M out of N 但關鍵細節有誤（如 M 與 N 角色互換、條件寫錯、語意不清）。
- **0.0 分** — 錯誤解釋或未作答。

## 注意事項
- M 與 N 的數字大小關係（M < N）是核心，寫反或概念錯則扣分。
- 若只回答其中一個概念，最多得 1 分。
- 若完全空白或明顯不相關（如 JSON 空物件），得 0 分。
- 可接受中英文混寫，評分重點在語意正確性。
