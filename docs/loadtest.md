# 200 人考試壓力測試

Locust-based 壓力測試，模擬 200 名學生同時考試（含 MinIO 截圖上傳）。

## 環境隔離

壓測使用 `docker-compose.test.yml` + `loadtest/docker-compose.loadtest.yml`，與 dev/prod 完全隔離：

| 資源 | Dev | Loadtest | 衝突 |
|------|-----|----------|------|
| DB | postgres:5432 | postgres-test:5433 | 無 |
| Redis | redis:6379 | redis-test:6380 | 無 |
| MinIO | minio:9000 | minio-test:9002 | 無 |
| Backend | backend:8000 | backend-test:8001 | **有**（ai-service 也用 8001） |
| Network | oj_network_dev | test-network | 無 |

> Backend port 8001 與 ai-service 衝突，本地壓測前必須先停 dev 環境。

## A. 本地驗證（5-10 人）

目的：確認腳本正確性，不測效能。

```bash
# 1. 停 dev 環境（釋放 port 8001）
docker compose -f docker-compose.dev.yml stop

# 2. 啟動壓測環境（含 MinIO + 監控）
docker compose -f docker-compose.test.yml \
  -f loadtest/docker-compose.loadtest.yml up -d --build

# 3. 種子資料（200 帳號 + 考試）
docker compose -f docker-compose.test.yml \
  -f loadtest/docker-compose.loadtest.yml \
  exec backend-test python manage.py seed_loadtest_data

# 4. 安裝 Locust（首次）
pip install -r loadtest/requirements.txt

# 5. Smoke test（5 人，2 分鐘）
cd loadtest
locust -f locustfile.py \
  --users 5 --spawn-rate 5 --run-time 2m \
  --headless --host http://localhost:8001

# 6. 或用 Web UI 即時觀察
locust -f locustfile.py --host http://localhost:8001
# → http://localhost:8089

# 7. Grafana 監控
# → http://localhost:3001/d/qjudge-loadtest/

# 8. 測完恢復 dev
docker compose -f docker-compose.test.yml \
  -f loadtest/docker-compose.loadtest.yml down
docker compose -f docker-compose.dev.yml start
```

## B. 遠端 200 人壓測（q-judge.com）

```bash
# ===== 在遠端機器上執行 =====

# 1. 啟動壓測環境
ANTICHEAT_S3_PUBLIC_ENDPOINT_URL=http://$(hostname -I | awk '{print $1}'):9002 \
  docker compose -f docker-compose.test.yml \
  -f loadtest/docker-compose.loadtest.yml up -d --build

# 2. 種子資料
docker compose -f docker-compose.test.yml \
  -f loadtest/docker-compose.loadtest.yml \
  exec backend-test python manage.py seed_loadtest_data

# 3. 重置 participant 狀態（非首次需要）
docker compose -f docker-compose.test.yml \
  -f loadtest/docker-compose.loadtest.yml \
  exec backend-test python manage.py shell -c "
from apps.contests.models import ContestParticipant, Contest, ExamEvent
c = Contest.objects.get(name='Load Test Exam')
ContestParticipant.objects.filter(contest=c).update(
    exam_status='not_started', violation_count=0, started_at=None,
    left_at=None, locked_at=None, lock_reason='', submit_reason=''
)
ExamEvent.objects.filter(contest=c).delete()
print('Reset done')
"

# 4. 執行壓測（擇一）

# 方案 A：Stepped ramp-up（推薦首次）
#   先取消 locustfile.py 中 SteppedLoadShape 的註解
locust -f locustfile.py --host http://localhost:8001

# 方案 B：直接 200 人
locust -f locustfile.py \
  --users 200 --spawn-rate 10 --run-time 30m \
  --headless --host http://localhost:8001

# 方案 C：Burst test（200 人同時開考）
locust -f locustfile.py --tags burst-start \
  --users 200 --spawn-rate 200 \
  --headless --host http://localhost:8001

# 5. 監控
#   Grafana: https://grafana.q-judge.com/d/qjudge-loadtest/
#   Locust:  http://<remote-ip>:8089（或 SSH tunnel）

# 6. 壓測完畢清理（test 環境可安全 -v）
docker compose -f docker-compose.test.yml \
  -f loadtest/docker-compose.loadtest.yml down -v
```

## C. 壓測階段

