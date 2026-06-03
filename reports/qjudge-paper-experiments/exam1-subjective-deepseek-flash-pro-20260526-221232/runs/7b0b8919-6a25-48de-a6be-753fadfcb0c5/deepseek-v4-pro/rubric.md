# Rubric — fork() 印出次數

## 題目摘要
```
main() {
 if (fork() == 0) {
 fork(); printf("hello\n");
 };
 printf("hello\n");
}
```
問：以上程式碼共印出幾次 "hello"？

## 正確答案
**5**（參考說明：child 在 IF 內再 fork 一次；parent 只印一次）

## 執行流程
- P1（原始 process）fork → 得 P2
  - P1：fork() ≠ 0，跳過 if body → 最後 printf 印 1 次 → **1**
  - P2：fork() == 0，進入 if body → fork 得 P3
    - P2：if 內 printf 印 1 次，出去後 printf 再印 1 次 → **2**
    - P3：if 內 printf 印 1 次，出去後 printf 再印 1 次 → **2**
- **總計：1 + 2 + 2 = 5**

## 評分標準（滿分 2）

| 分數 | 條件 |
|------|------|
| 2 | 答案為 5（含等價表示如「5次」「5 times」） |
| 1 | 答案為 4 或 6：對 fork 語義有基本理解但數量計算偏差（常見少算或多算一個） |
| 0 | 答案為 1, 2, 3, 7 或其他明顯錯誤，或未作答 |
