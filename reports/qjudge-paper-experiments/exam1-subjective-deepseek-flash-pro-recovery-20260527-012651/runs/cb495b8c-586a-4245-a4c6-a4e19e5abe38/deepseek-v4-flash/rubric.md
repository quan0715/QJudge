# TLB Purpose — 評分準則 (Rubric)

## 題目原文
> What is the primary purpose of the "Translation Lookaside Buffer" (TLB) in a paging system?

## 滿分：2 分

## 參考答案
> To speed up logical-to-physical address translation by caching frequently used page table entries, reducing the need for multiple memory accesses per reference.

## 評分原則

### 2 分（完整正確）
答案須涵蓋以下核心概念：
- TLB 是一個**快取 (cache)**，存放**最近/常用的 page table entries** 或 page-to-frame 對應關係
- 目的是**加快 logical-to-physical address translation**，**減少存取 page table 所需的 memory access 次數**（原本一次資料存取需要兩次 memory access：先查 page table 再讀資料）

**允許的表述方式（不拘語言）**：
- "TLB caches frequently used page table entries to reduce memory access time"
- "TLB 用來快取常用的 page table 項目，避免每次都要到 memory 查 page table"
- "TLB reduces the need for two memory accesses per reference by caching page mappings"
- 類似以上清楚傳達「快取 + 減少 memory access 來加速轉譯」概念的答案

### 1 分（部分正確）
符合以下任一情況：
- 只提到「加快速度 / 減少時間」，但未具體說明「減少 memory access 次數」或「快取 page table entries」
- 只提到「它是 cache / buffer / 快取」，但未清楚連結到 address translation 或 paging
- 只提到「存放 page/frame 對應」，但未提及加速或減少 memory access 的目的
- 答案方向正確但過於空泛（如 "to improve efficiency" 無進一步說明）

### 0 分（錯誤或不相關）
- 答案與 TLB 的主要目的無關
- 概念完全錯誤（如：用來管理 memory space、計算 EAT、連接 disk、管理 thread priority 等）
- 只有 TL;DNR 等級的內容或完全不理解

## reason 政策
- 滿分 (2) → reason 留空
- 非滿分 (1 或 0) → 必填簡短 reason，說明扣分/給分依據
