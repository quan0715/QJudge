# 常駐 Integrity 服務行為與架構規格

狀態：待實作。來源為本次使用者討論與工作區原始碼盤點；不是已部署能力聲明。

## 已確認的產品決策

1. 以不影響學生考試為主。Integrity 故障本身不得阻止開考、作答、答案儲存或交卷，不因平台漏收資料自動處分學生。
2. 採常駐監考服務，每場考試仍有獨立 Run、規則、紀錄與處理進度。
3. 教師只設定考試及監考規則，不管理 Worker、容器、啟停、重啟或封存。
4. 支援建立後立即開考，以及開始時間距現在不足五分鐘。考試請求不得等待監考服務啟動或遠端回應。
5. 延長考試沿用現有「修改結束時間並儲存」，不新增延長按鈕或額外確認流程。
6. 修改時間成功後，學生倒數、後端截止、監考時程、補傳期限與封存時程一起採用新版本。已交卷者不自動恢復作答。
7. 交卷成功只代表後端已接受交卷；監考資料收件、判定與封存分別呈現，不把資料缺口說成完整。

## 範圍與工程預設

- 首版一個常駐 Integrity 實例，使用持久化 volume；每個 Run 只能有一個寫入者。此版本不宣稱多副本容錯或零停機。
- 保留 `ExamIntegrityRun`、既有事件 schema、Run ID、checkpoint 外部 URL、journal、timeline、command outbox、OPFS 與 IndexedDB 能力。
- 不新增 Kafka、Kubernetes 或另一套通用任務框架。沿用 Python/FastAPI、Django/PostgreSQL、React/TypeScript、既有物件儲存與 Compose。
- 建議初始設定：後端 reconciler 每 10 秒；學生時程每 5 秒並在頁面恢復可見時更新；補傳期 300 秒；內部連線 timeout 2 秒、request timeout 5 秒。這些是可調工程預設，非負載測試結論。
- 監考 API 與答案 API 分別限流與限制等待資源；監考失敗不能以同步重試占滿答案請求資源。
- 儲存容量不足時停止確認新資料、回報缺口；不得對未可靠保存的事件回成功 ACK。
- 本機暫存也可能失敗，不能保證瀏覽器關閉後仍可上傳。頁面提示必須反映實際保存位置與待傳狀態。
- 正常且有證據的既有違規規則仍有效；新規則只禁止把監考平台事故或重播延遲推定為學生違規。

## 原始碼基準

盤點 checkout：`codex/contest-preparation-overview`，HEAD `034a4f30`。盤點時核心 Integrity 路徑相對本機 `origin/main` 無差異；沒有查證線上部署版本。

| 現有位置 | 已確認限制 | 改造責任 |
| --- | --- | --- |
| `integrity-service/integrity_service/worker/app.py` | app 只持有一個 runtime | 以 Run ID dispatch，載入及關閉互相獨立 |
| `worker/runtime.py` | Run 已隔離 journal，但 ingest/tick 包含同步判定、命令交付及 archive | 保留引擎；拆可靠收件、背景處理及 I/O |
| `backend/apps/contests/models/integrity.py` | Run 混合容器欄位與資料生命週期；有效 Run 約束依賴 destroyed | 新增 execution backend 與 session state，分階段遷移 |
| `services/integrity_runs.py` | start/stop 依赖 Controller | resident 分支改為邏輯 session，同時維持 legacy 路徑 |
| `services/integrity_tokens.py` | token 與單場考試結束時間綁定 | resident 使用獨立內部服務身分；Run scope 必須保留 |
| `views/exam_integrity.py` | 要求 running、active exam、active device session | resident 收件與健康分離，增加限定的交卷後補傳 |
| `services/exam_submission.py` | 交卷清除 active session | 清除前保存補傳身分與截止範圍，不恢復答題權限 |
| `ExamModeWrapper.tsx`、`useIntegrityRuntime.ts` | 依 computeState 啟用；交卷後停止傳輸 | 採集與補傳生命週期拆開 |
| `core/scheduler.py`、`services/integrity_commands.py` | Worker 提供 scheduled_end auto-submit | resident 到期由考試後端負責，舊命令重驗最新期限 |
| `docker-compose*.yml` | Controller 配 Docker socket，逐場建容器 | 增加固定 resident 服務，legacy drain 完才退役舊管理 |

