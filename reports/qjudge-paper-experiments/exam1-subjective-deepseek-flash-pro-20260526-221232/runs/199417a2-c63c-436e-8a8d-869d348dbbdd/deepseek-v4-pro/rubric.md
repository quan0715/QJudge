# Rubric: Kernel-Level Threads Advantages

## 題目
List two advantages of kernel-level threads over user-level threads.

## 滿分
2 分（每個正確優點 1 分）

## 參考答案
a. Multiprocessor utilization (can run on different CPUs)
b. One thread blocking doesn't block the entire process

## 評分準則

### 可接受的優點（每項 1 分，需列出兩項不同優點）

| # | 優點 | 關鍵詞 |
|---|------|--------|
| 1 | **Multiprocessor/Multicore utilization (Scalability)** | multi-core, multi-processor, parallel, scalability, 多核心, 平行 |
| 2 | **Robustness / Independent blocking** | one thread blocked/crash doesn't block whole process, robust, 一個卡住不影響其他 |
| 3 | **OS-managed scheduling** | scheduled/managed by OS, OS 排程管理（邊際可接受，但非最典型答案） |
| 4 | **Privileged instruction execution** | can execute privileged instructions, 特權指令（邊際可接受） |

### 不可接受的答案（0 分）

- Shared memory（ULT 也共享記憶體，非 KLT 優勢）
- Faster / more efficient（ULT context switch 通常更快）
- Less overhead（KLT overhead 較大）
- Context switch faster（錯誤）
- Resource sharing（太模糊或非 KLT 專屬優勢）
- 描述 ULT 優點卻當成 KLT 優點
- 重複同一優點用不同說法（只算一項）

### 給分規則

| 分數 | 條件 |
|------|------|
| 2 | 兩項不同且正確的優點 |
| 1 | 只有一項正確優點（另一項缺漏、錯誤或重複） |
| 0 | 無任何正確優點，或全部錯誤 |

### Reason 政策
- 滿分（2 分）：reason 留空
- 非滿分（0-1 分）：必填 reason，簡述扣分原因
