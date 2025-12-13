# 코드 제출

QJudge 시스템에서 코드를 제출하는 방법을 설명합니다.

## 제출 프로세스

### 1. 프로그래밍 언어 선택

코드 편집기 위의 드롭다운 메뉴에서 프로그래밍 언어를 선택합니다.

### 2. 코드 작성

편집기에서 답안을 작성합니다. 주의사항:

- 프로그램은 표준 입력(`stdin`)에서 읽어야 합니다
- 프로그램은 표준 출력(`stdout`)으로 출력해야 합니다
- 출력 형식이 문제 요구사항과 정확히 일치하는지 확인하세요

### 3. 제출

"제출" 버튼을 클릭하여 코드를 채점 시스템에 전송합니다.

## 코드 템플릿

### C++

```cpp
#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;
    cout << n * 2 << endl;
    return 0;
}
```

### Python

```python
n = int(input())
print(n * 2)
```

### Java

```java
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        System.out.println(n * 2);
    }
}
```

## 제출 제한

- **제출 빈도**: 채점이 완료될 때까지 다음 제출을 기다려야 합니다
- **코드 길이**: 최대 64 KB
- **출력 크기**: 256 MB 이하

## 자주 묻는 질문

### 로컬에서는 동작하는데 제출하면 실패하는 이유는?

흔한 원인:

- 출력 형식 오류 (추가 공백, 줄바꿈)
- 엣지 케이스 미처리
- 정수 오버플로우
- 배열 범위 초과

문제의 출력 형식 요구사항을 주의 깊게 확인하세요.
