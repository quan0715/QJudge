# 支援的程式語言

QJudge 支援多種主流程式語言，以下是完整清單與相關資訊。

## 語言清單

| 語言     | 版本       | 編譯/執行命令                         |
| -------- | ---------- | ------------------------------------- |
| C        | GCC 11     | `gcc -O2 -std=c11 -o main main.c -lm` |
| C++      | G++ 11     | `g++ -O2 -std=c++17 -o main main.cpp` |
| Python 3 | 3.10       | `python3 main.py`                     |
| Java     | OpenJDK 17 | `javac Main.java && java Main`        |

## 各語言注意事項

### C/C++

**推薦的標頭檔**：

```cpp
#include <iostream>
#include <vector>
#include <algorithm>
#include <string>
#include <cmath>
#include <map>
#include <set>
#include <queue>
```

**效能優化**：

```cpp
// 在 main 函數開頭加入
ios::sync_with_stdio(false);
cin.tie(nullptr);
```

### Python

**輸入輸出**：

```python
# 單行輸入
n = int(input())

# 多個數字
a, b = map(int, input().split())

# 列表輸入
arr = list(map(int, input().split()))
```

**注意事項**：

- Python 的執行時間限制通常會放寬
- 建議使用內建函數和列表推導式以提升效率

### Java

**類別命名**：

主類別必須命名為 `Main`：

```java
public class Main {
    public static void main(String[] args) {
        // 您的程式碼
    }
}
```

**快速 I/O**：

```java
import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        PrintWriter out = new PrintWriter(new BufferedOutputStream(System.out));

        // 讀取與處理

        out.flush();
    }
}
```

## 時間係數

由於不同語言的執行效率差異，系統會自動調整時間限制：

| 語言   | 時間係數 |
| ------ | -------- |
| C/C++  | 1x       |
| Java   | 2x       |
| Python | 3x       |

例如：若題目時間限制為 1 秒，Python 程式實際有 3 秒的執行時間。

## 選擇建議

| 情境         | 推薦語言 |
| ------------ | -------- |
| 追求執行效率 | C++      |
| 快速開發     | Python   |
| 熟悉物件導向 | Java     |
| 學習資料結構 | C++      |

## 語言比較

### 優缺點比較

**C++**

- 執行速度快
- STL 功能強大
- 語法較複雜

**Python**

- 語法簡潔
- 開發速度快
- 執行較慢

**Java**

- 跨平台
- 物件導向完整
- 程式碼較冗長

選擇您最熟悉的語言，專注於解題邏輯！
