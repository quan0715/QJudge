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

## 時間係数

| 言語   | 時間係数 |
| ------ | -------- |
| C/C++  | 1x       |
| Java   | 2x       |
| Python | 3x       |

最も慣れている言語を選んで、問題解決のロジックに集中しましょう！
