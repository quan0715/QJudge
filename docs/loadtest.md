# 200 人考試壓力測試

這套壓測使用 Locust 模擬學生登入、進入考試、作答、送出程式與結束考試。它目前不模擬瀏覽器端的 Exam Integrity checkpoint、螢幕分享或 Webcam 證據上傳，因此結果不能代表完整監考流量。

## 先隔離測試環境

壓測使用 `ci/e2e-stack.sh` 全新安裝的 stack。在獨立 worktree 以 `--set` 指定自己的 Compose project 名稱與 storage（見腳本內的預設值），資料庫、Redis 與 Docker network 都和 dev／production 分開。這個 stack 以 `CELERY_TASK_ALWAYS_EAGER=false` 啟動，Celery 任務交給真實 worker 執行。少量 smoke test 也可以直接對 dev（`http://localhost:8000`）執行。

## 第一次以 5 人驗證

先安裝隔離環境：

```bash
ci/e2e-stack.sh --set COMPOSE_PROJECT_NAME=qjudge-loadtest
```

腳本最後一行印出這個 stack 的 Compose 指令，以下以 `<compose>` 代表。確認服務狀態後建立 200 組測試帳號與考試資料：

```bash
<compose> exec -T backend python manage.py seed_loadtest_data
```

Locust 在主機端使用獨立 Python environment：

```bash
python3 -m venv .venv-loadtest
source .venv-loadtest/bin/activate
python -m pip install -r loadtest/requirements.txt
```

先跑 5 人、2 分鐘的 smoke test。這一步的目的是確認帳號、資料與 API 流程，不是測量容量：

```bash
cd loadtest
locust -f locustfile.py \
  --users 5 \
  --spawn-rate 5 \
  --run-time 2m \
  --headless \
  --host http://localhost:8080
```

若需要互動介面，改用：

```bash
locust -f locustfile.py --host http://localhost:8080
```

瀏覽器開啟 `http://localhost:8089`。

## 逐步增加到 200 人

Smoke test 沒有登入或資料錯誤後，再從 repository root 執行較長的 headless run：

```bash
cd loadtest
locust -f locustfile.py \
  --users 200 \
  --spawn-rate 10 \
  --run-time 30m \
  --headless \
  --host http://localhost:8080
```

需要固定的 50、100、150、200 人階段時，先在 `loadtest/locustfile.py` 啟用 `SteppedLoadShape` import。`loadtest/shapes.py` 會用四分鐘升到 200 人，再維持十分鐘。

Burst 測試會讓大量使用者同時開始、提交或結束考試。只在專用測試環境執行，並用安全旗標明確確認：

```bash
LT_ALLOW_HIGH_RISK_BURST=1 \
locust -f locustfile.py \
  --tags burst-start \
  --users 200 \
  --spawn-rate 200 \
  --headless \
  --host http://localhost:8080
```

## 判題處理量壓測

上面的 Locust 壓的是考試 API；判題處理量另用 `judge_loadtest` 指令。它不走 HTTP 與考試流程，直接建立提交並派送到 `high_priority` queue，等全部判完後輸出結果時間（送出到結果寫入資料庫）的 P50／P95、每分鐘處理份數，以及主機 load、可用記憶體與判題容器數。所有資料屬於使用者 `lt_judge` 與一個學生看不到的題目，`cleanup` 會全部移除。

指令要在 `celery` service 執行：那裡有 Docker socket，`/proc` 也反映主機負載。以下 `<compose>` 是該主機的 Compose 指令。

```bash
# 複製真實題目的測資與限制；參考解答從 stdin 讀入
<compose> exec -T celery python manage.py judge_loadtest seed \
  --source-problem <problem-id> --ac-code /dev/stdin < solution.cpp
# 沒有真實題目時（例如 dev）改用合成題目
<compose> exec -T celery python manage.py judge_loadtest seed --cases 100
```

WA 提交會完整執行參考解答再多印一行，CE 提交無法編譯；預設比例 AC:WA:CE = 16:49:35，取自 2026-10-13 Lab2。任何提交的判題結果不符預期、或跑完仍有判題容器時，指令以錯誤結束。

依序執行，每一步都加 `--out` 保存 JSON：

| 步驟 | 指令（`judge_loadtest run ...`） | 看什麼 |
|---|---|---|
| Smoke | `--count 3 --sequential --mix 1,1,1` | 三種結果都正確，`judge_containers_after` 為 0 |
| 單份基準 | `--count 10 --sequential` | `latency_s.mean` 即無競爭時的單份判題時間 |
| Concurrency 掃描 | 每檔 `--count <3×c>` | `per_minute_done` 不再上升、`latency_s` 明顯變長即飽和 |
| 高峰重播 1× | `--count 180 --per-minute 18` | 2026-10-13 14:25–14:35 共 178 份；P95 目標 60 秒內 |
| 高峰重播 2× | `--count 180 --per-minute 36` | 積壓多久消化完 |

切換 concurrency：在 `deploy/.env` 設定 `JUDGE_WORKER_CONCURRENCY`，再 `<compose> up -d celery`；報告的 `concurrency` 欄位會顯示 worker 實際的值。

Production 只在沒有考試與課程的時段執行，事前確認 contest 排程。若最近 30 分鐘內有真實提交等待超過 60 秒，指令會停止送出；已送出的部分仍會判完，不要用 `celery purge`，它會連真實使用者的任務一起清掉。結束後執行：

```bash
<compose> exec -T celery python manage.py judge_loadtest cleanup
```

## 判讀結果

至少記錄：

- QJudge commit SHA 與 Compose image 版本。
- 測試主機 CPU、memory 與 disk。
- 使用者數、spawn rate 與執行時間。
- request failure rate 與常用 API 的 p95 latency。
- PostgreSQL connections／deadlocks、Redis memory、Celery queue 與 container CPU。
- 測試過程中使用的 object storage endpoint 與 bucket 名稱，但不記錄 credential。

Locust 目前主要覆蓋 `ExamStudentUser`，流程是登入、進入考試、開始考試、儲存答案、提交程式、查看排行榜與結束考試。`BurstStartUser`、`BurstSubmitUser` 與 `BurstEndUser` 只測單一高峰動作。

## 停止與清理

一般停止會保留 test volumes，方便檢查結果：

```bash
<compose> down
```

只有在確認目標是這套隔離測試環境、且不需要保留任何測試資料時，才加入 `-v`。不要對 dev 或 production Compose 使用這個清理方式。

## 目前的程式位置

```text
loadtest/locustfile.py
loadtest/users/exam_student.py
loadtest/users/burst.py
loadtest/shapes.py
loadtest/safety.py
backend/apps/core/management/commands/seed_loadtest_data.py
backend/apps/submissions/management/commands/judge_loadtest.py
```
