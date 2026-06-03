# Rubric：fork() printf 次數計算

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
**5**（含文字說明「5 次」、「5 times」等均視為正確）

## 執行邏輯
| 行程 | 說明 | 印 hello 次數 |
|------|------|--------------|
| Parent | fork()==0 為 false，不進 if；執行最後 printf | 1 |
| Child1 | fork()==0 為 true，進 if；執行 if 內 fork() 產生 Child2；印 if 內 printf；跳出後印最後 printf | 2 |
| Child2 | 由 Child1 fork 產生，已在 if 內；印 if 內 printf；跳出後印最後 printf | 2 |
| **合計** | | **5** |

## 評分標準
| 分數 | 條件 |
|------|------|
| 2 | 答案為 5（含 "5次"、"5 times"、"five" 等語意正確形式） |
| 1 | 答案接近但錯誤（如 4、6），可能部分理解 fork 行為但有計算錯誤 |
| 0 | 答案明顯錯誤（如 1、2、3、7 以上），或無法對應任何合理誤解 |

### 補充說明
- 答案 **4**：常見誤解為 Child2 不執行最後 printf，或誤算 Parent/Child fork 數量，給 **1 分**。
- 答案 **3**：誤以為只有 2 個 process，給 **0 分**。
- 答案 **2**：嚴重誤解，給 **0 分**。
- 答案 **1**：嚴重誤解，給 **0 分**。
- 答案 **6**：超過正確答案，給 **1 分**（部分理解但過算）。
- 答案 **7 以上**：給 **0 分**。
