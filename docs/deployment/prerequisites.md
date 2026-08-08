# 部署前準備與服務選擇

本文件說明各項服務的用途與部署責任。QJudge 的預設 production Compose 已包含 PostgreSQL、Redis 與 application services；部署者不需要先向雲端供應商購買對應的 managed service。

## 必要軟體

部署主機需要：

- 64-bit Linux
- Git
- Python 3 與 `cryptography` package
- Docker Engine
- Docker Compose v2
- curl

目前尚未完成不同 CPU、記憶體與架構組合的容量測試，因此不宣稱最低硬體規格。正式部署前應依預期的同時使用人數、評測併發量及 evidence upload 量進行負載測試。

## 服務功能與部署責任

| 元件 | 功能 | 最小部署責任 | 預設方式 |
| --- | --- | --- | --- |
| PostgreSQL | QJudge 與 AI 資料持久化 | QJudge 管理 | Compose container 與獨立 application roles |
| PgBouncer | PostgreSQL connection pooling | QJudge 管理 | Compose container |
| Redis | Celery queue、cache 與 AI queue | QJudge 管理 | Compose container |
| Backend | API、認證與主要業務邏輯 | QJudge 管理 | Django container |
| Frontend | 使用者介面與 HTTP 入口 | QJudge 管理 | Nginx container |
| Workers | 評測、背景工作與排程 | QJudge 管理 | Celery containers |
| AI service | AI workflow 與 artifacts | QJudge 管理 | API、worker、scheduler containers |
| MCP server | QJudge tools 與內部 AI 整合 | QJudge 管理 | 內部 Compose service |
| Object storage | Evidence、Markdown images、AI artifacts | 部署者提供 | Cloudflare R2 |
| AI provider | 模型推論 | 選用、部署者提供 | 現有支援供應商的 Cloud API |
| 公開 HTTPS 入口 | 公開網域、TLS 與 OAuth callback | 選用、部署者提供 | 反向代理或 Tunnel |

Object storage 是目前唯一由最小部署外部提供的必要服務。資料庫與 Redis 若要改用 managed service，必須另行修改、測試 Compose 內部連線與 bootstrap 流程；不能只替換 `.env`。

## 開源與雲端方案

下表是可評估的方案，不代表所有組合都已通過 QJudge 部署測試。

| 功能 | 自架／開源方案 | 雲端方案 | 目前 QJudge 狀態 |
| --- | --- | --- | --- |
| PostgreSQL | Compose PostgreSQL | Amazon RDS 等 managed PostgreSQL | Compose 已使用；managed database 尚未建立部署路徑 |
| Redis | Compose Redis | Amazon ElastiCache 等 managed Redis | Compose 已使用；managed Redis 尚未建立部署路徑 |
| Object storage | MinIO | Cloudflare R2、Amazon S3 | R2 env 契約已驗證；MinIO 尚未提供 |
| HTTPS ingress | Caddy、Nginx | Cloudflare Tunnel、雲端 Load Balancer | 選用；Tunnel profile 已提供 |
| AI provider | 不在本部署指南範圍 | OpenAI、DeepSeek API | 選用；只需設定實際使用供應商的 API key |
| MCP | 內部 qjudge-mcp | 公開 Remote MCP | 內部路徑已在 Compose 定義；公開路徑需要 HTTPS |

選擇雲端服務前，應確認費用、資料存放區域、備份、網路流量及供應商權限。這些是部署決策，不應全部轉成根目錄 `.env`。

## 自有主機與 Cloud VM 的差異

QJudge 的 clone、`.env` 初始化、Compose 啟動與驗收步驟完全共用。差異只出現在主機與網路層：

| 項目 | 自有主機 | Cloud VM |
| --- | --- | --- |
| 主機建立 | 自行安裝與維護 Linux | 由供應商建立 VM image |
| 公開 IP | 路由器、機房或 ISP 管理 | Elastic／static IP 或供應商 public IP |
| 防火牆 | 主機與網路設備共同管理 | 主機 firewall 加 Security Group／cloud firewall |
| 磁碟 | 自行規劃裝置、RAID 與備份 | Block volume、snapshot 與擴充政策 |
| 身分權限 | 本機帳號與 SSH keys | IAM、instance role 與 SSH／session service |
| 維護責任 | 硬體到 application 全部自行負責 | 供應商負責實體層，部署者仍負責 OS 與 application |

論文的 Cloud VM 實例採 AWS EC2。實測前不把 EC2 特有值寫進共用 `.env`。

## 主機檢查

先記錄作業系統、CPU、記憶體與磁碟：

```bash
uname -a
uname -m
free -h
df -h
```

確認工具與 Python package：

```bash
git --version
python3 --version
python3 -c 'import cryptography; print(cryptography.__version__)'
docker --version
docker compose version
curl --version
```

確認 Docker daemon 與目前帳號權限：

```bash
docker info
docker run --rm hello-world
```

最後確認主機能連到 Git repository、container registry、object storage endpoint，以及實際啟用的 AI provider。未使用外部 AI provider 時，不需要為它開放額外 inbound port。

返回 [QJudge 正式架設與部署指南](../deployment.md)。
