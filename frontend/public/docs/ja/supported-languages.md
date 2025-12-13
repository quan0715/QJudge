# 対応言語

QJudge は複数の主要プログラミング言語をサポートしています。

## 言語一覧

| 言語     | バージョン | コンパイル/実行コマンド               |
| -------- | ---------- | ------------------------------------- |
| C        | GCC 11     | `gcc -O2 -std=c11 -o main main.c -lm` |
| C++      | G++ 11     | `g++ -O2 -std=c++17 -o main main.cpp` |
| Python 3 | 3.10       | `python3 main.py`                     |
| Java     | OpenJDK 17 | `javac Main.java && java Main`        |

## 言語別の注意点

### C/C++

**推奨ヘッダファイル**：

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

**パフォーマンス最適化**：

```cpp
// main 関数の最初に追加
ios::sync_with_stdio(false);
cin.tie(nullptr);
```

### Python

**入出力**：

```python
# 単一行入力
n = int(input())

# 複数の数値
a, b = map(int, input().split())

# リスト入力
arr = list(map(int, input().split()))
```

**注意点**：

- Python の実行時間制限は通常緩和されます
- 効率を上げるために組み込み関数とリスト内包表記を使用することをお勧めします

### Java

**クラス名**：

メインクラスは `Main` という名前にする必要があります：

```java
public class Main {
    public static void main(String[] args) {
        // コードをここに
    }
}
```

**高速 I/O**：

```java
import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        PrintWriter out = new PrintWriter(new BufferedOutputStream(System.out));

        // 読み取りと処理

        out.flush();
    }
}
```

## 時間係数

| 言語   | 時間係数 |
| ------ | -------- |
| C/C++  | 1x       |
| Java   | 2x       |
| Python | 3x       |

例：問題の時間制限が 1 秒の場合、Python プログラムは実際に 3 秒の実行時間があります。

## 選択の推奨

| シナリオ       | 推奨言語 |
| -------------- | -------- |
| 実行効率重視   | C++      |
| 素早い開発     | Python   |
| オブジェクト指向に慣れている | Java     |
| データ構造の学習 | C++      |

## 言語比較

### 長所と短所の比較

**C++**

- 実行速度が速い
- STL が強力
- 構文がやや複雑

**Python**

- 構文が簡潔
- 開発速度が速い
- 実行が遅い

**Java**

- クロスプラットフォーム
- オブジェクト指向が完全
- コードが長くなりがち

最も慣れている言語を選んで、問題解決のロジックに集中しましょう！
