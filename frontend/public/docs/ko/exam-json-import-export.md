본 문서는 QJudge 「지필 시험 (Paper-like Test)」 문항의 JSON 가져오기 및 내보내기 형식 규격을 설명합니다. 이 형식을 통해 교사는 시험 간 문항 재사용이나 대량의 문항 생성을 신속하게 수행할 수 있습니다.

---

## 1. 핵심 JSON 구조

가져오기 및 내보내기용 JSON 파일은 **문항 객체의 배열 (Array of Objects)**이어야 합니다. 각 문항 객체는 다음 필드를 포함합니다.

| 필드명 | 타입 | 필수 | 설명 |
| :--- | :--- | :--- | :--- |
| `question_type` | String | 예 | 문항 유형 코드, 자세한 내용은 [문항 유형 코드표](#2-문항-유형-코드표) 참조 |
| `prompt` | String | 예 | 문항 내용, Markdown 및 LaTeX 지원 |
| `score` | Number | 예 | 해당 문항 배점 (양의 정수) |
| `options` | Array | 아니요 | 객관식 선택지, 문자열 배열. 단답형/서술형은 `[]` |
| `correct_answer` | Mixed | 아니요 | 정답, 문항 유형에 따라 형식이 다름 |
| `order` | Number | 아니요 | 표시 순서 (오름차순) |

---

## 2. 문항 유형 코드표 (Question Types)

| 코드 (`question_type`) | 설명 | `correct_answer` 형식 |
| :--- | :--- | :--- |
| `single_choice` | 단일 선택형 | Number (0부터 시작하는 선택지 인덱스) |
| `multiple_choice` | 다중 선택형 | Array of Numbers (인덱스 배열, 예: `[0, 2]`) |
| `true_false` | 찬반형 (O/X) | Boolean (`true` 또는 `false`) |
| `short_answer` | 단답형 | String (참고 답안, 비워둘 수 있음) |
| `essay` | 서술형 | String (참고 답안, 비워둘 수 있음) |

---

## 3. 각 문항 유형별 예시

### 단일 선택형 (Single Choice)
```json
{
  "question_type": "single_choice",
  "prompt": "다음 중 Python의 예약어가 아닌 것은?",
  "score": 5,
  "options": ["var", "let", "def", "function"],
  "correct_answer": 2,
  "order": 1
}
```

### 다중 선택형 (Multiple Choice)
```json
{
  "question_type": "multiple_choice",
  "prompt": "다음 중 컴파일 언어에 해당하는 것은?",
  "score": 10,
  "options": ["C++", "Python", "Rust", "JavaScript"],
  "correct_answer": [0, 2],
  "order": 2
}
```

### 찬반형 (True/False)
```json
{
  "question_type": "true_false",
  "prompt": "HTML은 프로그래밍 언어이다.",
  "score": 5,
  "options": ["True", "False"],
  "correct_answer": false,
  "order": 3
}
```

### 서술형 (Essay)
```json
{
  "question_type": "essay",
  "prompt": "RESTful API의 핵심 원칙에 대해 간략히 서술하시오.",
  "score": 20,
  "options": [],
  "correct_answer": "무상태성 (Stateless), 일관된 인터페이스 (Uniform Interface) 등을 포함하며...",
  "order": 4
}
```

---

## 4. 가져오기 규칙 및 주의사항

1. **덮어쓰기 메커니즘**：JSON을 가져올 때, 시스템은 보통 파일 내의 문항을 기존 문항 목록 끝에 「추가」합니다.
2. **형식 검증**：
   - 객관식의 `correct_answer` 인덱스는 반드시 `options` 배열 내에 존재해야 합니다.
   - 총 배점은 자동으로 합산되므로, 시험 설정과 일치하는지 확인하십시오.
3. **미디어 리소스**：현재 JSON은 텍스트 콘텐츠(Markdown 구문의 이미지 링크 포함)만 지원합니다. 로컬 이미지가 필요한 경우, 먼저 이미지 호스팅 서비스 등에 업로드한 후 `prompt`에서 해당 링크를 인용하십시오.
4. **수정 제한**：시험이 이미 시작되어 학생 답안이 존재하는 경우, 가져오기 기능이 제한될 수 있습니다. 시험 시작 전에 모든 문항 가져오기를 완료하는 것을 권장합니다.

---

## 5. 자주 발생하는 오류 처리

- **`options must be an array`**：`options` 필드에 대괄호 `[]`를 사용했는지 확인하십시오.
- **`score must be greater than 0`**：배점은 0이나 음수일 수 없습니다.
- **`Invalid JSON format`**：파일이 표준 JSON 규격을 따르는지 확인하십시오 (예: 마지막 객체 뒤에 쉼표가 있는지 등).
