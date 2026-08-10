# 從一台主機開始部署 QJudge

這份指南會帶你從一台可以登入的 Ubuntu LTS 主機開始，完成第一套可登入、可出題、可提交程式並取得評測結果的 QJudge。

你不需要先理解所有 container，也不需要逐項填寫數十個環境變數。先把核心系統跑起來並完成驗收，HTTPS、第三方登入、AI 與外部 MCP 都留到後面再決定。

> 目前已驗證環境變數、Docker Compose 與資料庫權限契約；乾淨 Ubuntu 主機的完整流程仍待實機驗證。若你照著操作時遇到差異，請記錄 Ubuntu 版本、Docker 版本與 QJudge commit，並參考[部署故障排除](deployment-troubleshooting.md)。

## 1. 先確認這條路適合你

QJudge 適合由校園教師、課程助教或開課單位部署在一台長期運作的 Linux 主機上。這台主機會提供網頁、API、程式評測與背景工作；Docker Compose 會一併管理 PostgreSQL database 與 Redis queue。

另外還要準備一個保存檔案的空間。QJudge 使用 S3-compatible object storage 保存題目圖片、監考證據與 AI 產生的檔案，可以連接 Cloudflare R2，也可以連接由學校維護的 MinIO。Database 保存帳號、題目與作答紀錄；object storage 保存較大的檔案，兩者不能互相取代。

你可以使用兩種主機：

- 自有主機：學校、系所或實驗室管理的實體機或虛擬機。
- Cloud VM：雲端供應商提供的 VM，例如之後會實測的 AWS EC2。

兩條路只有建立主機、網路、防火牆與磁碟的方式不同。只要你已經能登入一台 Ubuntu LTS 主機，接下來的 QJudge 安裝步驟相同。

正式考試需要依同時使用人數與評測量做容量測試。目前沒有可以套用到所有課程的最低 CPU、memory 或 disk 數字，不要只憑文件中的主機範例決定正式規格。

## 2. 準備主機

本指南假設你已經登入部署主機，並且帳號可以使用 `sudo`。先記錄作業系統：

```bash
cat /etc/os-release
```

你應該看到 Ubuntu LTS 的版本資訊。

接著逐一確認 Git、Python 與 curl：

```bash
git --version
python3 --version
curl --version
```

再確認 Docker Engine 與 Docker Compose v2：

```bash
docker --version
docker compose version
```

如果尚未安裝 Docker，請先依 Docker 官方的 Ubuntu 安裝說明完成 Engine 與 Compose plugin，再回到這裡。安裝完成後，確認目前帳號能連到 Docker daemon：

```bash
docker info
```

正常情況會顯示 Client 與 Server 資訊，而不是 permission denied 或 daemon unavailable。若這一步失敗，先處理 Docker 權限或服務狀態，不要繼續建立 QJudge 設定。

Cloud VM 還要確認供應商的 firewall／Security Group 沒有把 PostgreSQL、Redis、backend 或 AI service port 直接開放到 Internet。第一次本機驗收只需要能透過 SSH 管理主機；公開網頁入口留到第 9 節處理。

## 3. 準備檔案儲存

在下載 QJudge 前，先選擇檔案要放在哪裡：

- Cloudflare R2：不必自行維護 storage server，適合希望先完成部署的課程團隊。
- MinIO：檔案可以留在校內或既有機房，但容量、備份、更新與 HTTPS 要由管理單位負責。

如果 bucket、endpoint、access key 或 CORS 對你來說是新名詞，請先跟著[準備 QJudge 的檔案儲存](deployment-storage.md)完成其中一條路徑。回到這裡時，手邊應有：

- QJudge containers 使用的 S3 API endpoint。
- 使用者瀏覽器可以連線的 public endpoint。
- Access key ID。
- Secret access key。
- 目前要啟用之功能所需的 bucket；第一次核心驗收至少需要 `markdown-images`。

Credential 不要寫進筆記、shell script 或 Git。下一節的初始化工具會在需要時從終端機詢問，並把結果寫入權限為 `0600` 的 `.env`。

## 4. 取得 QJudge

選擇一個只用來部署的目錄，下載 repository：

```bash
git clone https://github.com/quan0715/QJudge.git
```

進入專案目錄：

```bash
cd QJudge
```

記錄目前版本：

```bash
git rev-parse HEAD
```

正式部署應使用 release tag 或明確的 commit SHA。不要讓 production 長期追蹤一個會持續改變的 branch，也不要在這個部署目錄保存未提交的程式修改，因為部署腳本會切換到你指定的版本。

## 5. 建立環境設定

QJudge 根目錄的 `.env` 是部署設定，不進 Git。你不需要從 `.env.example` 複製後逐行填寫；`scripts/setup-env.sh` 會詢問必要資料、產生 secrets、檢查 Docker socket，並在寫入前驗證 production Compose。

如果使用 R2，而且這台機器是學校或實驗室管理的主機，執行：

```bash
./scripts/setup-env.sh \
  --target self-hosted \
  --storage r2 \
  --origin http://YOUR_QJUDGE_HOST
```

如果使用 R2，但主機是 Cloud VM，把 target 改成：

```bash
./scripts/setup-env.sh \
  --target cloud-vm \
  --storage r2 \
  --origin http://YOUR_QJUDGE_HOST
```

若使用 MinIO，將 storage 改成 `minio`：

```bash
./scripts/setup-env.sh \
  --target self-hosted \
  --storage minio \
  --origin http://YOUR_QJUDGE_HOST
```

