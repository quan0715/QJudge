# 評分準則：Publish/Subscribe vs Point-to-Point 三大優勢

## 題目
State three major advantages of the Publish/Subscribe middleware model over Point-to-Point communication.

## 滿分：3 分（每點 1 分）

## 參考答案
1. **Scalability** — 可擴展性，新增 publisher/subscriber 不會影響既有成員。
2. **Decoupling** — 解耦合，publisher 與 subscriber 不需要知道彼此的存在/細節。
3. **Asynchronous communication** — 非同步通訊，雙方不必同時在線即可傳遞訊息。

## 給分規則

| 得分 | 條件 |
|------|------|
| 1 分/點 | 正確說出該優勢並有合理說明（中英文皆可，關鍵概念正確即給分） |
| 0.5 分/點 | 提及相關概念但說明模糊或不完整 |
| 0 分/點 | 未提及或概念錯誤 |

### 常見可接受的表述（不限定關鍵詞）

- **Scalability**: scalability, 可擴展性, 擴充性, easy to add/remove nodes, 增加 subscriber 不影響既有系統
- **Decoupling**: decoupling, 解耦合, 鬆耦合, loosely coupled, 不需要知道彼此, transparency, 匿名性
- **Asynchronous**: asynchronous, 非同步, 不必同時在線, offline handling, 訊息可暫存後送

### 扣分原則

- 只列關鍵詞無任何說明 → 仍算答對該點，給 1 分（因屬於 short answer）
- 同一概念用不同說法重複 → 只計一次，不重複給分
- 寫出 3 點以上 → 取最佳 3 點計分
- 完全離題/答非所問 → 0 分
- 空白/Skip/明顯未作答 → 0 分

### Reason 政策
- 滿分 3 分且三點皆正確 → reason 留空
- 非滿分 → 簡短說明扣分原因
