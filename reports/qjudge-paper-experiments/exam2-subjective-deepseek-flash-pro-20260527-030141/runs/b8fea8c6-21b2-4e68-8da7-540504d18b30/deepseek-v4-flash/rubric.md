# 評分準則：Affinity Scheduling 對 MP 系統的影響

## 題目
How does affinity scheduling impact cache misses, TLB misses, and page faults in a multiprocessor system?

## 滿分：3 分
每項正確得 1 分，共 3 項。

## 參考答案
It reduces cache and TLB misses by keeping a thread on the same CPU, utilizing existing cached data and TLB entries. It has no effect on page faults, as physical RAM is shared among all CPUs.

## 評分細項

| 面向 | 正確答案 | 給 1 分條件 | 給 0 分條件 |
|------|---------|------------|------------|
| 1. Cache misses | **降低／減少／improve** | 學生明確指出 affinity scheduling 可降低 cache misses | 說會增加、無影響、或未提及 |
| 2. TLB misses | **降低／減少／improve** | 學生明確指出 affinity scheduling 可降低 TLB misses | 說會增加、無影響、或未提及 |
| 3. Page faults | **無影響／不變** | 學生明確指出 affinity scheduling 不影響 page faults | 說會降低、會增加、或完全未提及 |

## Reason 政策
- 滿分（3/3）：reason 留空
- 非滿分：必填 reason，簡短說明扣分依據
