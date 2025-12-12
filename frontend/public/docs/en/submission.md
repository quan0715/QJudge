# Code Submission

This document explains how to submit code in the QJudge system.

## Submission Process

### 1. Select Programming Language

Select your programming language from the dropdown menu above the code editor. The system supports multiple languages, see [Supported Languages](/docs/supported-languages) for details.

### 2. Write Your Code

Write your solution in the editor. Note that:

- Your program must read from standard input (`stdin`)
- Your program must output to standard output (`stdout`)
- Ensure your output format exactly matches the problem requirements

### 3. Submit

Click the "Submit" button to send your code to the judging system.

## Code Templates

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

## Submission Limits

- **Submission Rate**: You must wait for judging to complete before submitting again
- **Code Length**: Maximum 64 KB
- **Output Size**: Output file must not exceed 256 MB

## Common Questions

### Why does my program work locally but fail after submission?

Common reasons include:

- Incorrect output format (extra spaces, newlines)
- Unhandled edge cases
- Integer overflow
- Array out of bounds

Please carefully check the output format requirements in the problem statement.
