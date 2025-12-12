# 使用 YAML 建立題目

本指南說明如何使用 YAML 格式批量建立程式題目。

## YAML 格式概覽

YAML 是一種人類可讀的資料序列化格式，非常適合用於定義題目資料。一個完整的題目 YAML 檔案包含以下區塊：

| 區塊     | 必填 | 說明                            |
| -------- | ---- | ------------------------------- |
| 基本資訊 | 是   | 題目標題、難度、時間/記憶體限制 |
| 翻譯     | 是   | 至少一種語言的題目描述          |
| 測試資料 | 是   | 輸入輸出測試案例                |
| 語言設定 | 否   | 各程式語言的模板程式碼          |

---

## 基本資訊欄位

```yaml
---
title: "A + B Problem"
difficulty: easy # easy | medium | hard
time_limit: 1000 # 毫秒 (ms)
memory_limit: 256 # MB
is_visible: true # 是否在題庫中顯示
is_practice_visible: true # 是否在練習模式中顯示
```

### 欄位說明

| 欄位                  | 類型 | 說明                       |
| --------------------- | ---- | -------------------------- |
| `title`               | 字串 | 題目的預設標題             |
| `difficulty`          | 字串 | `easy`、`medium` 或 `hard` |
| `time_limit`          | 整數 | 執行時間限制（毫秒）       |
| `memory_limit`        | 整數 | 記憶體限制（MB）           |
| `is_visible`          | 布林 | 是否公開顯示               |
| `is_practice_visible` | 布林 | 是否在練習模式顯示         |

---

## 多語言翻譯

系統支援多語言題目描述，每個翻譯包含：

```yaml
translations:
  - language: "zh-TW"
    title: "A + B 問題"
    description: |
      給定兩個整數 $A$ 和 $B$，計算 $A + B$ 的值。

      這是一個標準的練習題，用來熟悉 Online Judge 系統。
    input_description: |
      一行包含兩個整數 $A$ 和 $B$，以空格分隔。

      **限制條件**
      - $-10^9 \le A, B \le 10^9$
    output_description: |
      輸出一個整數，代表 $A + B$ 的和。
    hint: "在 C++ 中請使用 long long 以避免溢位。"

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

### 支援的語言代碼

| 代碼    | 語言     |
| ------- | -------- |
| `zh-TW` | 繁體中文 |
| `en`    | 英文     |
| `ja`    | 日文     |
| `ko`    | 韓文     |

### 數學公式

題目描述支援 LaTeX 數學公式：

- 行內公式：使用 `$...$`，例如 `$A + B$`
- 區塊公式：使用 `$$...$$`

---

## 測試資料

測試資料分為範例測試和隱藏測試：

```yaml
test_cases:
  # 範例測試 - 會顯示給使用者
  - input_data: "1 2"
    output_data: "3"
    is_sample: true

  - input_data: "100 200"
    output_data: "300"
    is_sample: true

  # 隱藏測試 - 不會顯示給使用者
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

### 欄位說明

| 欄位          | 類型 | 說明                     |
| ------------- | ---- | ------------------------ |
| `input_data`  | 字串 | 測試輸入資料             |
| `output_data` | 字串 | 預期輸出結果             |
| `is_sample`   | 布林 | `true` 表示範例測試      |
| `score`       | 整數 | 該測試案例的配分（選填） |

> 如果不指定 `score`，系統會平均分配總分。

---

## 程式語言設定

可為不同程式語言提供模板程式碼：

```yaml
language_configs:
  - language: "cpp"
    template_code: |
      #include <iostream>
      using namespace std;

      int main() {
          // 在此撰寫程式碼
          return 0;
      }

  - language: "python"
    template_code: |
      # 在此撰寫程式碼
      pass

  - language: "java"
    template_code: |
      import java.util.Scanner;

      public class Main {
          public static void main(String[] args) {
              // 在此撰寫程式碼
          }
      }
```

### 支援的程式語言

| 代碼     | 語言   | 編譯器/版本   |
| -------- | ------ | ------------- |
| `cpp`    | C++    | G++ 11, C++17 |
| `c`      | C      | GCC 11, C11   |
| `python` | Python | Python 3.10   |
| `java`   | Java   | OpenJDK 17    |

---

## 完整範例

以下是一個完整的題目 YAML 範例：

```yaml
---
title: "A + B Problem"
difficulty: easy
time_limit: 1000
memory_limit: 256
is_visible: true
is_practice_visible: true

translations:
  - language: "zh-TW"
    title: "A + B 問題"
    description: |
      給定兩個整數 $A$ 和 $B$，計算 $A + B$ 的值。
    input_description: |
      一行包含兩個整數 $A$ 和 $B$，以空格分隔。
    output_description: |
      輸出一個整數，代表 $A + B$ 的和。
    hint: "請注意整數溢位問題。"

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

## 匯入題目

### 使用管理介面

1. 登入管理員帳號
2. 進入「題目管理」頁面
3. 點擊「匯入題目」按鈕
4. 上傳 YAML 檔案
5. 確認匯入結果

### 使用 API

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@problem.yaml" \
  https://q-judge.quan.wtf/api/v1/problems/import/
```

---

## 常見問題

### YAML 格式錯誤

確保：

- 使用正確的縮排（2 或 4 個空格，不要使用 Tab）
- 字串中包含特殊字元時使用引號包裹
- 多行文字使用 `|` 符號

### 測試資料注意事項

- 輸入輸出結尾不需要額外換行符號
- 確保輸出與預期完全一致（包括空格）
- 大型測試資料可使用檔案路徑引用

### 數學公式無法顯示

- 確認使用正確的 LaTeX 語法
- 行內公式使用 `$...$`
- 跳脫特殊字元（如 `\_` 表示底線）
