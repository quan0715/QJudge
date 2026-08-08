# AWS EC2 部署差異

> 部署狀態：尚未驗證

本文件只記錄 AWS EC2 與自有主機不同的操作。QJudge 的 clone、環境初始化、Compose 啟動與驗收仍以 [QJudge 正式架設與部署指南](../deployment.md) 為準。

在乾淨 EC2 instance 完整執行並留下驗證紀錄前，本頁不提供逐步 AWS Console 操作，也不宣稱特定 instance type 或磁碟容量足以承載正式考試。

## 實測範圍

第一次 EC2 驗證要固定並記錄：

- AWS region
- Ubuntu AMI ID、Ubuntu version 與 CPU architecture
- Instance type、vCPU 與 memory
- Root EBS volume type、容量與 encryption
- Public IPv4／Elastic IP
- Security Group inbound 與 outbound rules
- SSH 或 Session Manager 連線方式
- Docker Engine 與 Compose version
- QJudge Git commit 或 release tag
- R2、HTTP／HTTPS 與 Tunnel 選擇

完成後把實際值寫入本頁的驗證矩陣，不把 EC2 metadata 加進 `.env`。

## EC2 特有準備

### AMI 與 architecture

選用仍在安全維護期內的 Ubuntu LTS AMI。Judge image、backend image 與所有 production services 必須在同一 architecture 下實際建置及執行；未完成測試前，不假設 ARM 與 x86_64 可互換。

記錄 instance 上的實際資訊：

```bash
uname -a
uname -m
cat /etc/os-release
```

### Instance 與 EBS

Instance type 要依評測併發量與服務數量決定。EBS 至少要容納 container images、build cache、PostgreSQL volume、logs 與更新時的新舊 images；容量下限留待部署及負載測試確認。

Production volume 應啟用 encryption，並在實測時確認 snapshot、擴容與還原流程。Object storage 在 R2，不代表 PostgreSQL 可以不備份。

### Public IP

需要固定網域或 OAuth callback 時，public IP 不應在 instance stop/start 後改變。實測要選擇並記錄 Elastic IP 或其他穩定 ingress 方式。

若使用 Cloudflare Tunnel 且不直接開放 application inbound port，仍要確認 instance 可以對外連線至 Cloudflare、R2、container registry、Git repository，以及已啟用的 AI provider。

## Security Group

候選 inbound rules：

| Port | 用途 | Source 原則 |
| --- | --- | --- |
| 22/TCP | SSH | 只允許管理者固定 IP；若改用 Session Manager 可不開放 |
| 80/TCP | HTTP／ACME 或 HTTP-only 驗證 | 只在實際需要時開放 |
| 443/TCP | HTTPS | 使用 instance 上的 reverse proxy 時開放 |

不要將 PostgreSQL `5432`、Redis `6379`、backend `8000` 或 AI service `8001` 直接開放到 Internet。即使 Compose 將 port publish 到 host，Security Group 與 host firewall 仍要阻擋不必要的來源。

Outbound 至少要覆蓋實際使用的：

- Git repository
- Container registries
- Ubuntu package repositories
- Cloudflare R2
- Cloudflare Tunnel endpoints
- AI provider endpoints
- OAuth provider endpoints

實測時記錄最終規則，不直接沿用暫時性的全開 inbound policy。

## IAM

使用 Cloudflare R2 時，application 以 R2 access key／secret key 連線，不需要因 QJudge 本身建立 AWS IAM role。

若未來改用 Amazon S3、Systems Manager、CloudWatch 或 automated snapshot，才評估 instance role。每項 policy 必須對應實際功能並遵守最小權限；目前的 R2 部署路徑沒有驗證 IAM-based S3 credential discovery。

## 連線與安裝交接點

EC2 特有流程到下列條件即結束：

1. Instance 可透過 SSH 或選定的 management channel 登入。
2. Security Group 與 host firewall 已建立預期規則。
3. Git、Python 3、`cryptography`、Docker Engine、Docker Compose v2 與 curl 可用。
4. 部署磁碟已掛載並有足夠空間。
5. Instance 能連到 Git、registry 與 R2 endpoint。

接著返回 [正式架設與部署指南](../deployment.md)，從「取得 QJudge」開始執行共用流程。

## 待完成驗證矩陣

| 欄位 | 狀態 |
| --- | --- |
| QJudge version | 尚未建立 EC2 驗證 tag |
| AWS region | 尚未實測 |
| AMI／Ubuntu version | 尚未實測 |
| CPU architecture | 尚未實測 |
| Instance type | 尚未實測 |
| EBS type／size | 尚未實測 |
| Object storage | R2 路徑待實測 |
| Public ingress | HTTP／HTTPS／Tunnel 待選擇 |
| 最小部署驗收 | 尚未執行 |
| 負載測試 | 尚未執行 |
| 驗證日期 | 尚未執行 |

完成 EC2 部署後，將這張表更新為實際值，再把狀態改成「已驗證」。
