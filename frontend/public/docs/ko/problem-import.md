# YAML로 문제 만들기

이 가이드는 YAML 형식을 사용하여 프로그래밍 문제를 만드는 방법을 설명합니다.

## YAML 형식 개요

YAML은 사람이 읽기 쉬운 데이터 직렬화 형식으로, 문제 데이터를 정의하는 데 이상적입니다. 완전한 문제 YAML 파일에는 다음 섹션이 포함됩니다:

| 섹션          | 필수   | 설명                             |
| ------------- | ------ | -------------------------------- |
| 기본 정보     | 예     | 제목, 난이도, 시간/메모리 제한   |
| 번역          | 예     | 최소 1개 언어의 문제 설명        |
| 테스트 케이스 | 예     | 입출력 테스트 케이스             |
| 언어 설정     | 아니오 | 각 프로그래밍 언어의 템플릿 코드 |

---

## 기본 정보 필드

```yaml
---
title: "A + B Problem"
difficulty: easy # easy | medium | hard
time_limit: 1000 # 밀리초 (ms)
memory_limit: 256 # MB
is_visible: true # 문제 목록에 표시 여부
is_practice_visible: true # 연습 모드에서 표시 여부
```

### 필드 설명

| 필드                  | 타입   | 설명                          |
| --------------------- | ------ | ----------------------------- |
| `title`               | 문자열 | 문제의 기본 제목              |
| `difficulty`          | 문자열 | `easy`, `medium`, 또는 `hard` |
| `time_limit`          | 정수   | 실행 시간 제한 (밀리초)       |
| `memory_limit`        | 정수   | 메모리 제한 (MB)              |
| `is_visible`          | 불리언 | 공개 표시 여부                |
| `is_practice_visible` | 불리언 | 연습 모드에서 표시 여부       |

---

## 다국어 번역

시스템은 다국어 문제 설명을 지원합니다:

```yaml
translations:
  - language: "ko"
    title: "A + B 문제"
    description: |
      두 정수 $A$와 $B$가 주어집니다. $A + B$의 값을 계산하세요.

      이것은 온라인 저지 시스템에 익숙해지기 위한 표준 연습 문제입니다.
    input_description: |
      공백으로 구분된 두 정수 $A$와 $B$가 포함된 한 줄.

      **제약 조건**
      - $-10^9 \le A, B \le 10^9$
    output_description: |
      $A + B$의 합을 나타내는 정수를 출력하세요.
    hint: "C++에서 오버플로우를 피하려면 long long을 사용하세요."

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

### 지원되는 언어 코드

| 코드    | 언어        |
| ------- | ----------- |
| `zh-TW` | 번체 중국어 |
| `en`    | 영어        |
| `ja`    | 일본어      |
| `ko`    | 한국어      |

### 수학 공식

문제 설명에서 LaTeX 수학 공식을 지원합니다:

- 인라인 공식: `$...$` 사용, 예: `$A + B$`
- 블록 공식: `$$...$$` 사용

---

## 테스트 케이스

테스트 케이스는 샘플 테스트와 숨김 테스트로 나뉩니다:

```yaml
test_cases:
  # 샘플 테스트 - 사용자에게 표시됨
  - input_data: "1 2"
    output_data: "3"
    is_sample: true

  - input_data: "100 200"
    output_data: "300"
    is_sample: true

  # 숨김 테스트 - 사용자에게 표시되지 않음
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

### 필드 설명

| 필드          | 타입   | 설명                               |
| ------------- | ------ | ---------------------------------- |
| `input_data`  | 문자열 | 테스트 입력 데이터                 |
| `output_data` | 문자열 | 예상 출력                          |
| `is_sample`   | 불리언 | 샘플 테스트인 경우 `true`          |
| `score`       | 정수   | 이 테스트 케이스의 점수 (선택사항) |

> `score`를 지정하지 않으면 총점이 균등하게 분배됩니다.

---

## 언어 설정

각 프로그래밍 언어에 대한 템플릿 코드를 제공할 수 있습니다:

```yaml
language_configs:
  - language: "cpp"
    template_code: |
      #include <iostream>
      using namespace std;

      int main() {
          // 여기에 코드를 작성하세요
          return 0;
      }

  - language: "python"
    template_code: |
      # 여기에 코드를 작성하세요
      pass

  - language: "java"
    template_code: |
      import java.util.Scanner;

      public class Main {
          public static void main(String[] args) {
              // 여기에 코드를 작성하세요
          }
      }
```

### 지원되는 언어

| 코드     | 언어   | 컴파일러/버전 |
| -------- | ------ | ------------- |
| `cpp`    | C++    | G++ 11, C++17 |
| `c`      | C      | GCC 11, C11   |
| `python` | Python | Python 3.10   |
| `java`   | Java   | OpenJDK 17    |

---

## 완전한 예시

다음은 완전한 문제 YAML 예시입니다:

```yaml
---
title: "A + B Problem"
difficulty: easy
time_limit: 1000
memory_limit: 256
is_visible: true
is_practice_visible: true

translations:
  - language: "ko"
    title: "A + B 문제"
    description: |
      두 정수 $A$와 $B$가 주어집니다. $A + B$의 값을 계산하세요.
    input_description: |
      공백으로 구분된 두 정수 $A$와 $B$가 포함된 한 줄.
    output_description: |
      $A + B$의 합을 나타내는 정수를 출력하세요.
    hint: "정수 오버플로우에 주의하세요."

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

## 문제 가져오기

### 관리자 인터페이스 사용

1. 관리자 계정으로 로그인
2. "문제 관리" 페이지로 이동
3. "문제 가져오기" 버튼 클릭
4. YAML 파일 업로드
5. 가져오기 결과 확인

### API 사용

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@problem.yaml" \
  https://q-judge.quan.wtf/api/v1/problems/import/
```

---

## 자주 발생하는 문제

### YAML 형식 오류

다음을 확인하세요:

- 올바른 들여쓰기 사용 (2 또는 4 스페이스, 탭 사용 불가)
- 특수 문자가 포함된 문자열은 따옴표로 감싸기
- 여러 줄 텍스트에는 `|` 기호 사용

### 테스트 데이터 주의사항

- 입출력 끝에 추가 줄바꿈 불필요
- 출력이 예상값과 정확히 일치하는지 확인 (공백 포함)
- 큰 테스트 데이터는 파일 경로 참조 사용 가능

### 수학 공식이 표시되지 않음

- 올바른 LaTeX 구문 확인
- 인라인 공식에는 `$...$` 사용
- 특수 문자 이스케이프 (예: 밑줄에는 `\_`)