## 資料與責任

### 考試後端

- `Contest.schedule_revision` 在 start/end 時間確實改變時遞增。時間、revision、對應 Run 時程在同一 transaction 保存。
- `ExamIntegrityRun.execution_backend`：`legacy` 或 `resident`，建立後不在進行中切換。
- `ExamIntegrityRun.session_state`：`prepared`、`active`、`draining`、`archived`、`closed`。健康狀態獨立；服務故障不代表考試結束。
- 現有 `data_state` 繼續表示 open/archived/purged；第一階段保留容器欄位供 legacy 使用。
- `schedule_revision`、`scheduled_start_at`、`scheduled_end_at`、`accept_until` 形成 resident 控制 descriptor；policy/registry snapshot 在準備時固定，時間另有版本。
- 建立 Run 僅做資料庫工作。發布、開考、設定儲存及後端 reconciler 呼叫冪等的準備函式，不在交易中呼叫 resident HTTP。
- 後端依資料庫狀態列出需同步的 resident Run；背景傳送失敗由下輪核對補足，不能只依赖一次性的 after-commit callback。
- 後端是截止權威。延長、到期處理、resident drain 授權共同使用 Contest → Run → Participant 的鎖定次序。

### 常駐服務

- 受驗證的內部呼叫帶入 Run descriptor；不可依學生傳入的任意 Run ID 建立 runtime。
- 一個 RunRegistry 管理多個既有 WorkerRuntime，使用每 Run 鎖、有限執行資源、每 Run 工作批量與容量限制。
- 第一版限制單程序 owner；不得直接設定多個 Uvicorn workers 共寫 volume。
- 同步磁碟與 HTTP 不在共享 async event loop 直接執行。收件與慢速命令／archive 工作有分開且有上限的執行資源。
- 程序存活、可接收請求、各 Run 處理健康分開檢查。一個損壞 journal 只能使該 Run degraded。
- 服務啟動、故障恢復與進入收尾前重新讀取後端最新 descriptor。

### 收件與判定

1. 驗證簽章、Run/participant/device、schema、批次大小、序號及去重身分。
2. 在每 Run 順序鎖內可靠保存事件、接收順序與接收時間；確認可重建連續收件游標後才回 ACK。
3. `acked_through_seq` 表示可靠收件的連續序號，不表示違規判定完成。不得直接以 batch.last_seq 跨過缺號。
4. 背景依可靠保存的順序重播／判定，產生命令；命令可重送，後端執行仍需冪等。
5. 處理進度和 `release_evidence_before_ms` 依實際判定與取證需求推进，不能跟隨收件 ACK 提前釋放影片。
6. 已確認的平台故障／處理中斷區間記入可重播資料。恢復時的時間推進不得對該區間產生失聯處分；真實違規資料保留。

## 時間修改契約

- 沿用現有 Contest PATCH；後端在持有 Contest row lock 時比較真正的舊值、更新 start/end 與 revision，再同步 Run 的時間欄位。
- 修改成功不依赖 resident 線上。學生讀取的時程來自後端，回應含 server time、schedule revision、end time 及本人 exam status。
- 舊 revision 的 resident 更新不得覆蓋新版本；重複 revision 必須內容一致。
- resident Run 不再由本地 DeadlineScheduler 執行 authoritative auto-submit。後端定期掃描到期考試，並於必要的答题寫入邊界檢查期限。
- 既有 scheduled_end 命令執行前重讀最新時程；過期命令以終止性「ignored stale schedule」受理結果回覆，避免 outbox 永久重送。
- 延長先取得鎖且完成：舊截止不能交卷。到期交卷先完成：後來修改時間不恢復該學生。
- 收尾與延長競爭也依後端 revision 決定。尚未完成封存的 resident session 可依新版本回到 active；已封存的資料不重新開寫，後續開放新作答須用新的紀錄 session，已交卷身分仍保持。
- 倒數為零只觸發後端狀態確認；不可拿本機舊倒數觸發等同使用者主動交卷的請求。

## 交卷與補傳

