# QJudge 文件清理、整併與公開部署指南設計

## 1. 背景

QJudge 目前有兩個不同用途的文件區：

- `/docs`：repository 內部文件，混有正式說明、架構紀錄、操作指南、歷史設計稿與實作計畫。
- `frontend/public/docs`：產品實際對外提供的公開文件，由文件頁載入並提供搜尋與導覽。

盤點結果顯示，`/docs` 共有 62 個檔案、約 28,000 行。其中 `docs/superpowers/plans`、`docs/superpowers/specs` 與 `docs/plans` 合計 45 份、25,785 行，主要是已完成或失去入口的工作紀錄。其餘文件也存在部署內容重複、舊分支資訊、歷史 Cloudflare 帳號快照，以及和目前部署方向不一致的監控說明。

公開文件才是正式發布面。這次工作先清理 `/docs`，確認仍有效的內容，再以部署文件為第一批更新 `frontend/public/docs`。多語系翻譯放在最後階段，不和繁體中文內容重整同時進行。

## 2. 目標

1. `/docs` 只保留目前仍有效、且維護程式或系統營運確實需要的文件。
2. 不保留完成的 spec、implementation plan、歷史部署快照或沒有維護責任的說明。
3. 公開部署文件成為部署者唯一應閱讀的正式來源。
4. 部署指南以校園教師、課程助教與開課單位為主要讀者。
5. 讀者不需要預先理解 QJudge 的服務架構或部署術語。
6. 文件依實際部署旅程逐步介紹選擇、操作、預期結果與常見問題。
7. 所有可執行指令都要對照目前 repository 的腳本、Compose 與設定驗證。

## 3. 非目標

- 本階段不修改 application architecture、部署腳本或 Compose 行為。
- 本階段不補做尚未完成的 MinIO 或 EC2 部署能力。
- 不建立 `docs/archive`；歷史由 Git 保存。
- 不在第一批部署文件完成前全面重寫學生、教師與管理者操作手冊。
- 不在繁體中文內容尚未穩定時同步更新英文、日文與韓文。

## 4. 文件責任

### 4.1 公開文件

`frontend/public/docs` 是正式公開文件的唯一來源。部署文件完成後，產品內的文件導覽連到 `/docs/deployment`；repository README 則連到對應的 `frontend/public/docs/zh-TW/deployment.md` 原始檔，不再連到 `/docs/deployment.md`。

第一批新增四份繁體中文部署文件：

```text
frontend/public/docs/zh-TW/
├── deployment.md
├── deployment-storage.md
├── deployment-options.md
└── deployment-troubleshooting.md
```

責任如下：

- `deployment.md`：從一台 Ubuntu LTS 主機開始，完成最小部署、初始化、驗收與更新。
- `deployment-storage.md`：說明檔案為何需要物件儲存、R2 準備方式、bucket 權限與 MinIO 狀態。
- `deployment-options.md`：只說明 HTTPS、OAuth、Cloudflare Tunnel、AI provider 與 Remote MCP 的增量設定。
- `deployment-troubleshooting.md`：依正常部署順序處理環境、Compose、資料庫、服務健康、R2、Judge、Tunnel 與 OAuth 問題。

英文、日文與韓文使用相同檔名與章節責任，但在繁體中文內容完成、實測並定稿後才建立或更新。

### 4.2 內部文件

清理完成後，`/docs` 只保留下列類型：

- `/docs/README.md`：內部文件索引、責任與公開文件入口。
- `api-conventions.md`：仍由程式實作採用的 API 契約。
- `anticheat-architecture.md`：目前 Exam Integrity 的責任與資料流。
- `i18n.md`：尚未移入公開開發者文件前的語系維護規則。
- `loadtest.md`：和現有 load-test 程式一致的操作方式。
- `operations/exam-integrity-runbook.md`：維運人員處理 Integrity Run 的必要流程。
- `examples/loadtest.env.example`：壓力測試專用物件儲存範本。

保留不代表原文直接沿用。每份文件都必須對照目前程式更新；若內容已由公開文件完整取代，則移除內部副本。

## 5. 清理與合併規則

### 5.1 直接移除的歷史工作文件

擷取仍有效的決策後，刪除：

- `docs/superpowers/plans/`
- `docs/superpowers/specs/`
- `docs/plans/`

