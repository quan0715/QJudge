# Rubric: RPC Failures (max_score=4)

## 評分原則
本題要求「List four common failures that may happen during a Remote Procedure Call (RPC)」。
滿分 4 分，每個正確的 RPC 常見失敗類型得 1 分。

## 正確答案（參考解答，每項 1 分）

| # | 關鍵概念 | 可接受的表述 |
|---|---------|-------------|
| 1 | Cannot locate server | 無法定位/找到伺服器、server down 導致無法連線、version mismatch 無法連線 |
| 2 | Request message lost | 請求訊息遺失、LostReq、request 在傳送中丟失 |
| 3 | Reply message lost | 回應訊息遺失、LostResp、response/reply 在傳送中丟失 |
| 4 | Server crash after receiving request | 伺服器收到 request 後當機、server crash after receive、server 處理中崩潰 |

## 給分細則

- 每答對一個類別得 1 分，答對 n 個得 n 分（上限 4 分）。
- 若列出超過 4 項，以符合上述 4 類的最佳匹配計分。
- 同義詞可接受（如 LostReq = request lost；reply = response）。
- 以下情況**不給分**：
  - 「Client crash after sending request」：不屬於本題參考解答的 4 類標準 RPC failure（此為 orphan 問題，非標準 4 類之一）。
  - 模糊回答如「server crash」未提及「收到 request 後」：若整份答案能合理推斷即給分；若僅寫「server crash」且無其他脈絡，仍給分（因題意簡答性質可接受）。
  - 與 RPC failure 無關的回答（如 pointer、global variable、RPC 實作細節、網路斷線等過於籠統的答案）。

## Reason 政策
- 滿分（4 分）：reason 留空。
- 非滿分：reason 簡述扣分原因（如「缺少 cannot locate server」、「client crash 非標準 4 類」）。