- 使用者交卷先完成原有答案／狀態保存。監考同步失敗不得把結果改回未交卷。
- 在 active device session 清除前，記錄 `run_id/participant_id/device_id/attempt_id/submitted_at/accept_until` 的補傳授權資料。
- 補傳沿用學生登入與精確 scope 驗證；授權只允許該次考試的監考資料，不能用來寫答案、變更考試狀態或冒用其他裝置。
- grant 截止不超過該 Run 的 `accept_until`；已交卷者不用等到整場考試結束。後端在該學生 final sequence 已收件且已處理、取證命令與上傳結果均終結後回 `upload_status=complete`，此時可釋放該學生傳輸。缺少 final marker 則維持 pending，期限後標記缺口，不能假完成。
- 交卷後前端停止新採集及 health snapshot，只傳送既有 outbox、取證需求與上傳完成通知。
- 補傳不得僅依客户端時間戳判定合法性；檢查已登記 attempt、已知序號／批次、descriptor 與截止範圍，未知或可疑晚到內容標示 late/unverified，禁止據此追溯處分。
- 支援空 observations 的控制輪詢以接收遲到的取證命令，不新增考後監考事件。
- 期限屆滿顯示剩餘缺口，持久保存待處理狀態；任何頁面關閉提示都不能承諾瀏覽器已關閉仍會補傳。

## API 與部署方向

- 外部 checkpoint 維持 `POST /api/v1/contests/{id}/exam/integrity/checkpoints/`。
- 新增唯讀 `GET /api/v1/contests/{id}/exam/runtime-state/`，回傳 schedule、本人狀態、resident session 描述及必要補傳資訊。
- 內部 service control：`PUT /v1/runs/{run_id}` 冪等同步 descriptor；批次仍用 `/v1/runs/{run_id}/batches`；增加受驗證的 `/control/finalize`，只處理該 Run。
- resident→backend 使用獨立可輪替服務憑證；backend→resident 沿用 Ed25519，對新控制契約補上 method/path/body/run/revision 綁定。驗證成功後才允許載入 Run。
- 後端內部 descriptor API 只列出 resident 且可處理的 Run，不把服務憑證送給瀏覽器；legacy token 路徑暫時保留。
- main/dev/test Compose 都增加 resident 服務及後端 reconciler。resident 不掛 Docker socket；持久化資料用 `run_id` 分目錄。
- 開關只控制新 Run 的 execution backend；既有 Run 保持路由。回滾時 resident 已接收的 Run 仍由 resident 收尾，不改送 legacy 引擎。

## 驗收案例

| ID | 必須證明的行為 |
| --- | --- |
| A1 | 立即開考且 resident 不可用：學生可作答、儲存、交卷；本機紀錄恢復後可補傳 |
| A2 | A/B 兩場並行；A archive 或 command delivery 阻塞時，B 仍可收件，資料不串場 |
| A3 | ACK 後強制重啟，收件可恢復且不重複判定／執行命令；缺號不錯誤 ACK |
| A4 | resident 離線時 PATCH 延長成功；前端採用新期限，恢復後載入最新版 |
| A5 | 延長與舊截止／舊 finalize 競爭：延長先提交時舊操作無效；已交卷不恢復 |
| A6 | 交卷清除 active session 後，限定補傳仍有效；跨 Run、跨裝置、過期與答案修改被拒絕 |
| A7 | 判定落後 ACK 時證據不提前清除；收尾等待判定及取證流程或記錄缺口 |
| A8 | journal 損壞／磁碟滿只回報真實可保存狀態，不假 ACK、不因平台事故處分學生 |
| A9 | 教師無 Worker 技術操作；學生倒數更新不重掛編輯器、不丟答案／游標 |
| A10 | legacy 與 resident 並存不雙寫；切換新 Run 開關及回滾不丟歷史資料 |

## 非目標

- 不重寫既有違規規則、媒體格式或程式碼 Judge。
- 不新增教師的「延長考試」按鈕；不讓純粹時間修改自動重開已交卷作答。
- 不在有實際考試進行時搬移該 Run 的 journal 到另一個引擎。
- 不在本次計畫建立階段執行 migration、部署、資料清除或效能實驗。
