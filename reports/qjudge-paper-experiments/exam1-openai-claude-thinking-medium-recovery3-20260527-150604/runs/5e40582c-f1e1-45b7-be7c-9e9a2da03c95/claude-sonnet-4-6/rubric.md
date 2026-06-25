# Rubric：What is "local replacement" and "global replacement"?

## 題目資訊
- **題型**：short_answer
- **滿分**：2 分
- **題目**：What is "local replacement" and "global replacement"?

## 參考答案
- **Local replacement**：a process can only select a replacement frame from its own set of allocated frames.
- **Global replacement**：a process may select a replacement frame from the set of all memory frames.

---

## 評分標準

| 得分 | 條件 |
|------|------|
| 2 | 正確解釋 local replacement 且正確解釋 global replacement（兩者皆到位） |
| 1 | 僅正確解釋其中一個（local 或 global），另一個缺漏、錯誤或嚴重不完整 |
| 0 | 兩者均錯誤、嚴重偏離、空白或無關內容 |

## 評分細則

### Local replacement（1 分）
- 核心概念：page replacement 時，process 只能從「自己已分配的 frame」中挑選犧牲頁面（victim frame）。
- 關鍵詞/等義表述：own allocated frames、own pages、自己的 frame set。
- 可接受：意思等價的說法，例如「只能換自己的頁面」。
- 不接受：僅說「換本地頁面」而未說明限制範圍是自己分配的 frame。

### Global replacement（1 分）
- 核心概念：page replacement 時，process 可從「所有記憶體 frame（包含其他 process 的）」中挑選犧牲頁面。
- 關鍵詞/等義表述：all memory frames、any frame in memory、可換其他 process 的 frame。
- 可接受：意思等價的說法。
- 不接受：僅說「換全域頁面」而未說明範圍跨越自身分配。

## Reason 政策
- 滿分（2 分）→ reason 留空。
- 非滿分 → 必填 reason，說明哪一部分缺漏或錯誤。
