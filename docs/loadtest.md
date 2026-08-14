# 200 人考試壓力測試

這套壓測使用 Locust 模擬學生登入、進入考試、作答、送出程式與結束考試。它目前不模擬瀏覽器端的 Exam Integrity checkpoint、螢幕分享或 Webcam 證據上傳，因此結果不能代表完整監考流量。

## 先隔離測試環境

壓測會合併 `docker-compose.test.yml` 與 `loadtest/docker-compose.loadtest.yml`。資料庫、Redis、backend port 與 Docker network 都和 dev／production 分開；object storage 也必須使用專用 credential 與 bucket，不能共用正式資料。

先參考 `docs/examples/loadtest.env.example` 準備以下變數：

```text
LOADTEST_OBJECT_STORAGE_ENDPOINT_URL
LOADTEST_OBJECT_STORAGE_PUBLIC_ENDPOINT_URL
LOADTEST_OBJECT_STORAGE_ACCESS_KEY
LOADTEST_OBJECT_STORAGE_SECRET_KEY
LOADTEST_ANTICHEAT_RAW_BUCKET
```

不要提交實際 credential。所有變數備妥後，先確認 Compose 可以解析：

```bash
docker compose \
  -f docker-compose.test.yml \
  -f loadtest/docker-compose.loadtest.yml \
  config --quiet
```

## 第一次以 5 人驗證

先啟動隔離環境：

```bash
docker compose \
  -f docker-compose.test.yml \
  -f loadtest/docker-compose.loadtest.yml \
  up -d --build
```

確認服務狀態後建立 200 組測試帳號與考試資料：

```bash
docker compose \
  -f docker-compose.test.yml \
  -f loadtest/docker-compose.loadtest.yml \
  exec -T backend-test python manage.py seed_loadtest_data
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
  --host http://localhost:8002
```

若需要互動介面，改用：

```bash
locust -f locustfile.py --host http://localhost:8002
```

瀏覽器開啟 `http://localhost:8089`。壓測專用 Grafana 位於 `http://localhost:3001`；它只屬於這套 test Compose，不是 QJudge production 的部署需求。

## 逐步增加到 200 人

Smoke test 沒有登入或資料錯誤後，再從 repository root 執行較長的 headless run：

```bash
cd loadtest
locust -f locustfile.py \
  --users 200 \
  --spawn-rate 10 \
  --run-time 30m \
  --headless \
  --host http://localhost:8002
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
  --host http://localhost:8002
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
docker compose \
  -f docker-compose.test.yml \
  -f loadtest/docker-compose.loadtest.yml \
  down
```

只有在確認目標是這套隔離測試環境、且不需要保留任何測試資料時，才加入 `-v`。不要對 dev 或 production Compose 使用這個清理方式。

## 目前的程式位置

```text
loadtest/locustfile.py
loadtest/users/exam_student.py
loadtest/users/burst.py
loadtest/shapes.py
loadtest/safety.py
loadtest/docker-compose.loadtest.yml
loadtest/prometheus/prometheus.yml
loadtest/grafana/provisioning/
backend/apps/core/management/commands/seed_loadtest_data.py
backend/config/settings/loadtest.py
```
