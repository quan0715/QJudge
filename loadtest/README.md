# QJudge Load Test

200 人考試壓力測試（Locust + MinIO + Prometheus/Grafana）。

詳細文件請看：
- [壓測流程](../docs/loadtest.md)
- [Grafana 監控部署](../docs/monitoring.md)

## Quick Start

```bash
# 停 dev → 啟動壓測環境 → 種子資料 → 跑測試
docker compose -f docker-compose.test.yml -f loadtest/docker-compose.loadtest.yml up -d --build
docker compose -f docker-compose.test.yml -f loadtest/docker-compose.loadtest.yml \
  exec backend-test python manage.py seed_loadtest_data
pip install -r loadtest/requirements.txt
cd loadtest && locust -f locustfile.py --users 5 --spawn-rate 5 --run-time 2m --headless --host http://localhost:8002

# Paper exam（不含 /submissions/，模擬 auto-save + contest/info fetch）
cd loadtest && locust -f locust_paper_exam.py --users 50 --spawn-rate 5 --run-time 3m --headless --host http://localhost:8002

# Burst（分流入口，避免 class/tag 汙染）
cd loadtest && locust -f locust_burst_start.py --users 200 --spawn-rate 200 --run-time 30s --headless --host http://localhost:8002
cd loadtest && locust -f locust_burst_submit.py --users 200 --spawn-rate 200 --run-time 30s --headless --host http://localhost:8002
cd loadtest && locust -f locust_burst_end.py --users 200 --spawn-rate 200 --run-time 30s --headless --host http://localhost:8002
```
