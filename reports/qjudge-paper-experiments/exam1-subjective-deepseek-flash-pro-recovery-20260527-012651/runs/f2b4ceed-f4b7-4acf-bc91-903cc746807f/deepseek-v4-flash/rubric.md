# 評分準則：Internal Fragmentation vs External Fragmentation

## 題目
Explain the difference between 'Internal Fragmentation' and 'External Fragmentation'. Which one is typically associated with the Paging memory management scheme?

## 滿分：3 分

## 評分項目（每項 1 分）

### 1. Internal Fragmentation 定義（1 分）
- 核心概念：已分配的固定大小區塊（block/frame/page）內部未被使用的記憶體空間。
- 關鍵字：已分配的區塊內部、未使用的空間、固定大小區塊。
- **給分 0.5**：概念大致正確但描述模糊或不完整（如僅說「分配太多給 process」但未提及這是已分配的區塊內部的浪費）。
- **給分 1**：清楚說明 Internal Fragmentation 是 allocated block 內部未使用的空間，或分配給 process 的空間大於需求所造成的浪費。
- **給分 0**：定義錯誤或未回答。

### 2. External Fragmentation 定義（1 分）
- 核心概念：總體 free memory 足夠，但因空間不連續（non-contiguous），無法提供一塊夠大的連續空間給 process。
- 關鍵字：不連續的 free space / holes、總量足夠但無法分配。
- **給分 0.5**：概念大致正確但描述模糊或不完整。
- **給分 1**：清楚說明 External Fragmentation 是總 free space 足夠但分散不連續，無法分配給 process。
- **給分 0**：定義錯誤或未回答。

### 3. 與 Paging 的關聯（1 分）
- **正確答案**：Internal Fragmentation（paging 使用 fixed-size page/frame，最後一頁可能用不滿，產生 internal fragmentation）。
- **給分 0**：回答 External Fragmentation 或未回答。
- **給分 1**：正確指出 Internal Fragmentation。
- **說明清楚程度不影響此項給分**——只要答案正確即得 1 分；若同時說兩者都有但明確指出 internal 是主要關聯，仍算正確。

## 評分政策
- 滿分（3 分）：三個部分皆正確且完整。
- reason 政策：滿分 → reason 留空；非滿分 → 必填簡短扣分依據。
