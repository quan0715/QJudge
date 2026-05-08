# QJudge Load Test

200 人考試壓力測試（Locust + object storage + Prometheus/Grafana）。

詳細文件請看：
- [壓測流程](../docs/loadtest.md)
- [Grafana 監控部署](../docs/monitoring.md)

## Quick Start

```bash
# 首次：安裝 Locust
pip install -r loadtest/requirements.txt

# 一鍵：啟動 + 種子
./loadtest/run.sh prepare

# Paper exam（auto-save + contest/info fetch）
LOCUST_USERS=50 LOCUST_SPAWN_RATE=5 LOCUST_RUN_TIME=3m ./loadtest/run.sh run-paper

# Coding exam（含 /submissions/）
LT_CONTEST_NAME="Load Test Coding" LOCUST_USERS=50 LOCUST_SPAWN_RATE=5 LOCUST_RUN_TIME=3m ./loadtest/run.sh run-coding

# Burst（start + submit + end）
LOCUST_USERS=200 LOCUST_SPAWN_RATE=200 LOCUST_RUN_TIME=30s ./loadtest/run.sh run-burst

# 清理
./loadtest/run.sh down
# 若要連 volume 一併清掉
./loadtest/run.sh down-v
```
