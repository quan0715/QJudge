このドキュメントでは、QJudge 「ペーパー形式の試験 (Paper-like Test)」における問題の JSON インポートおよびエクスポートの形式仕様について説明します。この形式を使用することで、教師は試験間での問題の再利用や、大量の問題作成を迅速に行うことができます。

---

## 1. コア JSON 構造

インポートおよびエクスポートされる JSON ファイルは、**問題オブジェクトの配列 (Array of Objects)** である必要があります。各問題オブジェクトには以下のフィールドが含まれます。

| フィールド名 | 型 | 必須 | 説明 |
| :--- | :--- | :--- | :--- |
| `question_type` | String | はい | 問題タイプコード。詳細は [問題タイプコード表](#2-問題タイプコード表) を参照 |
| `prompt` | String | はい | 問題の内容。Markdown および LaTeX をサポート |
| `score` | Number | はい | その問題の配点（正の整数） |
| `options` | Array | いいえ | 選択肢。文字列の配列。記述式/論述式の場合は `[]` |
| `correct_answer` | Mixed | いいえ | 正解。形式は問題タイプに依存 |
| `order` | Number | いいえ | 表示順序（昇順） |

---

## 2. 問題タイプコード表 (Question Types)

| コード (`question_type`) | 説明 | `correct_answer` の形式 |
| :--- | :--- | :--- |
| `single_choice` | 単一選択問題 | Number (0 から始まる選択肢のインデックス) |
| `multiple_choice` | 複数選択問題 | Array of Numbers (インデックスの配列。例: `[0, 2]`) |
| `true_false` | 正誤判定問題 | Boolean (`true` または `false`) |
| `short_answer` | 記述式問題 | String (模範解答。空欄可) |
| `essay` | 論述式問題 | String (模範解答。空欄可) |

---

## 3. 各問題タイプの例

### 単一選択問題 (Single Choice)
```json
{
  "question_type": "single_choice",
  "prompt": "次のうち、Python の予約語はどれですか？",
  "score": 5,
  "options": ["var", "let", "def", "function"],
  "correct_answer": 2,
  "order": 1
}
```

### 複数選択問題 (Multiple Choice)
```json
{
  "question_type": "multiple_choice",
  "prompt": "次のうち、コンパイル言語はどれですか？",
  "score": 10,
  "options": ["C++", "Python", "Rust", "JavaScript"],
  "correct_answer": [0, 2],
  "order": 2
}
```

### 正誤判定問題 (True/False)
```json
{
  "question_type": "true_false",
  "prompt": "HTML はプログラミング言語である。",
  "score": 5,
  "options": ["True", "False"],
  "correct_answer": false,
  "order": 3
}
```

### 論述式問題 (Essay)
```json
{
  "question_type": "essay",
  "prompt": "RESTful API の主要な原則について簡潔に説明してください。",
  "score": 20,
  "options": [],
  "correct_answer": "ステートレス (Stateless)、統一インターフェース (Uniform Interface) などを含む...",
  "order": 4
}
```

---

## 4. インポートのルールと注意事項

1. **上書きメカニズム**：JSON をインポートすると、通常、ファイル内の問題は既存の問題リストの末尾に「追加」されます。
2. **形式のバリデーション**：
   - 選択問題の `correct_answer` インデックスは、`options` 配列内に存在する必要があります。
   - 合計配点は自動的に計算されます。試験の設定と一致しているか確認してください。
3. **メディアリソース**：現在、JSON はテキストコンテンツ（Markdown 構文による画像リンクを含む）のみをサポートしています。ローカル画像が必要な場合は、事前に画像ホスティングサービスなどにアップロードし、そのリンクを `prompt` 内で引用してください。
4. **凍結保護**：試験がすでに開始され、学生の解答がある場合、インポート機能が制限されることがあります。試験開始前にすべての問題のインポートを完了させることをお勧めします。

---

## 5. よくあるエラーの処理

- **`options must be an array`**：`options` が角括弧 `[]` を使用しているか確認してください。
- **`score must be greater than 0`**：配点は 0 または負の数にはできません。
- **`Invalid JSON format`**：ファイルが標準的な JSON 仕様に準拠していることを確認してください（例：最後のオブジェクトの後にカンマがないか）。
