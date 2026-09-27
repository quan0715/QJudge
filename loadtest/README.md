# QJudge Load Test

200 人考試壓力測試（Locust）。環境建立、執行與清理請看 [壓測流程](../docs/loadtest.md)。

## Quick Start

```bash
pip install -r loadtest/requirements.txt

# Paper exam（auto-save + contest/info fetch）
cd loadtest
LT_CONTEST_NAME="Load Test Exam" locust -f locust_paper_exam.py --users 50 --spawn-rate 5 --run-time 3m --headless --host http://localhost:8080

# Coding exam（含 /submissions/）
LT_CONTEST_NAME="Load Test Coding" locust -f locustfile.py --users 50 --spawn-rate 5 --run-time 3m --headless --host http://localhost:8080
```
