# 評分準則：Publish/Subscribe 相較 Point-to-Point 三大優勢

**題目**：State three major advantages of the Publish/Subscribe middleware model over Point-to-Point communication.
**滿分**：3 分（每個優勢 1 分）
**題型**：short_answer

## 三大核心優勢（各 1 分）

| 優勢 | 給分條件（寫出類似概念即可，不要求逐字相同） |
|------|----------------------------------------------|
| **1. Scalability（可擴展性）** | 提到容易加入/移除 publisher/subscriber，且不影響現有成員；或強調可支援大量節點。 |
| **2. Decoupling（解耦）** | 提到 publisher 和 subscriber 不需要知道彼此的存在、身分、位址等資訊；或強調鬆散耦合。 |
| **3. Asynchronous Communication（非同步通訊）** | 提到雙方不必同時在線；或 publisher 可在 subscriber 離線時發送訊息，subscriber 上線後再接收；或 middleware 可暫存訊息。 |

## 評分原則

- **每個正確且合理說明的優勢得 1 分**，滿分 3 分。
- 若僅列出關鍵字（如 "scalability"）但無任何說明，仍視為正確得該分 — 因為題目要求「State three major advantages」，關鍵字足以表達概念。
- 若寫出超過 3 項優點但合理，仍以 3 分為上限。
- 部分對：答對 2 項得 2 分，答對 1 項得 1 分。
- **完全離題/無法辨識為 Pub/Sub 優勢**（如回答 pointer/array、Skip、不相干內容）得 0 分。
- 若回答核心概念正確但英文拼寫錯誤（如 scalability 誤拼 scalibility），只要識別得出概念即給分。
- 若只有 2 項則最高 2 分；若 3 項中有 1 項概念重複/錯誤則扣該項分數。