Cloud VM 同樣將 target 改成 `cloud-vm`。`YOUR_QJUDGE_HOST` 要換成瀏覽器實際使用的 hostname 或 IP；如果有非標準 port，也要一起寫入。Origin 只能包含 `http://` 或 `https://`、hostname 與選用 port，不能加 `/app` 等路徑。

腳本接著會詢問對應服務的 endpoint、access key 與 secret key。R2 的 container endpoint 與 public endpoint 通常相同；MinIO 可能分別使用校內位址與公開 HTTPS 網域。正常完成時會顯示：

```text
Environment ready: .../.env
```

若 `.env` 已存在，腳本會拒絕覆寫。不要把 `--force` 當成一般更新方法，因為它會重新產生 application 與 database secrets。

此處的 HTTP 只適合可信任的校園內網、VPN 或暫時的本機驗收。不要經由未受信任的 Internet 使用 HTTP 登入；公開前請完成第 9 節的 HTTPS 設定。

## 6. 啟動 QJudge

QJudge 的本機金鑰初始化會使用 Python `cryptography` package。先檢查它是否存在：

```bash
python3 -c 'import cryptography'
```

沒有輸出代表可以繼續。若出現 `ModuleNotFoundError`，在 Ubuntu 安裝缺少的套件：

```bash
sudo apt-get update
sudo apt-get install -y python3-cryptography
```

建立 Exam Integrity 使用的本機 secret files：

```bash
python3 scripts/bootstrap_integrity_secrets.py
```

腳本會保留格式正確的既有檔案，不需要每次部署都重建。

現在把這次要部署的 commit SHA 交給 production 部署腳本：

```bash
./scripts/deploy-prod.sh "$(pwd)" "$(git rev-parse HEAD)"
```

第二個參數的用途是固定這次部署的版本。腳本會先從 Git remote 更新資料，再以 `checkout --force` 切到指定 SHA；因此這個 commit 必須已經存在於 remote、release tag，或部署主機的 repository 中。不要在保存開發中修改的工作目錄執行這支腳本，否則未提交的修改可能被覆蓋。

這一步會下載或建立 images、執行 database bootstrap 與 migrations、啟動服務，再檢查首頁。第一次 build 可能需要一段時間。正常結束會看到：

```text
[deploy] success
```

部署腳本會清理沒有被 container 使用的舊 image。如果這台 Docker host 還承載其他系統，請先確認共用主機的 image 維護方式。

## 7. 建立管理者帳號

先確認一次性 database 工作成功結束：

```bash
docker compose ps --all ai-db-bootstrap ai-migrate
```

`ai-db-bootstrap` 與 `ai-migrate` 應顯示成功結束。Django migration 由 backend 啟動流程執行；如果 backend 不斷重新啟動，先查看故障排除，不要刪除 database volume。

接著建立第一個管理者帳號：

```bash
docker compose exec backend python manage.py createsuperuser
```

依畫面輸入 username、email 與密碼。終端機顯示建立成功後，才進入瀏覽器驗收；顯示名稱可以在第一次登入後設定。

## 8. 完成第一次驗收

先在主機上查看所有服務：

```bash
docker compose ps --all
```

長期服務應為 running 或 healthy。`ai-db-bootstrap`、`ai-migrate` 與 `judge-image` 是一次性工作，成功結束是正常狀態。

確認網頁入口：

```bash
curl --fail http://127.0.0.1/
```

確認 backend：

```bash
curl --fail http://127.0.0.1:8000/api/health/
```

確認 AI service 的基礎相依服務已就緒：

```bash
curl --fail http://127.0.0.1:8001/health/ready
```

沒有設定 AI provider key 時，AI 回答不會運作，但 readiness 與一般 QJudge 功能仍應正常。

最後用瀏覽器開啟第 5 節設定的 origin，依序確認：

1. 使用剛建立的管理者帳號登入。
2. 建立一個最小題目。
3. 提交一份可通過的程式，並看到評測結果。
4. 在支援 Markdown 的編輯器上傳圖片，再重新開啟確認可以讀取。

先完成這四項，再加入其他服務。容器全部顯示 running 並不等於使用者流程真的可用。

## 9. 決定是否開放到 Internet

如果 QJudge 只在可信任的校園網路或 VPN 內使用，可以先維持受限制的 HTTP 入口。如果學生會經由 Internet 登入，請先設定網域與 HTTPS，再開放服務。

第三方 OAuth 登入與 Remote MCP 都需要穩定的公開 HTTPS。Cloudflare Tunnel 是其中一種方式，但不是 object storage 的必要條件；兩者解決不同問題。

需要公開入口、OAuth、AI provider 或外部 MCP 時，請繼續閱讀[在核心部署完成後加入選用功能](deployment-options.md)。

## 10. 更新與暫停

更新前先備份 PostgreSQL 與重要檔案，並取得新的 release tag 或 commit：

```bash
git fetch --all --tags --prune
```

使用你要部署的明確版本重新執行部署：

```bash
./scripts/deploy-prod.sh "$(pwd)" "RELEASE_TAG_OR_COMMIT_SHA"
```

更新後重新執行第 8 節的健康檢查與使用者流程。

需要暫時停止服務時：

```bash
docker compose stop
```

這會保留 containers、volumes 與資料。一般維護不需要 `down -v`；任何資料刪除都應先有明確目標、備份與還原計畫。
