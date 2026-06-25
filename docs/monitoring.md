# Grafana 監控部署

## 架構

```
                    ┌─────────────────────────────────────┐
                    │         Cloudflare Tunnel            │
                    └──┬──────────┬──────────┬────────────┘
                       │          │          │
              q-judge-dev    storage-dev  grafana-dev
              .quan.wtf      .quan.wtf    .quan.wtf
                       │          │          │
                    ┌──▼──┐   ┌──▼──┐   ┌──▼───┐
                    │nginx│   │store │   │grafana│──→ Prometheus (internal)
                    └──┬──┘   └─────┘   └──────┘        │
                       │                          ┌──────┴──────┐
                    ┌──▼───┐                      │  Exporters  │
                    │backend│                     ├─────────────┤
                    └──┬───┘                      │ pg_exporter │
                       │                          │ redis_export│
                    ┌──▼──┐                       │ cadvisor    │
                    │celery│                      └─────────────┘
                    └─────┘
```

Prometheus 不對外暴露，僅在 Docker 內部網路被 Grafana 存取。

## 啟動監控

### Dev 環境

```bash
docker compose -f docker-compose.dev.yml -f docker-compose.monitoring.yml up -d
```

本地直接看：http://localhost:3001

### Production（q-judge.com）

```bash
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

Grafana 的 host port 預設只綁定 `127.0.0.1:3001`。遠端瀏覽請走
Cloudflare Tunnel 的 `http://grafana:3000` 路由；不要直接把 `3001` 開到
public internet。

## Cloudflare Tunnel 路由設定

到 [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → Networks → Tunnels → 選擇 tunnel → Configure → Public Hostname：

**Dev tunnel（quan.wtf）：**

| Subdomain | Domain | Service |
|-----------|--------|---------|
| grafana-dev | quan.wtf | http://grafana:3000 |

**Production tunnel（q-judge.com）：**

| Subdomain | Domain | Service |
|-----------|--------|---------|
| grafana | q-judge.com | http://grafana:3000 |

DNS CNAME 會自動建立，不需手動設。

## Cloudflare Access 保護（必做）

Zero Trust → Access → Applications → Add an application → Self-hosted：

| 欄位 | Dev | Production |
|------|-----|------------|
| Application name | Grafana Dev | Grafana Prod |
| Application domain | `grafana-dev.quan.wtf` | `grafana.q-judge.com` |
| Session duration | 24 hours | 24 hours |

Policy：
- Name: `Admin Only`
- Action: Allow
- Include: Emails → 填入你的 email

設定後，訪問 Grafana 會先經過 Cloudflare 登入驗證。

## 預建 Dashboard

部署後自動載入 **QJudge Monitoring** dashboard，包含：

| 面板 | 指標 |
|------|------|
| PostgreSQL | Active connections、Transactions/s、Cache hit ratio、Deadlocks、DB size、Tuples/s |
| Redis | Connected clients、Memory usage、Commands/s、Hit/miss ratio |
| Container | CPU %、Memory usage |

Object storage PUT latency/error rate 由壓測腳本與 Locust 場景驗證；目前一般
Grafana dashboard 不直接 scrape R2/S3 指標。

Dashboard URL：
- Dev：https://grafana-dev.quan.wtf/d/qjudge-monitoring/
- Prod：https://grafana.q-judge.com/d/qjudge-monitoring/

## 檔案結構

```
docker-compose.monitoring.yml         # 監控 overlay（dev/prod 共用）
monitoring/
├── prometheus/prometheus.yml          # scrape config (15s interval)
└── grafana/provisioning/
    ├── datasources/prometheus.yml
    └── dashboards/
        ├── dashboard.yml
        └── qjudge-monitoring.json     # 預建 dashboard
```

## Troubleshooting

**Grafana 面板顯示 No Data**
確認 Prometheus targets 是否 UP。Prometheus 預設不開 host port，請優先在
Grafana → Explore 用 Prometheus datasource 查詢；若需要直接查看
`/targets`，臨時打開 `docker-compose.monitoring.yml` 中的 `9090:9090` port。

**macOS Docker Desktop 上 Container CPU/Memory 面板沒資料**
macOS 上 cAdvisor 不會帶 `name` label（只有 container ID）。Dashboard 已包含 macOS fallback query，會顯示所有容器的加總值。Linux 上會正常顯示各容器名稱。

**Grafana 容器重啟後自訂修改消失**
Provisioned dashboard 是唯讀的。如需自訂，在 Grafana UI 內 Save As 建立副本。Grafana data volume（`grafana_data`）會保留副本。
