# Rubric：fork() 印出 "hello" 次數

## 題目
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

## 參考答案
**5 次**

## 執行邏輯
| Process | 路徑 | printf 次數 |
|---------|------|------------|
| P0（parent of first fork） | 不進入 if，只執行最後 printf | 1 |
| P1（child of first fork） | 進入 if，執行 if 內 printf + 最後 printf | 2 |
| P2（child of second fork，P1 的子） | 進入 if，執行 if 內 printf + 最後 printf | 2 |
| **合計** | | **5** |

## 評分標準

| 分數 | 條件 |
|------|------|
| 2 | 答案為 5（可含單位說明如「5 times」「5次」等，語意正確即可） |
| 1 | 答案為 3 或 4（部分理解，但計算有誤） |
| 0 | 答案為 1、2、6、7 或其他明顯錯誤 |

## 說明
- 答案僅需為數字，不要求說明過程。
- 「5 times」「5次」等表述視同正確，給 2 分。
- 答案超出合理範圍（如 6、7 等）或顯著偏離（如 1、2），給 0 分。
- 答案 3 或 4 屬於常見誤解（如忽略某個 process 的 printf），給 1 分。
