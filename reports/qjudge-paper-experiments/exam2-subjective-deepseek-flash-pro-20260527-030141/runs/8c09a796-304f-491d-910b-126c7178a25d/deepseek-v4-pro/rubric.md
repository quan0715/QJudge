# Rubric: Three Fundamental Exceptions in Client-Server Message Exchange

**題目**：What are the three fundamental exceptions that can occur during message exchanges in a client-server model?

**滿分**：3 分（每項 1 分）

## 參考答案

| # | Exception | 說明 |
|---|-----------|------|
| 1 | LostReq | The request message is lost（請求訊息遺失） |
| 2 | LostResp | The response message is lost（回應訊息遺失） |
| 3 | SerCrash | The server crashes during the execution of the request（伺服器在執行請求期間崩潰） |

## 評分標準

- **3/3**：清楚表達全部三項例外，術語或等價描述均可接受。
  - 等價詞：LostReq = request lost / lost of request / 請求遺失
  - 等價詞：LostResp = response lost / reply lost / 回應遺失
  - 等價詞：SerCrash = server crash / server crashes / unsuccessful execution / 伺服器當機（須發生於收到 request 後或執行期間）
- **2/3**：正確表達其中兩項。
- **1/3**：正確表達其中一項。
- **0/3**：完全離題、空白、或未正確表達任一項。

## 細部判斷原則

1. SerCrash 重點是 server 在**收到 request 後**才 crash（執行期間）；若寫成「server 一開始就 down / not found / unreachable」則不給分。
2. 「client crash」不屬於三項 fundamental exceptions，若以此替代其中一項則該項不給分。
3. 拼寫錯誤（如 SerCrush, SerCrach, LostRep）不影響理解者，仍給分。
4. 答非所問（如回答 RPC parameter passing 問題、transparency/scalability、communication patterns）給 0 分。
5. 只列出兩項概念但將同一概念拆成兩種說法（如 "lost response" + "lost reply"），只算一項。
