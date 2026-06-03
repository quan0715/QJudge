# 評分 Rubric — fork() + execl() 輸出題

## 題目
```c
main() {
  fork();
  execl("/bin/echo", "echo", "hello", 0);
  printf("done\n");
}
```
**What is the result of this code?**

## 滿分：2 分

## 正確答案（參考解答）
「hello」 printed twice；「done」 never printed。
（fork() 建立兩個 process；兩者各自執行 execl() 將 process image 取代為 `/bin/echo hello`，故 printf("done") 永不執行。）

## 評分標準

### 2 分（滿分）
正確寫出或描述輸出結果：**hello 出現兩次，done 完全沒有出現**。

涵蓋以下形式：
- 直接寫輸出字串：「hellohello」、「hello hello」、「hello\nhello」
- 明確描述：「兩個 hello 且不會印 done」、「print hello two times, no done」
- 解釋性回答且結論正確：說明 fork 建立兩 process，execl 取代後只 echo hello

### 1 分（部分正確）
僅掌握 fork() 或 execl() 其中一個概念（含語意不清、不完整）：
- 知道 fork 會產生兩個 hello，但認為 done 也會被印出（如「hello hello done」）
- 知道 execl 取代 process 使得 done 不執行，但忽略 fork 複製（如只寫「hello」）
- 僅說「印兩個 hello」但未處理 done 問題
- 概念方向正確但表達混亂或關鍵缺失

### 0 分（錯誤）
輸出結果完全錯誤或無意義：
- 只輸出「done」或「done done」
- 輸出「2」、「0」、「none」
- 無關敘述或完全無法理解
