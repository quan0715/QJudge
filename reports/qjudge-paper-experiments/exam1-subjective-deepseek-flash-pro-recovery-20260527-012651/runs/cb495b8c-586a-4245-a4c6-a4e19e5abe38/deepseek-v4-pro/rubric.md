# Rubric: TLB Primary Purpose (max_score=2)

## Question
What is the primary purpose of the 'Translation Lookaside Buffer' (TLB) in a paging system?

## Reference Answer
To speed up logical-to-physical address translation by caching frequently used page table entries, reducing the need for multiple memory accesses per reference.

## Key Elements (both needed for full credit)
1. **加速位址轉換** — TLB speeds up logical/virtual-to-physical address translation.
2. **快取 page table entries** — TLB is a cache/buffer that stores frequently/recently used page table entries (page-to-frame mappings), thereby reducing the number of memory accesses (typically from 2 to 1 per reference).

## Scoring

### 2 分（滿分）
- 清楚指出 TLB 是快取（cache/buffer），用來加速位址轉換，且說明它藉由減少 memory access 次數達成。
- 英文關鍵字：cache, speed up translation, reduce memory accesses.
- 中文關鍵字：快取/緩存，加速轉換/查表，減少記憶體存取次數。

### 1 分
- 只抓到部分核心：例如只說「減少 memory access 次數」但未提及 caching/page table；或只說「加快 paging 速度」但未說明機制。
- 方向大致正確但模糊、不完整或略嫌片面。
- 提到 TLB 存 page/frame mapping 或加速查找但未明確連結到減少 memory access。

### 0 分
- 完全錯誤、答非所問（如：TLB 是計算 EAT、管理 memory、分配 thread priority、連接 memory 和 disk、減少 memory space 等）。
- 幾乎沒有回答（如只寫 "TLB"）。
- 對 TLB 的 purpose 理解根本性錯誤。

## 評分注意
- 滿分若答案完整且正確，reason 可留空。
- 非滿分必須填 reason，簡述缺漏或錯誤處。
