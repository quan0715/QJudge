# 程式碼提交

本文說明如何在 QJudge 系統中提交程式碼。

## 提交流程

### 1. 選擇程式語言

在程式碼編輯器上方的下拉選單中選擇您要使用的程式語言。系統支援多種程式語言，詳見 [支援的程式語言](/docs/supported-languages)。

### 2. 撰寫程式碼

在編輯器中撰寫您的解答程式碼。請注意：

- 程式必須從標準輸入 (`stdin`) 讀取資料
- 程式必須輸出到標準輸出 (`stdout`)
- 確保輸出格式完全符合題目要求

### 3. 提交

點擊「提交」按鈕後，程式碼將被送至評測系統。

## 程式碼範本

### C++

```cpp
#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;
    cout << n * 2 << endl;
    return 0;
}
```

### Python

```python
n = int(input())
print(n * 2)
```

### Java

```java
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        System.out.println(n * 2);
    }
}
```

## 提交限制

- **提交頻率**：每次提交後需等待評測完成才能再次提交
- **程式碼長度**：最大 64 KB
- **檔案大小**：輸出檔案不得超過 256 MB

## 常見問題

### 為什麼我的程式在本地正確，但提交後卻錯誤？

常見原因包括：

- 輸出格式不正確（多餘空格、換行）
- 未處理邊界情況
- 整數溢位
- 陣列越界

建議仔細檢查題目的輸出格式要求。
