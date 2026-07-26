# Exam Integrity Worker runbook

## Lifecycle

管理者在監考面板手動建立 Run；建議在考試開始前 60 分鐘啟動。`Start` 建立 Worker；
`Stop` 先停止接收、封存 journal 並保留資料；`Destroy` 只銷毀 Worker compute；`Purge`
在 Destroy + Archived 後才永久刪除 Run 資料與 evidence。Purge 必須輸入完整考試名稱。

## Operational checks

- Manager panel 顯示 compute、health、data 三個獨立狀態；不可只看其中一個。
- Worker heartbeat 過期或 `archive_lag`、`archive_upload_failed` 警告時，不要 Destroy；先
  保留 journal、檢查 Controller 與 object storage，再重試 Stop/archive。
- raw batches 在 Worker journal/object storage，不建立 Backend/Worker raw-event PostgreSQL
  表；PostgreSQL 只保存 Run、正規化事件與 evidence manifest。
- 影音證據可能是 `partial`／`unavailable`：這代表當下 OPFS 缺片或來源中斷，不得用全程
  錄影取代。

## Recovery and security

Backend gateway 無 ACK 時，瀏覽器保留同一 `batch_id` 重試；Worker 重啟會復原 journal、
command outbox 與 cursor。檢查 per-run token、Backend signing key 和 Controller secret 的
rotation 事件；不得把 Run token 或 Controller socket 暴露給 browser。

容量告警以 Worker journal 容量與 R2 archive/evidence object 為準。先 Stop/archive 再
Destroy；Destroy 不等於刪資料。

## Deferred validation checklist

下列驗收需在已核准的 Docker/瀏覽器驗證環境另行執行：200 名使用者約 40 batch/s、ACK
p95 < 500 ms、Worker restart 的零 ACK loss、65 秒離線後 timestamp-preserving reconnect、
lost ACK 同 batch retry、compressed journal segments、incident-only screen/webcam objects、
Worker RUNNING 時的排程 auto-submit，以及 Stop/Destroy/Purge 資料生命週期。

手動 UI 驗收：在 Storybook 依序查看 no Run、stopped/preparation、running/healthy、warning、
stopping/archive lag、stopped/archived、destroyed/data retained、action loading/error，並於實際
監考面板確認單一垂直捲動、Modal 確認流程、窄螢幕與 dark theme。
