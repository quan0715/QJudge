# Rubric — fork() hello 印幾次

## 題目
```c
main() {
 if (fork() == 0) {
  fork(); printf("hello\n");
 };
 printf("hello\n");
}
```
問：程式共印幾次 "hello"？

## 參考解析
- 原始行程（P0）呼叫 `fork()`，產生子行程 P1（fork()==0）。
- P1 進入 if，再呼叫 `fork()`，產生孫行程 P2。
- P1 印 hello（if 內）→ 再印 hello（if 外）= 2 次。
- P2 印 hello（if 內）→ 再印 hello（if 外）= 2 次。
- P0（parent，fork()!=0）不進 if → 只印 hello（if 外）= 1 次。
- **合計：5 次**

## 評分標準（滿分 2 分）

| 分數 | 條件 |
|------|------|
| 2    | 答案為 5（含正確數字即可，不需解釋）；或答案為 5 且附正確解析。 |
| 1    | 答案為 3 或 4（有部分理解 fork 行為但計算有誤）；或答案不是 5 但附有大體正確的 fork 邏輯解析。 |
| 0    | 答案明顯錯誤（≠3/4/5）、空白、完全不知 fork 語意。 |

## reason 政策
- 滿分（2 分）→ reason 留空。
- 非滿分 → 必填 reason，簡述扣分原因。
