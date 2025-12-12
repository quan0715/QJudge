# Common Errors

This document covers common errors encountered when using QJudge and how to fix them.

## Compilation Error (CE)

### Syntax Errors

```
error: expected ';' before '}' token
```

**Solution**: Check for missing semicolons, brackets, etc. in your code.

### Undeclared Variables

```
error: 'x' was not declared in this scope
```

**Solution**: Ensure all variables are properly declared.

### Missing Headers

```
fatal error: bits/stdc++.h: No such file or directory
```

**Solution**: Use standard headers like `<iostream>`, `<vector>`, etc.

## Runtime Error (RE)

### Array Out of Bounds

```cpp
int arr[10];
arr[10] = 5;  // Error! Index should be 0-9
```

**Solution**: Ensure array access is within valid range.

### Division by Zero

```cpp
int result = a / b;  // Error if b is 0
```

**Solution**: Check if divisor is zero before division.

### Stack Overflow

Usually caused by excessive recursion depth.

**Solutions**:

- Convert to iterative implementation
- Add base case checks
- Use tail recursion optimization

## Wrong Answer (WA)

### Output Format Errors

Common issues:

- Extra spaces or newlines
- Missing newline at end
- Case sensitivity mismatch

**Solution**: Carefully verify the output format requirements.

### Integer Overflow

```cpp
int n = 1000000;
int result = n * n;  // Overflow!
```

**Solution**: Use `long long` for large numbers.

### Edge Cases

Commonly missed edge cases:

- n = 0 or n = 1
- Empty strings
- Negative numbers

## Time Limit Exceeded (TLE)

### Algorithm Complexity Too High

| Data Range | Recommended Complexity |
| ---------- | ---------------------- |
| n ≤ 10     | O(n!)                  |
| n ≤ 20     | O(2^n)                 |
| n ≤ 500    | O(n³)                  |
| n ≤ 5000   | O(n²)                  |
| n ≤ 10⁶    | O(n log n)             |
| n ≤ 10⁸    | O(n)                   |

### I/O Efficiency

**C++ optimization tips**:

```cpp
ios::sync_with_stdio(false);
cin.tie(nullptr);
```

**Avoid**:

- Using `endl` (use `'\n'` instead)
- Frequent small output operations

## Memory Limit Exceeded (MLE)

### Arrays Too Large

```cpp
int arr[100000000];  // ~400 MB, may exceed limit
```

**Solutions**:

- Evaluate actual array size needed
- Use more memory-efficient data structures

### Memory Leaks

When using dynamic allocation, ensure proper deallocation.

## Need Help?

If you encounter issues you can't resolve:

1. Check the problem's discussion section
2. Use the clarification feature during contests
3. Discuss with classmates (outside of contests)
