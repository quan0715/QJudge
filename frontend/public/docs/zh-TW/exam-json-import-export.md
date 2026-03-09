本文件說明 QJudge 「紙筆題考試 (Paper-like Test)」題目的 JSON 匯入與匯出格式規範。透過此格式，教師可以快速地進行跨考試的題目復用或大量題目建立。

---

## 1. 核心 JSON 結構

匯入與匯出的 JSON 檔案應為一個 **題目物件的陣列 (Array of Objects)**。每個題目物件包含以下欄位：

| 欄位名稱 | 型別 | 必填 | 說明 |
| :--- | :--- | :--- | :--- |
| `question_type` | String | 是 | 題型代碼，詳見[題型代碼表](#2-題型代碼表) |
| `prompt` | String | 是 | 題目內容，支援 Markdown 與 LaTeX |
| `score` | Number | 是 | 該題配分（正整數） |
| `options` | Array | 否 | 選擇題選項，為字串陣列。簡答/問答題應為 `[]` |
| `correct_answer` | Mixed | 否 | 正確答案，格式依題型而定 |
| `order` | Number | 否 | 顯示順序（由小到大） |

---

## 2. 題型代碼表 (Question Types)

| 代碼 (`question_type`) | 說明 | `correct_answer` 格式 |
| :--- | :--- | :--- |
| `single_choice` | 單選題 | Number (選項索引，從 0 開始) |
| `multiple_choice` | 多選題 | Array of Numbers (索引陣列，如 `[0, 2]`) |
| `true_false` | 是非題 | Boolean (`true` 或 `false`) |
| `short_answer` | 簡答題 | String (參考答案，可留空) |
| `essay` | 問答題 | String (參考答案，可留空) |

---

## 3. 各題型範例

### 單選題 (Single Choice)
```json
{
  "question_type": "single_choice",
  "prompt": "下列哪一個是 Python 的保留字？",
  "score": 5,
  "options": ["var", "let", "def", "function"],
  "correct_answer": 2,
  "order": 1
}
```

### 多選題 (Multiple Choice)
```json
{
  "question_type": "multiple_choice",
  "prompt": "以下哪些屬於編譯式語言？",
  "score": 10,
  "options": ["C++", "Python", "Rust", "JavaScript"],
  "correct_answer": [0, 2],
  "order": 2
}
```

### 是非題 (True/False)
```json
{
  "question_type": "true_false",
  "prompt": "HTML 是一種程式語言。",
  "score": 5,
  "options": ["True", "False"],
  "correct_answer": false,
  "order": 3
}
```

### 問答題 (Essay)
```json
{
  "question_type": "essay",
  "prompt": "請簡述 RESTful API 的核心原則。",
  "score": 20,
  "options": [],
  "correct_answer": "包含：無狀態 (Stateless)、統一介面 (Uniform Interface)...",
  "order": 4
}
```

---

## 4. 匯入規則與注意事項

1. **覆蓋機制**：匯入 JSON 時，系統通常會將檔案中的題目「追加」到現有的題目列表末端。
2. **格式校驗**：
   - 選擇題的 `correct_answer` 索引必須存在於 `options` 陣列中。
   - 總配分會自動加總，請確認與您的考試設定一致。
3. **媒體資源**：目前 JSON 僅支援純文字內容（含 Markdown 語法的圖片連結）。若有本地圖片需求，請先上傳至圖床再於 `prompt` 中引用。
4. **凍結保護**：若考試已經開始且有學生作答，匯入功能可能會受限，建議在考試開始前完成所有題目匯入。

---

## 5. 常見錯誤處理

- **`options must be an array`**：請檢查 `options` 是否使用了中括號 `[]`。
- **`score must be greater than 0`**：配分不可為 0 或負數。
- **`Invalid JSON format`**：請確保檔案符合標準 JSON 規範（例如：最後一個物件後不可有逗號）。
