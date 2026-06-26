# 評分準則

## 題目
How many times does the following code print "hello"?

```c
main() {
    if (fork() == 0) {
        fork(); printf("hello\n");
    };
    printf("hello\n");
}
```

## 滿分
2 分

## 正確答案
**5** 次

### 執行流程說明（供評分參考）
1. 原始父程序 (A)：fork() 回傳子程序 PID（非 0），跳過 if 本體，印一次 "hello"。→ 1 次
2. 子程序 (B)：進入 if（fork() == 0），再 fork() 產生孫程序 (C)，B 印 "hello"（if 內）。離開 if 後再印一次。→ 2 次
3. 孫程序 (C)：由 B 的 fork 產生，也在 if 內部執行，印 "hello"（if 內）。離開 if 後再印一次。→ 2 次
總計：1 + 2 + 2 = **5 次**。

## 給分標準

| 答案 | 分數 | reason |
|------|------|--------|
| 5 / 5 times / 5次 | 2 | （留空，滿分不填理由） |
| 其他數值 | 0 | 簡述錯誤原因，指明正確答案為 5 |

## reason 政策
- 滿分（2 分）→ reason 留空
- 非滿分（0 分）→ 必填 reason，簡述為何錯誤
