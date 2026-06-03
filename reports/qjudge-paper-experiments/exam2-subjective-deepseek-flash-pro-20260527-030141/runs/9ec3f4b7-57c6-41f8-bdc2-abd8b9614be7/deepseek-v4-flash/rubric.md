# RPC 常見失敗 — 評分準則 (Max Score = 4)

## 題目
List four common failures that may happen during a Remote Procedure Call (RPC).

## 參考答案
1. Client cannot locate the server.
2. Request message is lost.
3. Reply message is lost.
4. Server crashes after receiving the request.

## 計分規則
每正確列出一個項目得 1 分，滿分 4 分。

### 1. Client cannot locate the server (1 pt)
- 客戶端找不到伺服器（server down、version mismatch、無法連線等）
- 接受：cannot locate/find/connect to the server, can't find server, 找不到伺服器等
- **不計分**：僅寫 "server crash" 未提及 locate 概念

### 2. Request message is lost (1 pt)
- 客戶端送出的請求訊息在傳輸途中遺失
- 接受：lost request, request lost, request message lost, 請求遺失等
- 不要求特定用詞，有「請求/request 遺失/lost」概念即給分

### 3. Reply/Response message is lost (1 pt)
- 伺服器回覆的回應訊息在傳輸途中遺失
- 接受：lost reply/response, reply/response lost, 回覆/回應遺失等
- 注意：若學生同時寫了 reply lost 和 response lost，視為同一項，不重複給分

### 4. Server crashes after receiving the request (1 pt)
- 伺服器在收到請求後崩潰/當機
- 接受：server crash after receiving request, server crash during processing, 伺服器收到請求後當機等
- **不計分**：僅寫 "server crash" 過於模糊不足以區分（需有收到請求後 crash 的概念）
- **不計分**：寫 "client crash"（這是不同類型的失敗）

## 特殊情況處理
- 列超過 4 項：取前 4 項中有幾個正確；或取所有正確項最多給到 4 分
- 未滿 4 項但有部分正確：按正確項數給分
- 完全離題（如講 pointer、global variable 等非 RPC failure 內容）：0 分
- "Skip" 或空白：0 分
- 概念重複（如 request lost 和 message lost 實為同一項）：只計一次
