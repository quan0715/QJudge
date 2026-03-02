# 題目匯入（YAML）

> 文件狀態：2026-03-03

本頁說明如何以 YAML 匯入題目，適合教師批次建立題庫或在不同環境間遷移題目。

## 格式版本 (QJudge v1)

QJudge 支援具備 `version` 欄位的結構化 YAML 格式，這能確保欄位解析的穩定性。

```yaml
version: "qjudge.code.v1"
metadata:
  title: "A + B Problem"
  difficulty: "easy"
  time_limit: 1000
  memory_limit: 256
  visibility: "public"
  tags: ["基礎", "算術"]

translations:
  - language: "zh-TW"
    title: "A + B 問題"
    description: "計算兩個整數 A 與 B 的和。"
    input_description: "輸入兩個整數 A 與 B。"
    output_description: "輸出 A + B 的結果。"
    hint: "可以使用 `std::cin` 讀取輸入。"
  - language: "en"
    title: "A + B Problem"
    description: "Calculate the sum of two integers A and B."
    input_description: "Two integers A and B."
    output_description: "The sum of A and B."

test_cases:
  - input_data: "1 2\n"
    output_data: "3\n"
    is_sample: true
    score: 20
  - input_data: "10 20\n"
    output_data: "30\n"
    is_sample: false
    score: 80

language_configs:
  - language: "cpp"
    template_code: |
      #include <iostream>
      using namespace std;
      int main() {
          int a, b;
          cin >> a >> b;
          cout << a + b << endl;
          return 0;
      }
    is_enabled: true

forbidden_keywords: ["vector"]
required_keywords: ["cin"]
```

## 欄位說明

### Metadata (基本資訊)
- `title`: 題目名稱。
- `difficulty`: 難度，可選 `easy`, `medium`, `hard`。
- `time_limit`: 時間限制 (ms)，範圍 100 - 10000。
- `memory_limit`: 記憶體限制 (MB)，範圍 16 - 512。
- `visibility`: 可見性，可選 `public`, `private`, `hidden`。
- `tags`: 標籤列表 (字串陣列)。

### Translations (多語系敘述)
- `language`: 語言代碼，如 `zh-TW`, `en`。
- `title`: 該語言的題目名稱。
- `description`: 題目描述 (支援 Markdown)。
- `input_description`: 輸入說明。
- `output_description`: 輸出說明。
- `hint`: 提示 (可選)。

### Test Cases (測試案例)
- `input_data`: 輸入資料。
- `output_data`: 預期輸出資料。
- `is_sample`: 是否顯示為範例。
- `score`: 該測資的分數。
- `is_hidden`: 是否隱藏 (不顯示在測試列表中)。

### Language Configs (語言設定)
- `language`: 程式語言，目前支援 `cpp`, `python`, `java`, `javascript`。
- `template_code`: 該語言的起始範本代碼。

## 舊格式相容性
系統目前仍支援不包含 `version` 的扁平格式 (Flat format)，但建議新題目皆採用 `qjudge.code.v1` 格式。

## 匯入步驟
1. 進入題目編輯頁面或競賽管理面板。
2. 點擊「匯入 YAML」按鈕。
3. 選擇檔案或貼上內容。
4. 預覽無誤後點擊「確認」。
