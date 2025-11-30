# Problem Import Format Specification

This document defines the YAML format for importing problems into the NYCU Online Judge system.

## YAML Format

```yaml
# Problem Metadata
title: "A + B Problem"
difficulty: easy  # Options: easy, medium, hard
time_limit: 1000  # milliseconds
memory_limit: 256  # MB
is_visible: true
is_practice_visible: true  # Whether to show in practice problem list

# Translations (required)
translations:
  - language: "zh-TW"
    title: "A + B 問題"
    description: |
      給定兩個整數 A 和 B，計算 A + B 的值。
    input_description: |
      一行包含兩個整數 A 和 B，以空格分隔。
      
      **限制條件**
      - -10^9 ≤ A, B ≤ 10^9
    output_description: |
      一個整數，代表 A + B 的和。
    hint: ""

# Test Cases
test_cases:
  - input_data: "1 2"
    output_data: "3"
    is_sample: true
    score: 0
    order: 0
    is_hidden: false
    
  - input_data: "100 200"
    output_data: "300"
    is_sample: true
    score: 0
    order: 1
    is_hidden: false
    
  - input_data: "0 0"
    output_data: "0"
    is_sample: false
    score: 20
    order: 2
    is_hidden: false
    
  - input_data: "-1 1"
    output_data: "0"
    is_sample: false
    score: 30
    order: 3
    is_hidden: false
    
  - input_data: "1000000000 1000000000"
    output_data: "2000000000"
    is_sample: false
    score: 50
    order: 4
    is_hidden: false

# Language Configurations (Optional)
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
    is_enabled: true
    order: 0
    
  - language: "python"
    template_code: |
      a, b = map(int, input().split())
      print(a + b)
    is_enabled: true
    order: 1
    
  - language: "java"
    template_code: |
      import java.util.Scanner;
      
      public class Main {
          public static void main(String[] args) {
              Scanner sc = new Scanner(System.in);
              long a = sc.nextLong();
              long b = sc.nextLong();
              System.out.println(a + b);
          }
      }
    is_enabled: true
    order: 2
```

## Field Descriptions

### Required Fields

- **title** (string): The main problem title
- **difficulty** (enum): One of `easy`, `medium`, `hard`
- **time_limit** (integer): Time limit in milliseconds (100-10000)
- **memory_limit** (integer): Memory limit in MB (16-512)
- **translations** (array): At least one translation must be provided

### Translation Fields (Required for each translation)

- **language** (string): Language code (e.g., "zh-TW", "en-US")
- **title** (string): Translated problem title
- **description** (string): Problem description in Markdown
- **input_description** (string): Input format description
- **output_description** (string): Output format description  
- **hint** (string): Optional hint text (can be empty string)

### Test Case Fields

- **input_data** (string): Input data for the test case
- **output_data** (string): Expected output data
- **is_sample** (boolean): Whether this is a sample test case (visible to students)
- **score** (integer): Points awarded for passing this test case
- **order** (integer): Display order
- **is_hidden** (boolean): Whether to hide this test case from students

### Optional Fields

- **is_visible** (boolean): Whether problem is visible (default: true)
- **is_practice_visible** (boolean): Whether to show in practice list (default: false)
- **display_id** (string): Custom display ID (e.g., "P001")
- **language_configs** (array): Language-specific template code

### Language Config Fields (Optional)

- **language** (string): One of "cpp", "python", "java", "javascript"
- **template_code** (string): Template code for this language
- **is_enabled** (boolean): Whether this language is enabled
- **order** (integer): Display order

## Validation Rules

1. All required fields must be present
2. `difficulty` must be one of: `easy`, `medium`, `hard`
3. `time_limit` must be between 100 and 10000 ms
4. `memory_limit` must be between 16 and 512 MB
5. At least one translation must be provided
6. Each translation must have all required fields: language, title, description, input_description, output_description
7. Test case scores should sum to 100 for non-sample test cases (recommended)
8. Each language config must have a unique language per problem
