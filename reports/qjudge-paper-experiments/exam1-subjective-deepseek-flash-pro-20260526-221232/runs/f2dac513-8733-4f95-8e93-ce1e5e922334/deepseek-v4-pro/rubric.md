# Rubric: Demand Paging (max_score = 2)

## 題目
Describe the concept of "demand paging" as a virtual memory implementation. Why is it commonly used?

## 參考答案
a. Demand paging loads pages into memory only when they are needed (on page fault), not at process start.
b. It is commonly used because it reduces initial load time, saves memory by not loading unused pages, and allows larger programs than physical memory.

## 評分準則

### (a) Demand Paging 概念描述（1 分）
- **核心概念**：page 只有在被需要（被 reference / page fault）時才載入 memory，而非 process 啟動時全部載入。
- **可接受的補充要素**：valid/invalid bit 機制、page fault 觸發、從 disk/backing store swap in。
- 只提 valid/invalid bit 但未說明「需要時才載入」核心概念 → 概念描述不完整，扣 0.5 分（即 (a) 得 0.5）。
- 只提 paging 或 virtual memory 概念但未涉及 demand paging 特有機制 → (a) 得 0 分。

### (b) 為何廣泛使用（1 分）
- 至少需涵蓋以下一項合理理由：
  - 節省 memory（不載入未使用的 page）
  - 減少初始載入時間
  - 允許 logical address space > physical memory（可執行比實體記憶體大的程式）
  - 允許更多 process 同時執行 / 提高 multiprogramming 程度
- 理由過於模糊或與 demand paging 機制無直接關聯 → (b) 得 0.5 或 0 分。

### 總分
| 分數 | 條件 |
|------|------|
| 2 | (a)(b) 皆正確完整 |
| 1.5 | 一部分完整、另一部分有瑕疵 |
| 1 | 僅一部分正確，或兩部分皆有明顯缺漏 |
| 0.5 | 僅觸及皮毛，未達基本理解 |
| 0 | 完全離題、空白、或答非所問 |

## Reason 政策
- 滿分（2 分）→ reason 留空
- 非滿分 → reason 必填，簡述扣分依據
