# コード提出

QJudge システムでコードを提出する方法を説明します。

## 提出プロセス

### 1. プログラミング言語を選択

コードエディタ上部のドロップダウンメニューからプログラミング言語を選択します。

### 2. コードを書く

エディタで解答を書きます。注意点：

- プログラムは標準入力（`stdin`）から読み取る必要があります
- プログラムは標準出力（`stdout`）に出力する必要があります
- 出力形式が問題の要件と完全に一致していることを確認してください

### 3. 提出

「提出」ボタンをクリックして、コードをジャッジシステムに送信します。

## コードテンプレート

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

## 提出制限

- **提出頻度**：ジャッジが完了するまで次の提出を待つ必要があります
- **コード長**：最大 64 KB
- **出力サイズ**：256 MB まで

## よくある質問

### ローカルでは動作するのに、提出すると失敗するのはなぜ？

よくある原因：

- 出力形式が正しくない（余分なスペース、改行）
- エッジケースが処理されていない
- 整数オーバーフロー
- 配列の範囲外アクセス

問題文の出力形式要件を注意深く確認してください。