這些內容不搬到 archive，也不轉成新的摘要檔。未完成工作應由 issue、目前程式狀態或新的實作任務管理。

### 5.2 完成遷移後移除的重複文件

- `docs/deployment.md`
- `docs/deployment/`
- `docs/user-guide.md`
- `docs/developer-guide.md`
- `docs/qauth-service-architecture.md`
- `docs/cloudflare.md`
- `docs/monitoring.md`

處理方式：

- 部署內容先在 `/docs` 內清理重複與矛盾，再改寫成公開部署文件；公開版本驗證後移除內部部署全文。
- `user-guide.md` 由既有公開學生與教師文件取代。
- Developer Guide 的有效內容移入公開 `dev-setup.md`、`contributing.md` 或仍保留的內部技術文件。
- QAuth 有效內容合併到公開 `identity-auth-extension.md`。
- Cloudflare 的現行操作併入 `deployment-options.md`；帳號 ID、Tunnel ID、DNS 快照與舊監控 route 不保留。
- Grafana、GlitchTip、Recur、billing 與 monitoring 不列為正式部署需求。壓力測試自己的 Grafana 若仍由 load-test Compose 使用，只在 `loadtest.md` 說明。

## 6. 執行順序

### 階段一：清理 `/docs`

1. 建立內部文件索引與保留清單。
2. 刪除歷史 plans/specs。
3. 比對並整併重複的部署、使用者、認證、Cloudflare、開發與監控內容。
4. 修正 README 與 repository 內所有指向已刪除文件的連結。
5. 保留尚待發布的乾淨部署內容，作為下一階段的工作來源。

### 階段二：核對目前程式

逐項確認：

- `scripts/setup-env.sh` 的輸入、預設值與安全行為。
- `.env.example` 的 operator-managed 設定。
- `docker-compose.yml` 的服務、profile、port、volume 與一次性任務。
- `scripts/deploy-prod.sh` 的實際執行順序。
- Database bootstrap、migration 與 health endpoint。
- Object storage bucket、R2 endpoint、AI provider、MCP、OAuth 與 Tunnel 設定。
- README、公開文件導覽與實際檔案的一致性。

查不到實作或沒有完成實測的內容，不得寫成可用功能。

### 階段三：發布繁體中文部署文件

1. 建立四份繁體中文公開部署文件。
2. 更新 `frontend/public/docs/config.json`，新增系統部署分類。
3. 更新繁體中文 `docs.json` 的 section 與 item 名稱。
4. 更新 `overview.md`，移除舊分支、舊 PR 與過期日期。
5. 調整 `mcp-setup.md`：使用者只看到連線與授權；部署設定移至 `deployment-options.md`。
6. 調整 `identity-auth-extension.md`、`dev-setup.md` 與 `contributing.md` 中與部署或文件責任衝突的內容。
7. 公開版本通過驗證後，刪除 `/docs` 中重複的部署全文。

### 階段四：更新其他公開文件

依序處理學生、教師與助教、系統管理者、開發者文件。每一批都要對照實際 UI、API 與權限，不用舊文件推測目前功能。

### 階段五：多語系

繁體中文全部定稿後，再更新英文、日文與韓文 Markdown，以及四種語言的 `docs.json`。翻譯必須保持相同資訊與限制，但用各語言自然的表達，不直接逐字翻譯繁體中文句型。

在階段五完成前，其他語言使用文件頁既有的 zh-TW fallback 載入繁體中文部署內容與導覽名稱。`check-docs-translations.js` 會把尚未建立的 Markdown 列為待翻譯項目，但目前只提出警告且以成功狀態結束；這是已知的過渡狀態，不需要修改檢查器，也不建立假的翻譯檔案來消除警告。

## 7. 部署文件敘事方式

### 7.1 讀者假設

主要讀者是校園教師、課程助教與開課單位。只假設讀者能登入 Linux 主機、複製指令並閱讀基本錯誤訊息。不假設他們知道 Docker Compose、object storage、R2、bucket、public origin、OAuth、MCP 或 QJudge 內部服務。

### 7.2 操作旅程

主文件從一台乾淨 Ubuntu LTS 主機開始，依序帶讀者完成：