| 階段 | 時間 | 用戶數 | 觀察重點 |
|------|------|--------|----------|
| 1. Ramp-up | 15 min | 0→50→100→150→200 | 哪個階段開始劣化 |
| 2. Steady state | 15 min | 200 | p95 是否穩定在 Pass 範圍 |
| 3. Burst start | 1 min | 200 同時 | exam/start 是否 deadlock |
| 4. Burst submit | 1 min | 200 同時 | submissions 是否塞爆 queue |
| 5. Endurance | 60 min | 200 | Memory leak、queue 堆積 |

## 成功指標

| 指標 | Pass | Warning | Fail |
|------|------|---------|------|
| p95 一般 API | < 1s | 1-2s | > 2s |
| p95 exam/start (burst) | < 2s | 2-5s | > 5s |
| p95 exam/events | < 500ms | 500ms-1s | > 1s |
| HTTP 5xx 比率 | < 0.1% | 0.1-1% | > 1% |
| PG active connections | < 80 | 80-95 | > 95 |
| PG deadlocks | 0 | 1-2 | > 2 |
| Redis memory | < 256MB | 256-512MB | > 512MB |
| MinIO PUT p95 | < 200ms | 200-500ms | > 500ms |
| MinIO PUT error rate | < 0.1% | 0.1-1% | > 1% |
| Container CPU | < 80% | 80-95% | > 95% |

## 測試場景說明

### ExamStudentUser（主要場景）

每個虛擬用戶的完整流程：
1. `POST /api/v1/auth/email/login` → JWT 登入
2. `POST /contests/{id}/enter/` → 進入考試
3. `POST /contests/{id}/exam/start/` → 開始考試
4. **考試循環**（持續到結束）：
   - 每 2-5s: 上報 anticheat event
   - 每 2-5s: 取得 presigned URL + PUT 截圖到 MinIO
   - 每 2-5s: 儲存筆試答案
   - 偶爾: 提交程式碼、查看排行榜
5. `POST /contests/{id}/exam/end/` → 結束考試

### BurstUser（爆發場景）

- **BurstStartUser**: 全員同時 `/exam/start/`
- **BurstSubmitUser**: 全員同時 `/submissions/`
- **BurstEndUser**: 全員同時 `/exam/end/`

用 `--tags burst-start` / `burst-submit` / `burst-end` 選擇。

## 已知瓶頸（壓測中重點觀察）

1. **MinIO PUT 吞吐**: 200 人 x 每 3s 一張 ≈ 67 PUT/s、~5 MB/s 持續寫入
2. **Presigned URL 生成**: `anticheat_storage.py:get_s3_client()` 每次建立新 boto3 client
3. **Scoreboard N+1**: submissions 迭代未 select_related
4. **單 Celery worker**: burst 提交會塞爆 queue
5. **Redis 單實例**: broker + cache + channels 共用
6. **ExamEvent 寫入量**: 200 人 x 15 events/min ≈ 3000 inserts/min

## 檔案結構

```
loadtest/
├── locustfile.py                     # Locust 入口
├── users/
│   ├── exam_student.py               # 完整考試生命週期 User
│   └── burst.py                      # Burst 測試 User
├── helpers/
│   ├── auth.py                       # JWT login helper
│   └── data.py                       # 常數 + payload builder
├── shapes.py                         # LoadTestShape (ramp-up 策略)
├── docker-compose.loadtest.yml       # test compose override
├── prometheus/prometheus.yml          # 壓測用 scrape config (5s)
├── grafana/provisioning/             # 壓測用 Grafana dashboard
├── fixtures/fake_frame.webp          # ~49KB 假截圖
└── requirements.txt

backend/config/settings/loadtest.py   # 壓測 Django settings
backend/apps/core/management/commands/
└── seed_loadtest_data.py             # 200 帳號 + 考試種子資料
```

## FAQ

**Q: 本地跑壓測，port 8001 被 ai-service 佔用？**
先 `docker compose -f docker-compose.dev.yml stop`，壓測完再 `start`。

**Q: 壓測環境會影響 dev 資料庫嗎？**
不會。壓測用獨立的 `postgres-test`（port 5433）和 `test-network`。

**Q: 遠端壓測後要清理嗎？**
`docker compose ... down -v` 即可。test 環境可安全 `-v`。

**Q: 壓測跑一半 participant 狀態卡住？**
用上面「重置 participant 狀態」的指令清除後重跑。
