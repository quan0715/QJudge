# Exam Integrity Worker runbook

這份 runbook 給處理 Integrity Run 的維運人員使用。學生、教師與監考者的操作方式應放在公開文件，不放在這裡。

## 生命週期

管理者在監考面板建立 Run，再依序執行 `Start`、`Stop`、`Destroy` 與 `Purge`：

- `Start` 建立並啟動 Worker。
- `Stop` 停止接收資料，完成 archive 後進入 `stopped`／`archived`。
- `Destroy` 只移除 Worker compute，保留已封存資料。
- `Purge` 只有在 `destroyed`／`archived` 狀態可執行，會永久刪除 Run 與 evidence data。

`Destroy` 不等於刪除資料。執行 `Purge` 前要再次確認考試、保留期限與備份需求。

## 日常檢查

監考面板把三種狀態分開顯示：

- compute：Worker 是啟動、執行、停止中、已停止或已銷毀。
- health：Worker 是否健康，以及 `last_error`、`warnings` 與最後 heartbeat。
- data：資料仍開放、已封存或已清除。

不要只看其中一個狀態。Worker heartbeat 過期或出現 archive 警告時，先保留現況並檢查 Controller、Worker log 與 object storage；不要直接 Destroy。

## 證據狀態

管理端依來源顯示 screen share 與 Webcam 證據：

- `pending`：仍等待片段、上傳或驗證。
- `available`：至少有一個已驗證、可播放的片段。
- `unavailable`：該來源沒有可用片段、上傳失敗，或資料已清除。

系統不使用 `partial` 聚合狀態。有一個來源可用、另一個不可用時，應查看每個來源的狀態與 chunk 數，不要把缺少片段解讀成完整錄影。發生 `unavailable` 時，先查看 incident、evidence source、unavailable reason 與相關 correlation ID。

## 復原順序

Backend gateway 沒有 ACK 時，瀏覽器會保留同一個 `batch_id` 重送。Worker unhealthy 時，只能在 Run 仍為 `running` 的條件下使用支援的 Restart 動作；不要手動修改資料庫狀態或清除 journal。

停止流程卡住時依序確認：

1. compute、health、data 與 `last_error`。
2. Controller 和 Worker 的相同 correlation ID。
3. Worker journal 是否仍可讀。
4. archive manifest 與 R2 object 是否存在。
5. 問題修復後，透過面板重試 Stop／archive。

完成 `stopped`／`archived` 後才能 Destroy。Purge 失敗時資料狀態會保留為 `archived`，應記錄 `integrity_purge_indeterminate` 並透過相同動作安全重試，不要自行刪除部分 object 或 volume。

## Secret 與資料安全

- Run token、Backend signing key 與 Controller secret 不得提供給 browser 或寫進 issue。
- Log 與問題回報要移除 token、presigned URL、學生識別資料與影音內容。
- 容量檢查同時包含 Worker journal、archive object 與 evidence object。
- 清除 evidence 前要確認 Run ID、contest 與保留政策；不以 bucket-wide delete 取代 Purge。

## 尚待實測的驗收

下列項目只有在核准的 Docker／瀏覽器環境完成後才能記錄為已驗證：

- 200 名使用者的 checkpoint throughput 與 ACK p95。
- Worker restart 期間沒有遺失 ACK。
- 離線後依原 timestamp 續傳，以及 lost ACK 使用相同 batch 重試。
- incident-only screen／Webcam object。
- Stop、Destroy 與 Purge 的完整資料生命週期。

驗收紀錄要包含 QJudge commit、Worker image digest、測試時間、主機環境與實際結果，不能只寫「通過」。
