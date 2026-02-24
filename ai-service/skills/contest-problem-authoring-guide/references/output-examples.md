# 回覆範本（內容設計階段）

## 最小可用輸出

1. 題目核心目標
- 能力：字串 + DP
- 難度：hard

2. 題目規格草案
- 敘述：給定字串 S，求...
- 輸入：第一行 N，第二行 S
- 輸出：最小操作次數
- 限制：N <= 2e5
- 保證：輸入只含小寫英文字母

3. 測資設計
- Sample：一般案例、重複字元案例
- Hidden：最小邊界、最大邊界、易錯 off-by-one

4. 風險與待確認
- 是否允許空字串
- 是否需要英文翻譯

## 禁止內容

- 不產生 `/api/v1/problems/` payload
- 不產生 JSON Patch
- 不提 `prepare_problem_create` 或 `commit_problem_action` 實作步驟
