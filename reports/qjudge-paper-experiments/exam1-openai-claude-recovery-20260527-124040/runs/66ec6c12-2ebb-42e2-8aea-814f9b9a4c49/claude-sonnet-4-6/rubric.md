# Rubric — fork + execl 程式碼輸出題

## 題目
```c
main() {
  fork();
  execl("/bin/echo", "echo", "hello", 0);
  printf("done\n");
}
```
**題型**：short_answer  
**滿分**：2 分

## 參考解答
> "hello" is printed twice; "done" is never printed. (execl replaces the process image).

## 核心概念
1. `fork()` 產生一個子行程，父行程與子行程各自繼續執行。
2. 兩個行程（父＋子）都會呼叫 `execl("/bin/echo", "echo", "hello", 0)`。
3. `execl` 成功時**取代**當前行程的 image，因此 `printf("done\n")` 永遠不會被執行。
4. 結果：`hello` 被印出**兩次**（父行程一次、子行程一次），`done` 完全不出現。

## 評分標準

| 分數 | 條件 |
|------|------|
| **2** | 正確說出 `hello` 印兩次，**且** `done` 不會印出（含合理解釋 execl 取代 process image 或等效說法）。 |
| **1** | 僅答對其中一點：(a) `hello` 印兩次但未提及 `done`；或 (b) 提到 `done` 不印但未正確說明 `hello` 的次數；或 (c) 兩點都提到但描述明顯不完整/有小誤。 |
| **0** | 完全錯誤、空白、或核心概念均錯（如答 `hello` 只印一次、或說 `done` 會印出）。 |

## 評分備注
- 不要求精確術語（如「process image」），但需顯示理解 `execl` 的行為（取代/不返回）。
- 答案提到「fork 產生兩個行程」且兩個都執行 echo 即可支持「印兩次」的判斷。
- 順序、格式不影響得分。
- Blind grading：不參考任何既有人工分數或評語。
