# Rubric: SI-LB vs RI-LB 負載平衡演算法比較

**題目**：Compare Sender-Initiated (SI-LB) and Receiver-Initiated (RI-LB) Load Balancing algorithms. Which one maintains performance under heavy load?

**滿分**：3 分

## 評分項目（每項 1 分，共 3 分）

### 項目 1：正確描述 SI-LB（1 分）
- 關鍵概念：overloaded / busy node 主動 probe 其他 node 尋求幫助
- 可接受：sender-initiated、push-based、忙的節點找閒的節點、overloaded 時才探測
- 給分寬鬆：只要有抓到「忙的一方主動找別人幫忙」即可

### 項目 2：正確描述 RI-LB（1 分）
- 關鍵概念：underloaded / idle node 主動 probe 其他 node 尋找工作
- 可接受：receiver-initiated、pull-based、閒的節點找忙的節點、underloaded 時才探測
- 給分寬鬆：只要有抓到「閒的一方主動找事做」即可

### 項目 3：正確回答 RI-LB 維持 heavy load 效能，並給出合理原因（1 分）
- 必須回答：RI-LB（或 Receiver-Initiated）
- 原因需合理，例如：
  - 忙的 node 不用浪費 CPU cycle 去 probe（因為大家都在忙，探測徒勞）
  - SI-LB 在 heavy load 時會產生大量無效 probe overhead
  - RI-LB 只有閒的 node 才 probe，不增加系統負擔
- 若僅說出 RI-LB 但完全未說明原因 → 該項 0 分

## 給分速查

| 狀況 | 分數 |
|------|------|
| 三項全對，描述清晰 | 3 |
| 缺少任一項，或某項描述明顯錯誤 | 2 |
| 僅答對其中一項 | 1 |
| 全錯或未作答（含 "Skip"） | 0 |

## Reason 政策
- 滿分（3 分）：reason 留空
- 非滿分（0/1/2 分）：reason 簡述扣分原因（如「SI-LB 描述錯誤」、「未說明原因」、「未作答」）
