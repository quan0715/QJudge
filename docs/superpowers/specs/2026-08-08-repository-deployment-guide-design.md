# QJudge Repository Deployment Guide Design

日期：2026-08-08

## 目標

將 repository 內的部署文件定為 QJudge 唯一、正式且可驗證的架設指南。讀者應能從一台尚未安裝 QJudge 的主機開始，完成最小可行部署，再依需求啟用物件儲存替代方案、AI、MCP、HTTPS、OAuth 或 Cloudflare Tunnel。

論文附錄不另行維護一套部署步驟。論文完成前，從指定的 Git tag 擷取並濃縮本指南，讓附錄內容能對應到可重現的程式版本。

## 讀者與使用情境

主要讀者是第一次部署 QJudge、具備基本 Linux 與 Docker 操作經驗的人。指南不假設讀者熟悉 QJudge 的服務拓撲，也不要求先理解所有 Compose 變數。

支援兩種部署目標：

1. 自有主機：使用者自行準備 Linux 主機、網路與防火牆。
2. Cloud VM：共用相同的 QJudge 安裝流程；供應商特有步驟另行說明。論文採 AWS EC2 作為實例。

兩者不建立兩套重複文件。只有主機建立、公開 IP、防火牆、磁碟與雲端權限等差異放入 EC2 章節。

## 方案比較

### 方案一：單一大型部署文件

所有內容都放在 `docs/deployment.md`。優點是搜尋與列印方便；缺點是最小部署、Cloudflare、AI、MCP 與各種儲存方案會互相穿插，讀者難以辨識必要步驟。

### 方案二：線性主線搭配選用分支（採用）

`docs/deployment.md` 提供從零開始的最小可行部署；`docs/deployment/` 收納前置資源、物件儲存、HTTPS/OAuth、AI/MCP、EC2 與故障排除。主線只在需要做選擇時連到分支文件。

這種方式能保留單一部署順序，又不會讓選用服務膨脹主流程。各分支也能獨立測試與更新。

### 方案三：依供應商分類

分成 EC2、GCE、自有主機等完整指南。這對雲端新手直觀，但會大量複製 Docker、env、初始化與驗證步驟，版本更新時容易產生差異，因此不採用。

## 文件架構

```text
docs/
├── deployment.md
└── deployment/
    ├── prerequisites.md
    ├── object-storage.md
    ├── ai-and-mcp.md
    ├── https-and-oauth.md
    ├── ec2.md
    └── troubleshooting.md
```

各文件責任如下：

- `docs/deployment.md`：正式入口與唯一線性主流程，包含準備、取得程式、建立 `.env`、啟動、初始化及驗收。
- `prerequisites.md`：解釋 PostgreSQL、Redis、S3-compatible storage、AI provider、MCP 與公開入口的功能，列出自架與雲端選擇，但不把選用服務列為必要條件。
- `object-storage.md`：說明共用 S3 契約，以及 R2、MinIO 的差異與設定方式。
- `ai-and-mcp.md`：區分本機／內部網路使用與需要公開 HTTPS 的 Remote MCP 或 OAuth 情境。
- `https-and-oauth.md`：比較反向代理、Cloudflare Tunnel 等 HTTPS 方式，並以 Cloudflare Tunnel 作為實例。
- `ec2.md`：只記錄 EC2 特有的 VM、Security Group、IP、儲存與連線步驟，再導回共用主流程。
- `troubleshooting.md`：收錄可辨識的錯誤訊息、診斷指令與恢復方式，不複製正常部署流程。

現有 `docs/cloudflare.md` 保留 Cloudflare 平台的延伸與歷史資訊。正式部署步驟移到上述分支後，該文件改為背景資料並連回正式指南。

## 最小可行部署邊界

最小部署包含：

- 一台可執行 Docker Compose v2 的 Linux 主機。
- QJudge application、PostgreSQL、Redis、backend、frontend、worker、AI service 與評測相關容器。
- 一組 S3-compatible object storage。目前已驗證的初始化路徑是 Cloudflare R2。
- 由 `scripts/setup-env.sh` 產生的 `.env`。
- HTTP 存取即可；不強制網域、HTTPS、Tunnel 或第三方 OAuth。

最小部署不包含：

- Grafana、GlitchTip、計費服務或其他監控 overlay。
- Cloudflare Tunnel、Tailscale、Remote MCP 或第三方 OAuth。
- 特定 AI provider 金鑰；未設定時不得阻止基本服務啟動。

MinIO 在相容性實作與測試完成前，文件必須標示為「尚未提供」，不得放入可直接執行的成功路徑。EC2 亦須在實際部署後才標示為已驗證。

