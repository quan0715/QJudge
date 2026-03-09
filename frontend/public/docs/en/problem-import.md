> Document Status: 2026-03-03

This page explains how to import problems using YAML, suitable for teachers to bulk create problem sets or migrate problems between different environments.

## Format Version (QJudge v1)

QJudge supports a structured YAML format with a `version` field, ensuring stability in field parsing.

```yaml
version: "qjudge.code.v1"
metadata:
  title: "A + B Problem"
  difficulty: "easy"
  time_limit: 1000
  memory_limit: 256
  visibility: "public"
  tags: ["basic", "arithmetic"]

translations:
  - language: "en"
    title: "A + B Problem"
    description: "Calculate the sum of two integers A and B."
    input_description: "Two integers A and B."
    output_description: "The sum of A and B."
  - language: "zh-TW"
    title: "A + B 問題"
    description: "計算兩個整數 A 與 B 的和。"
    input_description: "輸入兩個整數 A 與 B。"
    output_description: "輸出 A + B 的結果。"
    hint: "You can use `std::cin` for input."

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

## Field Descriptions

### Metadata (Basic Information)
- `title`: Problem name.
- `difficulty`: Difficulty level, can be `easy`, `medium`, `hard`.
- `time_limit`: Time limit in milliseconds, range 100 - 10000.
- `memory_limit`: Memory limit in MB, range 16 - 512.
- `visibility`: Visibility level, can be `public`, `private`, `hidden`.
- `tags`: List of tags (string array).

### Translations (Multi-language Descriptions)
- `language`: Language code, e.g., `zh-TW`, `en`.
- `title`: Problem title in the specified language.
- `description`: Problem description (Markdown supported).
- `input_description`: Input format description.
- `output_description`: Output format description.
- `hint`: Hint (optional).

### Test Cases
- `input_data`: Input data.
- `output_data`: Expected output data.
- `is_sample`: Whether to display as a sample.
- `score`: Score for this test case.
- `is_hidden`: Whether to hide (not shown in the test list).

### Language Configs
- `language`: Programming language, currently supports `cpp`, `python`, `java`, `javascript`.
- `template_code`: Starting template code for the language.

## Backward Compatibility
The system still supports the flat format without a `version` field, but it is recommended to use the `qjudge.code.v1` format for all new problems.

## Import Steps
1. Go to the problem edit page or contest management panel.
2. Click the "Import YAML" button.
3. Select a file or paste the content.
4. Preview and click "Confirm" if everything is correct.
