# 지원 언어

QJudge는 여러 주요 프로그래밍 언어를 지원합니다.

## 언어 목록

| 언어     | 버전       | 컴파일/실행 명령                      |
| -------- | ---------- | ------------------------------------- |
| C        | GCC 11     | `gcc -O2 -std=c11 -o main main.c -lm` |
| C++      | G++ 11     | `g++ -O2 -std=c++17 -o main main.cpp` |
| Python 3 | 3.10       | `python3 main.py`                     |
| Java     | OpenJDK 17 | `javac Main.java && java Main`        |

## 언어별 참고사항

### C/C++

**추천 헤더 파일**:

```cpp
#include <iostream>
#include <vector>
#include <algorithm>
#include <string>
#include <cmath>
#include <map>
#include <set>
#include <queue>
```

**성능 최적화**:

```cpp
// main 함수 시작 부분에 추가
ios::sync_with_stdio(false);
cin.tie(nullptr);
```

### Python

**입출력**:

```python
# 단일 줄 입력
n = int(input())

# 여러 숫자
a, b = map(int, input().split())

# 리스트 입력
arr = list(map(int, input().split()))
```

**참고사항**:

- Python의 실행 시간 제한은 일반적으로 완화됩니다
- 효율을 높이기 위해 내장 함수와 리스트 컴프리헨션을 사용하는 것이 좋습니다

### Java

**클래스 이름**:

메인 클래스는 `Main`이라는 이름이어야 합니다:

```java
public class Main {
    public static void main(String[] args) {
        // 코드를 여기에
    }
}
```

**고속 I/O**:

```java
import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        PrintWriter out = new PrintWriter(new BufferedOutputStream(System.out));

        // 읽기 및 처리

        out.flush();
    }
}
```

## 시간 배수

| 언어   | 시간 배수 |
| ------ | --------- |
| C/C++  | 1x        |
| Java   | 2x        |
| Python | 3x        |

예: 문제의 시간 제한이 1초인 경우, Python 프로그램은 실제로 3초의 실행 시간이 있습니다.

## 선택 권장

| 시나리오       | 권장 언어 |
| -------------- | --------- |
| 실행 효율 중시 | C++       |
| 빠른 개발      | Python    |
| 객체지향에 익숙 | Java      |
| 자료구조 학습  | C++       |

## 언어 비교

### 장단점 비교

**C++**

- 실행 속도가 빠름
- STL이 강력함
- 문법이 다소 복잡

**Python**

- 문법이 간결
- 개발 속도가 빠름
- 실행이 느림

**Java**

- 크로스 플랫폼
- 객체지향이 완전함
- 코드가 길어지기 쉬움

가장 익숙한 언어를 선택하고 문제 해결 로직에 집중하세요!
