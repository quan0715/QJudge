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

## 시간 배수

| 언어   | 시간 배수 |
| ------ | --------- |
| C/C++  | 1x        |
| Java   | 2x        |
| Python | 3x        |

가장 익숙한 언어를 선택하고 문제 해결 로직에 집중하세요!
