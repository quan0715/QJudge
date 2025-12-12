# Judge System

Understand how QJudge evaluates your code.

## Judging Process

```
Submit Code → Compile → Run Tests → Compare Output → Report Results
```

### 1. Compilation Phase

The system compiles your code using standard compilers:

| Language | Compiler    | Compilation Flags |
| -------- | ----------- | ----------------- |
| C        | GCC         | `-O2 -std=c11`    |
| C++      | G++         | `-O2 -std=c++17`  |
| Python   | Python 3.10 | -                 |
| Java     | OpenJDK 17  | -                 |

### 2. Execution Phase

After successful compilation, the system runs your program against multiple test cases and checks:

- Whether the output is correct
- Whether execution time is within limits
- Whether memory usage is within limits

### 3. Judging Results

| Result                | Abbr | Description                      |
| --------------------- | ---- | -------------------------------- |
| Accepted              | AC   | Program passed all tests         |
| Wrong Answer          | WA   | Output doesn't match expected    |
| Time Limit Exceeded   | TLE  | Execution time exceeded limit    |
| Memory Limit Exceeded | MLE  | Memory usage exceeded limit      |
| Runtime Error         | RE   | Program crashed during execution |
| Compilation Error     | CE   | Program failed to compile        |

## Resource Limits

### Default Limits

- **Time Limit**: Depends on problem, typically 1-2 seconds
- **Memory Limit**: Depends on problem, typically 256 MB
- **Output Limit**: 256 MB

### Language Adjustments

Different programming languages may have different time multipliers:

- C/C++: 1x
- Java: 2x
- Python: 3x

## Special Judging

### Partial Scoring

Some problems support partial scoring, calculated based on the proportion of test cases passed.

### Special Judge

Some problems may use a special judge for:

- Problems with multiple valid solutions
- Floating-point error tolerance
- Flexible output formats

## Sandbox Environment

All programs run in an isolated sandbox environment, ensuring:

- System security
- Fair judging
- Resource isolation
