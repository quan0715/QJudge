# Creating Problems with YAML

This guide explains how to create programming problems using YAML format.

## YAML Format Overview

YAML is a human-readable data serialization format, ideal for defining problem data. A complete problem YAML file contains the following sections:

| Section         | Required | Description                                  |
| --------------- | -------- | -------------------------------------------- |
| Basic Info      | Yes      | Title, difficulty, time/memory limits        |
| Translations    | Yes      | Problem description in at least one language |
| Test Cases      | Yes      | Input/output test cases                      |
| Language Config | No       | Template code for each language              |

---

## Basic Information Fields

```yaml
---
title: "A + B Problem"
difficulty: easy # easy | medium | hard
time_limit: 1000 # milliseconds (ms)
memory_limit: 256 # MB
is_visible: true # whether visible in problem list
is_practice_visible: true # whether visible in practice mode
```

### Field Descriptions

| Field                 | Type    | Description                      |
| --------------------- | ------- | -------------------------------- |
| `title`               | string  | Default title of the problem     |
| `difficulty`          | string  | `easy`, `medium`, or `hard`      |
| `time_limit`          | integer | Execution time limit (ms)        |
| `memory_limit`        | integer | Memory limit (MB)                |
| `is_visible`          | boolean | Whether publicly visible         |
| `is_practice_visible` | boolean | Whether visible in practice mode |

---

## Multi-language Translations

The system supports multi-language problem descriptions:

```yaml
translations:
  - language: "en"
    title: "A + B Problem"
    description: |
      Given two integers $A$ and $B$, compute the value of $A + B$.

      This is a standard practice problem to get familiar with the system.
    input_description: |
      A single line containing two integers $A$ and $B$, separated by a space.

      **Constraints**
      - $-10^9 \le A, B \le 10^9$
    output_description: |
      Output a single integer representing the sum of $A$ and $B$.
    hint: "Use long long in C++ to avoid overflow."

  - language: "zh-TW"
    title: "A + B 問題"
    description: |
      給定兩個整數 $A$ 和 $B$，計算 $A + B$ 的值。
    input_description: |
      一行包含兩個整數 $A$ 和 $B$，以空格分隔。
    output_description: |
      輸出一個整數，代表 $A + B$ 的和。
    hint: "在 C++ 中請使用 long long 以避免溢位。"
```

### Supported Language Codes

| Code    | Language            |
| ------- | ------------------- |
| `zh-TW` | Traditional Chinese |
| `en`    | English             |
| `ja`    | Japanese            |
| `ko`    | Korean              |

### Math Formulas

Problem descriptions support LaTeX math formulas:

- Inline formulas: use `$...$`, e.g., `$A + B$`
- Block formulas: use `$$...$$`

---

## Test Cases

Test cases are divided into sample and hidden tests:

```yaml
test_cases:
  # Sample tests - shown to users
  - input_data: "1 2"
    output_data: "3"
    is_sample: true

  - input_data: "100 200"
    output_data: "300"
    is_sample: true

  # Hidden tests - not shown to users
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

### Field Descriptions

| Field         | Type    | Description                         |
| ------------- | ------- | ----------------------------------- |
| `input_data`  | string  | Test input data                     |
| `output_data` | string  | Expected output                     |
| `is_sample`   | boolean | `true` for sample tests             |
| `score`       | integer | Score for this test case (optional) |

> If `score` is not specified, total points are distributed evenly.

---

## Language Configuration

Provide template code for different programming languages:

```yaml
language_configs:
  - language: "cpp"
    template_code: |
      #include <iostream>
      using namespace std;

      int main() {
          // Write your code here
          return 0;
      }

  - language: "python"
    template_code: |
      # Write your code here
      pass

  - language: "java"
    template_code: |
      import java.util.Scanner;

      public class Main {
          public static void main(String[] args) {
              // Write your code here
          }
      }
```

### Supported Languages

| Code     | Language | Compiler/Version |
| -------- | -------- | ---------------- |
| `cpp`    | C++      | G++ 11, C++17    |
| `c`      | C        | GCC 11, C11      |
| `python` | Python   | Python 3.10      |
| `java`   | Java     | OpenJDK 17       |

---

## Complete Example

Here's a complete problem YAML example:

```yaml
---
title: "A + B Problem"
difficulty: easy
time_limit: 1000
memory_limit: 256
is_visible: true
is_practice_visible: true

translations:
  - language: "en"
    title: "A + B Problem"
    description: |
      Given two integers $A$ and $B$, compute the value of $A + B$.
    input_description: |
      A single line containing two integers $A$ and $B$.
    output_description: |
      Output a single integer representing the sum.
    hint: "Watch out for integer overflow."

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

## Importing Problems

### Using Admin Interface

1. Login with admin account
2. Go to "Problem Management" page
3. Click "Import Problem" button
4. Upload YAML file
5. Confirm import result

### Using API

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@problem.yaml" \
  https://q-judge.quan.wtf/api/v1/problems/import/
```

---

## Common Issues

### YAML Format Errors

Ensure:

- Use correct indentation (2 or 4 spaces, not tabs)
- Wrap strings with special characters in quotes
- Use `|` for multi-line text

### Test Data Notes

- Input/output don't need trailing newlines
- Ensure output matches exactly (including spaces)
- Large test data can use file path references

### Math Formulas Not Displaying

- Confirm correct LaTeX syntax
- Use `$...$` for inline formulas
- Escape special characters (e.g., `\_` for underscore)