1. 判斷使用自有主機或 Cloud VM。
2. 確認主機能執行 Docker。
3. 理解 QJudge 需要保存哪些資料，以及為何要準備 R2。
4. 取得 QJudge 並建立環境設定。
5. 啟動服務並建立管理者帳號。
6. 先用 private HTTP 驗證登入、題目與評測。
7. 核心流程可用後，再決定是否設定 HTTPS、OAuth、AI 或 Remote MCP。

不使用虛構情節或宣傳語。敘事作用是讓讀者知道目前做到哪裡、為何要做，以及下一步是什麼。

### 7.3 名詞介紹

技術名詞第一次出現時，先用一至兩句說明它替部署者解決的問題，再使用正式名稱。例如先說明「保存題目圖片與監考證據的檔案空間」，再介紹 object storage、R2 與 bucket。

部署開始前只需要讓讀者理解：

- QJudge 主機提供網頁、API、評測與背景工作。
- Database 與 queue 由 Compose 管理。
- 大型檔案送往部署者準備的 R2。
- 對外公開時才需要網域與 HTTPS。

不在一開始列出所有 container、port、environment variable 或內部資料流。

### 7.4 指令原則

- 每個 code block 儘量只處理一件事。
- 只顯示使用者需要決定的參數；可由腳本產生的值不要求手動輸入。
- Secret 使用互動輸入，不直接放進 command history。
- Placeholder 使用 `YOUR_R2_ACCOUNT_ID`、`YOUR_QJUDGE_HOST` 等可辨識名稱。
- 每組指令後說明正常結果，以及失敗時應前往哪個章節。
- 一般流程不提供 `down -v`、刪除資料庫、重建 secrets 或其他高風險指令。
- 完整 flags、診斷資訊與例外情境放在 troubleshooting，不塞進主線。

## 8. 技術選擇的呈現時機

- 自有主機與 Cloud VM：開始前說明兩者共用 QJudge 安裝流程，差異只在主機、IP、防火牆、磁碟與供應商權限。
- R2 與 MinIO：需要準備檔案儲存時介紹。R2 是目前可執行路徑；MinIO 在完成相容性測試前只說明狀態。
- HTTP 與 HTTPS：先在可信任網路完成 HTTP 驗收；對 Internet 公開前再設定 HTTPS。
- Tunnel：只作為公開入口選項，不和 R2 綁在一起。
- OAuth：讀者選擇第三方登入時才說明 HTTPS callback 與 credential。
- AI provider：只要求現有供應商 API key；自訂 Base URL 與模型擴充不屬於部署文件。
- MCP：先區分 Compose 內部 MCP 與外部 Remote MCP；只有後者需要公開 HTTPS 與 OAuth。
- EC2：完成真實部署前只標示尚未驗證，不發布推測性步驟。

## 9. 驗證

文件變更完成後至少執行：

1. `/docs` 與公開文件的本機 Markdown link 檢查。
2. 公開文件 config、檔名與繁體中文 navigation key 檢查；其他語言缺檔應只產生預期的待翻譯報告。
3. Frontend 文件頁 build。
4. `setup-env.sh`、Compose 與部署文件契約測試。
5. 文件環境變數與 `.env.example`、Compose、settings 的交叉比對。
6. 搜尋已刪除的文件名稱、舊分支、舊 PR、Grafana、GlitchTip、Recur 與歷史 Cloudflare 資源。
7. `git diff --check`。

多語系檔案完整性檢查留到階段五。在只有繁體中文新增部署文件的過渡期，文件頁應使用既有的 zh-TW fallback；不得把尚未翻譯的內容偽裝成已完成翻譯。

## 10. 完成條件

- `/docs` 不再包含 plans、specs、archive 或歷史部署快照。
- `/docs/README.md` 能說明所有剩餘文件的用途。
- 公開文件提供一條可從乾淨 Ubuntu LTS 主機走到最小 QJudge 驗收的敘事式流程。
- R2、HTTPS、OAuth、AI、MCP、Cloud VM 與 self-hosted 的責任不互相混淆。
- 未驗證的 EC2、MinIO 或其他方案沒有被寫成可執行成功路徑。
- README 與公開文件導覽都指向 `frontend/public/docs`。
- 繁體中文部署文件通過內容、連結、build 與相關契約驗證。
- 其他公開文件與多語系工作有明確後續順序，不阻擋第一批部署文件發布。
