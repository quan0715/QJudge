# Rubric: Internal vs External Fragmentation & Paging

**Max Score: 3**（每子題 1 分）

## 子題 (a)：Explain Internal Fragmentation（1 分）

核心判準：考生需表達「分配給 process 的固定大小區塊中，未被使用的記憶體空間」。

給分條件（滿足任一即可）：
- 明確指出 unused/wasted memory **within** an allocated block/partition/frame
- 說明分配空間 > 實際需求，導致區塊內部浪費
- 提到發生在 fixed-size allocation（如 paging）情境下

0 分狀況：
- 概念錯誤（如說成「process 之間不連續的空間」）
- 完全未提及

## 子題 (b)：Explain External Fragmentation（1 分）

核心判準：考生需表達「總 free memory 足夠，但因不連續而無法分配」。

給分條件（滿足任一即可）：
- 明確指出 total free memory is enough but **not contiguous**
- 提及 scattered holes/gaps 導致無法滿足 contiguous allocation request
- 提到發生於頻繁 allocate/deallocate 或 dynamic partitioning 情境

0 分狀況：
- 概念錯誤（如說成「block 內部剩餘空間」）
- 完全未提及
- 僅說「不連續空間」但未連結到「總量足夠但無法分配」

## 子題 (c)：Which one is associated with Paging?（1 分）

- 正確答案：**Internal Fragmentation**
- 給分：答 Internal Fragmentation 即得 1 分，不要求解釋原因
- 若有合理補充說明（如 last page 未滿導致）仍給 1 分
- 答 External Fragmentation 或兩者皆答：0 分

## 評分注意事項
- 英文/中文作答皆可，語文不影響評分
- 概念正確即可，不要求與參考答案逐字一致
- 滿分（3 分）reason 留空；非滿分必填 reason，簡述扣分原因
