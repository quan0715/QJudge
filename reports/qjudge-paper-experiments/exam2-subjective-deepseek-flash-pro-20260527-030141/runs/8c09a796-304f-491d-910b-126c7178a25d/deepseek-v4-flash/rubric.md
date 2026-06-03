# Rubric: Three Fundamental Exceptions in Client-Server Message Exchanges

## 題目
What are the three fundamental exceptions that can occur during message exchanges in a client-server model?

## 滿分
3 分

## 參考答案
1. **LostReq**: The request message is lost.
2. **LostResp**: The response message is lost.
3. **SerCrash**: The server crashes during the execution of the request.

## 評分標準（每項 1 分，共 3 分）

| 項目 | 核心概念 | 可接受的變體 |
|------|---------|-------------|
| LostReq (1分) | 請求訊息在傳送途中遺失 | lost request, request message lost, ReqLost, 請求遺失 |
| LostResp (1分) | 回覆/回應訊息在傳送途中遺失 | lost response, lost reply, response/reply message lost, RespLost, 回應遺失 |
| SerCrash (1分) | 伺服器在執行請求過程中當機/崩潰 | server crash, server down, server failure, unsuccessful execution of request, 伺服器當機/崩潰 |

## 給分原則
- **3 分**：三個概念皆正確（命名/拼寫變體可接受，概念正確即給分）。
- **2 分**：三個中正確寫出兩個。
- **1 分**：三個中只正確寫出一個。
- **0 分**：無任何正確概念，或回答完全離題（如講到 pointer 傳遞、unbounded array、架構模式等）。
- **扣分原則**：若答了 3 個以上項目，但其中混入明顯錯誤概念（如 client crash），仍以正確概念數量計分，不另行扣分。
- **reason 政策**：滿分（3 分）reason 留空；非滿分時必填簡短說明。
