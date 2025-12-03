# Judge System Scaling Guide

## 1. 水平擴展 (Horizontal Scaling)

我們的架構基於 Celery + Redis，這意味著水平擴展是開箱即用的。你可以在同一台機器上啟動多個 Worker，或在多台機器上啟動。

### 單機多 Worker (Vertical Scaling)

如果你想在同一台強大的伺服器上增加並行處理能力：

```bash
# 啟動 4 個 Celery Worker 容器
docker compose up -d --scale celery=4
```

Docker Compose 會自動負載平衡，所有 Worker 都會監聽同一個 Redis Queue。

### 多機部署 (Distributed Scaling)

如果你有多台伺服器（例如：一台 Web Server，三台 Judge Server）：

1. **Web Server**: 執行 `backend`, `db`, `redis`
2. **Judge Server**: 只需執行 `celery` worker

在 Judge Server 上的 `docker-compose.yml`：

```yaml
services:
  judge-worker:
    image: my-registry/oj-backend:latest
    command: celery -A config worker -l info
    environment:
      - REDIS_URL=redis://<WEB_SERVER_IP>:6379/0
      - DOCKER_HOST=unix:///var/run/docker.sock
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

只要 `REDIS_URL` 指向同一個 Redis，它們就會自動組成一個分散式評測叢集。

---

## 2. 微服務化 (Microservice)

為了進一步解耦，我們可以將 Judge 邏輯完全獨立出來（去除 Django 依賴）。

### 獨立 Worker 架構

目前 `apps.judge` 模組已經設計為低耦合：
- `BaseJudge`: 定義介面
- `CppJudge`/`PythonJudge`: 實作邏輯
- `JudgeFactory`: 工廠模式

**下一步重構建議**：
1. 將 `apps.judge` 移出 Django 專案，成為獨立 Python Package (e.g., `oj-judge-core`)。
2. 移除 `from django.conf import settings`，改用 `pydantic` 或 `os.getenv` 管理配置。
3. 建立一個輕量級 Celery Worker，只包含 `oj-judge-core` 和 `celery`。

### 演示腳本

已建立 `backend/scripts/standalone_worker.py`，展示了如何在不啟動完整 Django 的情況下運行評測邏輯。

```bash
cd backend
python scripts/standalone_worker.py
```

這證明了我們的核心評測引擎已經具備微服務化的能力。
