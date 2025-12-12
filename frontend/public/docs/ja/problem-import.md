# YAML で問題を作成する

このガイドでは、YAML 形式を使用してプログラミング問題を作成する方法を説明します。

## YAML 形式の概要

YAML は人間が読みやすいデータシリアライゼーション形式で、問題データの定義に最適です。完全な問題 YAML ファイルには以下のセクションが含まれます：

| セクション   | 必須   | 説明                                     |
| ------------ | ------ | ---------------------------------------- |
| 基本情報     | はい   | タイトル、難易度、時間/メモリ制限        |
| 翻訳         | はい   | 少なくとも 1 つの言語での問題説明        |
| テストケース | はい   | 入出力テストケース                       |
| 言語設定     | いいえ | 各プログラミング言語のテンプレートコード |

---

## 基本情報フィールド

```yaml
---
title: "A + B Problem"
difficulty: easy # easy | medium | hard
time_limit: 1000 # ミリ秒 (ms)
memory_limit: 256 # MB
is_visible: true # 問題リストに表示するか
is_practice_visible: true # 練習モードで表示するか
```

### フィールド説明

| フィールド            | 型     | 説明                            |
| --------------------- | ------ | ------------------------------- |
| `title`               | 文字列 | 問題のデフォルトタイトル        |
| `difficulty`          | 文字列 | `easy`、`medium`、または `hard` |
| `time_limit`          | 整数   | 実行時間制限（ミリ秒）          |
| `memory_limit`        | 整数   | メモリ制限（MB）                |
| `is_visible`          | ブール | 公開表示するか                  |
| `is_practice_visible` | ブール | 練習モードで表示するか          |

---

## 多言語翻訳

システムは多言語の問題説明をサポートしています：

```yaml
translations:
  - language: "ja"
    title: "A + B 問題"
    description: |
      2つの整数 $A$ と $B$ が与えられます。$A + B$ の値を計算してください。

      これはオンラインジャッジシステムに慣れるための標準的な練習問題です。
    input_description: |
      スペースで区切られた2つの整数 $A$ と $B$ を含む1行。

      **制約**
      - $-10^9 \le A, B \le 10^9$
    output_description: |
      $A + B$ の和を表す整数を1つ出力してください。
    hint: "C++ではオーバーフローを避けるためにlong longを使用してください。"

  - language: "en"
    title: "A + B Problem"
    description: |
      Given two integers $A$ and $B$, compute the value of $A + B$.
    input_description: |
      A single line containing two integers $A$ and $B$.
    output_description: |
      Output a single integer representing the sum.
    hint: "Use long long in C++ to avoid overflow."
```

### サポートされる言語コード

| コード  | 言語       |
| ------- | ---------- |
| `zh-TW` | 繁体中国語 |
| `en`    | 英語       |
| `ja`    | 日本語     |
| `ko`    | 韓国語     |

### 数式

問題説明では LaTeX 数式をサポートしています：

- インライン数式：`$...$` を使用、例：`$A + B$`
- ブロック数式：`$$...$$` を使用

---

## テストケース

テストケースはサンプルテストと隠しテストに分かれます：

```yaml
test_cases:
  # サンプルテスト - ユーザーに表示される
  - input_data: "1 2"
    output_data: "3"
    is_sample: true

  - input_data: "100 200"
    output_data: "300"
    is_sample: true

  # 隠しテスト - ユーザーには表示されない
  - input_data: "0 0"
    output_data: "0"
    is_sample: false
    score: 20

  - input_data: "-1 1"
    output_data: "0"
    is_sample: false
    score: 30

  - input_data: "1000000000 1000000000"
    output_data: "2000000000"
    is_sample: false
    score: 50
```

### フィールド説明

| フィールド    | 型     | 説明                                 |
| ------------- | ------ | ------------------------------------ |
| `input_data`  | 文字列 | テスト入力データ                     |
| `output_data` | 文字列 | 期待される出力                       |
| `is_sample`   | ブール | サンプルテストの場合は `true`        |
| `score`       | 整数   | このテストケースの配点（オプション） |

> `score` を指定しない場合、総得点は均等に分配されます。

---

## 言語設定

各プログラミング言語のテンプレートコードを提供できます：

```yaml
language_configs:
  - language: "cpp"
    template_code: |
      #include <iostream>
      using namespace std;

      int main() {
          // ここにコードを書いてください
          return 0;
      }

  - language: "python"
    template_code: |
      # ここにコードを書いてください
      pass

  - language: "java"
    template_code: |
      import java.util.Scanner;

      public class Main {
          public static void main(String[] args) {
              // ここにコードを書いてください
          }
      }
```

### サポートされる言語

| コード   | 言語   | コンパイラ/バージョン |
| -------- | ------ | --------------------- |
| `cpp`    | C++    | G++ 11, C++17         |
| `c`      | C      | GCC 11, C11           |
| `python` | Python | Python 3.10           |
| `java`   | Java   | OpenJDK 17            |

---

## 完全な例

以下は完全な問題 YAML の例です：

```yaml
---
title: "A + B Problem"
difficulty: easy
time_limit: 1000
memory_limit: 256
is_visible: true
is_practice_visible: true

translations:
  - language: "ja"
    title: "A + B 問題"
    description: |
      2つの整数 $A$ と $B$ が与えられます。$A + B$ の値を計算してください。
    input_description: |
      スペースで区切られた2つの整数 $A$ と $B$ を含む1行。
    output_description: |
      $A + B$ の和を表す整数を1つ出力してください。
    hint: "整数オーバーフローに注意してください。"

test_cases:
  - input_data: "1 2"
    output_data: "3"
    is_sample: true

  - input_data: "1000000000 1000000000"
    output_data: "2000000000"
    is_sample: false
    score: 100

language_configs:
  - language: "cpp"
    template_code: |
      #include <iostream>
      using namespace std;

      int main() {
          long long a, b;
          cin >> a >> b;
          cout << a + b << endl;
          return 0;
      }
```

---

## 問題のインポート

### 管理画面を使用

1. 管理者アカウントでログイン
2. 「問題管理」ページへ移動
3. 「問題をインポート」ボタンをクリック
4. YAML ファイルをアップロード
5. インポート結果を確認

### API を使用

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@problem.yaml" \
  https://q-judge.quan.wtf/api/v1/problems/import/
```

---

## よくある問題

### YAML 形式エラー

以下を確認してください：

- 正しいインデントを使用（2 または 4 スペース、タブは不可）
- 特殊文字を含む文字列は引用符で囲む
- 複数行テキストには `|` 記号を使用

### テストデータの注意点

- 入出力の末尾に余分な改行は不要
- 出力が期待値と完全に一致することを確認（スペースを含む）
- 大きなテストデータはファイルパス参照を使用可能

### 数式が表示されない

- 正しい LaTeX 構文を確認
- インライン数式には `$...$` を使用
- 特殊文字をエスケープ（例：アンダースコアには `\_`）
