# Rubric: Publish/Subscribe middleware model advantages

## 題目
State three major advantages of the Publish/Subscribe middleware model over Point-to-Point communication.

## 滿分：3 分（每項正確且不重複的優勢 1 分）

## 參考答案（三項核心優勢）
1. **Scalability** — 可擴展性：新增 publisher/subscriber 不影響既有節點，容易擴充。
2. **Decoupling** — 解耦：publisher 與 subscriber 不需知道彼此的存在/身分/位置（空間解耦）。
3. **Asynchronous communication** — 非同步通訊：publisher 與 subscriber 不需同時在線；離線參與者仍可後續收到訊息（時間解耦）。

## 評分規則

| 分數 | 條件 |
|------|------|
| 3 | 正確點出三項不重複的 Pub/Sub 優勢，且概念清晰正確。可接受的優勢包括不限於：scalability、decoupling、asynchronous communication、many-to-many communication。若學生列出四項以上但有重複概念，仍以不重複的有效項數計分。 |
| 2 | 正確點出兩項不重複的 Pub/Sub 優勢。 |
| 1 | 正確點出一項 Pub/Sub 優勢。 |
| 0 | 完全未答、答非所問（如討論 pointer/array 等不相關內容）、或所有列出的優勢均不正確。 |

## 注意事項
- 同一概念用不同措辭表達（如「不需要知道彼此」與「decoupling」）視為同一項優勢，不重複計分。
- 學生若列出超過三項，取前三項不重複的有效優勢計分。
- 僅列關鍵字而無任何說明（如只寫「scalability, decoupling, asynchronous」）仍可接受，因為題目只要求 "State" 而未要求詳細解釋。
- 「many-to-many」可接受為一項獨立優勢（與 scalability/decoupling 不重複時）。
- 明顯錯誤或答非所問的內容不給分。
- 滿分者 reason 留空；非滿分者 reason 簡述缺漏或錯誤。
