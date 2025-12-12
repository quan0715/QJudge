# Supported Languages

QJudge supports multiple mainstream programming languages. Here's the complete list and related information.

## Language List

| Language | Version    | Compile/Run Command                   |
| -------- | ---------- | ------------------------------------- |
| C        | GCC 11     | `gcc -O2 -std=c11 -o main main.c -lm` |
| C++      | G++ 11     | `g++ -O2 -std=c++17 -o main main.cpp` |
| Python 3 | 3.10       | `python3 main.py`                     |
| Java     | OpenJDK 17 | `javac Main.java && java Main`        |

## Language-Specific Notes

### C/C++

**Recommended Headers**:

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

**Performance Optimization**:

```cpp
// Add at the beginning of main function
ios::sync_with_stdio(false);
cin.tie(nullptr);
```

### Python

**Input/Output**:

```python
# Single line input
n = int(input())

# Multiple numbers
a, b = map(int, input().split())

# List input
arr = list(map(int, input().split()))
```

**Notes**:

- Python time limits are usually extended
- Prefer built-in functions and list comprehensions for efficiency

### Java

**Class Naming**:

The main class must be named `Main`:

```java
public class Main {
    public static void main(String[] args) {
        // Your code here
    }
}
```

**Fast I/O**:

```java
import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        PrintWriter out = new PrintWriter(new BufferedOutputStream(System.out));

        // Read and process

        out.flush();
    }
}
```

## Time Multipliers

Due to execution efficiency differences between languages, the system automatically adjusts time limits:

| Language | Time Multiplier |
| -------- | --------------- |
| C/C++    | 1x              |
| Java     | 2x              |
| Python   | 3x              |

For example: If the problem time limit is 1 second, Python programs actually have 3 seconds of execution time.

## Recommendations

| Scenario                    | Recommended Language |
| --------------------------- | -------------------- |
| Maximum efficiency          | C++                  |
| Rapid development           | Python               |
| Object-oriented familiarity | Java                 |
| Learning data structures    | C++                  |

## Language Comparison

### Pros and Cons

**C++**

- Fast execution
- Powerful STL
- Complex syntax

**Python**

- Clean syntax
- Fast development
- Slower execution

**Java**

- Cross-platform
- Complete OOP support
- Verbose code

Choose the language you're most familiar with and focus on problem-solving logic!