## AI 模型文件邊界

正式部署指南只說明如何為系統現有的 AI provider 提供 API key，以及未提供 key 時對最小部署的影響。部署者使用官方 provider endpoint 時，不需要設定 Base URL。

下列內容不屬於架設與部署指南：

- `OPENAI_BASE_URL`、`DEEPSEEK_BASE_URL` 等自訂 endpoint。
- Self-hosted OpenAI-compatible model server。
- API gateway、model proxy 與 provider routing。
- Model registry 的新增、更新或下架流程。
- 新模型的 context window、rate limit、tool calling 與 reasoning 相容性測試。

底層程式可以保留自訂 endpoint 能力，但 `.env.example` 與 `docs/deployment/` 不公開這些設定。未來建立獨立的模型擴充文件，再說明自架 endpoint、provider adapter、model registry 與驗證流程。

## 指令與腳本原則

文件解釋每個決策及其輸入，腳本只處理容易出錯或不適合手動完成的操作：

- `scripts/setup-env.sh`：驗證外部輸入、產生 secrets、偵測 Docker socket UID/GID，並驗證 Compose 設定。
- `scripts/deploy-prod.sh`：執行 production 部署的 fail-fast 檢查與啟動流程。
- Compose：保存服務內部 URL、資料庫名稱、queue、bucket、TTL 與 runtime limit 等版本化預設。

指南不得要求讀者把內部實作值重新填回 `.env`，也不得以複製 `.env.example` 取代初始化工具。

## 驗證與狀態標示

每條正式部署路徑都要記錄驗證矩陣：

| 欄位 | 內容 |
| --- | --- |
| QJudge version | Git commit 或 release tag |
| 主機環境 | 作業系統與架構 |
| 部署目標 | self-hosted 或 cloud-vm |
| 物件儲存 | R2 或 MinIO |
| 公開入口 | HTTP、反向代理或 Tunnel |
| 驗證日期 | 實際執行日期 |

文件中的路徑分成三種狀態：

- 已驗證：曾在乾淨環境依文件完整執行，且通過驗收。
- 可選用：不影響最小部署，啟用時需完成自己的驗收。
- 尚未提供：介面或規劃存在，但實作或實測尚未完成。

狀態只寫在章節開頭或驗證矩陣，不在每個段落重複標籤。

## 最小部署驗收標準

完成最小部署後，至少要確認：

1. `docker compose config` 成功，必要服務沒有依賴 Tunnel、監控或計費設定。
2. PostgreSQL bootstrap、Django migration 與 AI migration 成功。
3. frontend、backend、AI service、Redis 與 worker 通過 health check。
4. 使用者能開啟 frontend，backend API 可回應。
5. 能建立管理者帳號並登入。
6. 能提交一筆最小評測，worker 能完成任務並回傳結果。
7. 能上傳並讀取一個物件，確認 S3-compatible storage 的寫入、讀取與 presigned URL。
8. 未設定 Tunnel、OAuth、AI provider 與 Remote MCP 時，核心流程仍可運作。

AI provider 與 MCP 的功能驗收歸入選用章節，不以外部 provider 是否回應作為最小部署成功條件。

## 文件測試策略

- Contract tests 驗證 `.env.example`、`setup-env.sh` 與三份 Compose 的環境邊界。
- 產生暫存 `.env`，實際解析 production、development 與 test Compose。
- PostgreSQL test Compose 驗證 bootstrap 及 Django／AI database credential isolation。
- 在乾淨 Linux 環境依主線手動執行一次，將遇到的問題轉為測試或 `troubleshooting.md` 條目。
- MinIO 與 EC2 各自完成實測後，才更新其驗證狀態。

## 第一階段實作範圍

第一階段只處理文件資訊架構，不宣稱尚未完成的部署能力：

1. 將 `docs/deployment.md` 改為正式、線性的最小部署入口。
2. 建立六份分支文件，搬移既有且仍正確的內容。
3. 在主線加入驗收清單與驗證矩陣。
4. 更新 README 與 Cloudflare 文件的導覽連結。
5. 以連結檢查、關鍵字 contract 與 Compose 現有測試驗證文件沒有回復舊環境契約。

MinIO 相容性、乾淨 Linux 完整部署與 EC2 實測分別作為後續實作階段，不在文件重構時假設已完成。

## 論文附錄產出方式

論文完成部署實驗後建立專用 release tag，例如 `qjudge-thesis-deployment-v1`。附錄記錄該 tag、測試平台與驗證日期，再從正式指南摘錄最小部署、R2／MinIO、HTTPS/OAuth 及 EC2 實例。repo 文件持續作為完整版本；論文只保留研究重現所需內容。
