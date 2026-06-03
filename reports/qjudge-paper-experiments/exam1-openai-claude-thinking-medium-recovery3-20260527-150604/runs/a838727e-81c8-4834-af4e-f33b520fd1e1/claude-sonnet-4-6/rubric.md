# Rubric：Mode Switch vs. Context Switch

## 題目
What is the difference between a mode switch and a context switch?

## 滿分
2 分

## 參考答案
- **Mode switch**：將 CPU 執行模式從一個 privilege level 切換到另一個，例如透過 trap 或 system call 從 user mode 切換到 kernel mode。
- **Context switch**：儲存目前 process 的執行 context，並還原（restore）另一個 process 的執行 context，即 CPU 控制權在兩個 process 之間轉移。

## 評分準則（滿分 2 分）

| 分數 | 標準 |
|------|------|
| 2 | 正確說明 mode switch（privilege/execution mode 改變）**且**正確說明 context switch（process 間切換，含 save/restore context），兩者皆清楚區分。 |
| 1 | 只正確說明其中一個（mode switch 或 context switch），另一個錯誤、遺漏或含糊不清；或兩者都有提及但其中一個說明有明顯缺陷。 |
| 0 | 兩者皆未正確說明，或答非所問，或空白。 |

## 評分重點
- **Mode switch 要點**：提到 privilege level / execution mode 的改變（user↔kernel）；不需要提到 process 切換。
- **Context switch 要點**：提到 process 之間的切換，且涉及 execution context 的 save/restore 或 scheduling；若只說「切換 process」而完全未提 context 保存，視情況酌減。
- 兩者關係（mode switch 不一定伴隨 context switch）若有提及可視為加分點，但非必要。
- 答案語言不限（中英文皆可），意思正確即可得分。
