# 防作弊架構

本文件只描述目前實作。舊的直接事件 POST、前端 incident 聚合、截圖 API、Celery 心跳與自動交卷流程已移除。

## 模組責任

- Frontend：收集瀏覽器操作與每五秒健康快照，維護本機序列 outbox，暫存螢幕分享與 Webcam 的短片段。
- Backend：驗證考試與 run scope、代理 checkpoint、簽發 R2 上傳資訊、保存事件與證據 manifest，提供管理 UI 查詢。
- Integrity Worker：依 run 的 frozen registry 將原始紀錄投影成 incident、判斷連線逾時並發出採證命令；不直接連 PostgreSQL 或 R2。
- Redis：只保存最近 checkpoint 與短生命週期協調狀態，不作事件永久儲存。
- PostgreSQL：保存 run、正規化事件、incident 關聯與證據 manifest；不保存每五秒的原始 batch。
- R2：保存被 incident 採用的 WebM 證據片段，不保存整場錄影。

## 單一資料通道

學生端只使用：

`POST /api/v1/contests/{contest_id}/exam/integrity/checkpoints/`

每次 checkpoint 最多包含 200 筆已排序紀錄，以及 evidence manifest、完成或無法提供的結果。Backend 只有在 Worker ACK 後才更新 Redis presence；離線期間紀錄留在 IndexedDB，恢復後沿同一序號續送。每筆紀錄包含 client 發生時間、寫入時間、單調時鐘與 UUID。

`health_snapshot` 是五秒一次的健康資料，不是監考事件，也不進管理端事件清單。使用者操作與 detector edge 使用 `kind=event`，由 run 建立時凍結的 registry 解讀。

## 事件與 incident

事件定義唯一來源是 `backend/apps/contests/integrity/registry.py`。新增 detector 的流程是：

1. 在 registry 新增 definition 與 signal。
2. 前端 detector 只發出 registry 宣告的 signal。
3. Worker 通用 timeline 依 definition 的 grace、phase、action 與 evidence policy 建立 incident。
4. Backend 依 frozen registry 投影 priority、category、penalized 與線性 event feed。
5. 前端只呈現 Backend 回傳的 feed，不自行合併、去重或判斷優先度。

目前不把裝置登入處理當 detector event；`concurrent_login_detected` 與 `other_devices_logged_out` 是 lifecycle activity。禁止的 focus 行為統一為 `forbidden_action`。強制全螢幕由 `fullscreen_integrity` 負責，不另記 `tab_hidden` 或 `window_blur`。

## 證據生命週期

Frontend 依 contest/run 的 frozen device policy 決定是否啟用 `screen_share`、`webcam`。MediaRecorder 只保留本機短循環片段；incident escalated 時 Worker 回傳 retain command，預設採用事件前後各五秒。

後續 checkpoint 一次完成：

1. 提交 manifest。
2. Backend 回傳 R2 presigned upload。
3. Frontend 直傳 WebM 到 R2。
4. Frontend 在下一個 checkpoint 回報完成。
5. Backend 驗證 object 並把證據標為 available；有多少來源就顯示多少，不使用 partial 狀態。

管理端透過 `GET /exam/events/` 取得原始可見事件與 Backend 已聚合的 `event_feed`，再以 `GET /exam/integrity/evidence/review/?event_id=...` 取得可播放 URL。舊 evidence 不做 fallback。

## Run 生命週期

管理員手動建立並啟動 run，考後停止與封存，再決定銷毀運算資源或清除保留資料。管理 UI 只顯示當前狀態可執行的動作。Worker 所有寫入與生命週期命令皆走 scoped Backend Internal API。

## 明確不支援

- `POST /exam/events/`
- 獨立 heartbeat endpoint 作為 integrity presence
- 舊 screenshot / forced-capture API
- 前端 incident 聚合與 hard-coded event priority taxonomy
- Backend GET 觸發自動交卷
- Celery 考試結束、鎖定強制交卷或 heartbeat timeout 背景任務
- 整場 Webcam 或螢幕原始錄影留存
