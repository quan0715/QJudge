# OJ 平台需求規劃 (Requirements Planning)

## 1. 專案概述

### 1.1 目標
建立一個穩定、高效、易用的 Online Judge (OJ) 平台，支援學生進行程式設計練習、作業提交和線上考試。平台需具備自動評測、防作弊機制和即時排名功能。

### 1.2 目標用戶
- **學生**：練習題目、參加考試、查看成績和排名。
- **教師/助教**：管理題目、舉辦考試、監控考試過程、查看統計數據。
- **管理員**：系統配置、用戶管理、維護系統穩定性。

---

## 2. 功能需求 (Functional Requirements)

### 2.1 使用者管理模組

#### 2.1.1 使用者註冊與登入
- **NYCU OAuth 單一登入**（主要認證方式）
  - 採用 OAuth 2.0 Authorization Code 流程
  - API 端點：`https://id.nycu.edu.tw/o/authorize/`
  - Token 端點：`https://id.nycu.edu.tw/o/token/`
  - 使用者資料端點：`https://id.nycu.edu.tw/api/profile/`
  - 支援的 Scopes：`profile`、`name`、`status`
  - 官方文件：https://id.nycu.edu.tw/docs/
- **Email/Password 登入**（備用認證方式）
  - 使用者註冊（含 Email 驗證）
  - 密碼強度驗證（8+ 字元、大小寫、數字、特殊字元）
  - 忘記密碼和重設功能
- 未來可擴充：第三方 OAuth（Google、GitHub）

#### 2.1.2 角色權限管理
- **學生角色**
  - 瀏覽公開題目
  - 提交程式碼
  - 參加公開或受邀的考試
  - 查看個人成績和提交歷史
- **教師角色**
  - 擁有學生所有權限
  - 創建/編輯/刪除題目
  - 創建/管理考試
  - 查看所有學生的提交和成績
  - 管理題庫和標籤
- **管理員角色**
  - 擁有所有權限
  - 管理使用者帳號（禁用/啟用）
  - 系統全域設定
  - 查看系統日誌

### 2.2 題目管理模組

#### 2.2.1 題目 CRUD
- **基本資訊**：標題、描述（支援 Markdown/LaTeX）、難度（易/中/難）、標籤、時間限制、記憶體限制。
- **多語系支援**：題目內容需支援繁體中文和英文切換。
- **測試資料管理**：
  - 支援上傳 `.in` / `.out` 檔案
  - 支援大檔案上傳（需考慮存儲方案）
  - **測資生成功能**：
    - 自動生成測試輸入（基於規則或腳本）
    - 自動生成標準輸出（基於標準解答程式）
    - 批量生成和下載
- **特殊評測 (Special Judge)**：支援自定義評測腳本（如浮點數誤差、多解情況）。

#### 2.2.2 題目列表與搜尋
- 篩選條件：難度、標籤、狀態（已解決/未解決）。
- 關鍵字搜尋：標題、ID。
- 分頁顯示。

### 2.3 評測系統 (Judge System)

#### 2.3.1 程式碼提交
- 支援語言：C++ (C++17, C++20), Python (3.10+), Java (OpenJDK 17)。
- 編輯器：整合 Monaco Editor，支援語法高亮、自動補全。

#### 2.3.2 自動評測
- **沙箱隔離**：使用 Docker 或 seccomp 進行安全隔離，防止惡意程式碼攻擊。
- **資源限制**：嚴格限制 CPU 時間和記憶體使用。
- **評測狀態**：Pending, Compiling, Running, Accepted (AC), Wrong Answer (WA), Time Limit Exceeded (TLE), Memory Limit Exceeded (MLE), Runtime Error (RE), Compile Error (CE)。
- **即時反饋**：透過 WebSocket 推送評測進度。

#### 2.3.3 自訂測資 (Custom Test)
- 學生可在練習模式下輸入自定義測試資料進行測試。
- 考試模式下可允許有限度的自訂測試（視考試設定而定）。

### 2.4 考試系統 (Contest System)

#### 2.4.1 考試管理
- **考試設定**：標題、說明、開始時間、結束時間、題目列表、計分方式（ACM/ICPC 或 IOI 賽制）。
- **權限控制**：公開考試、密碼保護、邀請制（指定使用者）。
- **防作弊機制**：
  - **螢幕監控**：記錄視窗切換、失去焦點事件。
  - **IP 限制**：限制特定 IP 範圍（如電腦教室）。
  - **程式碼查重**（未來擴充）：考後自動比對程式碼相似度。

#### 2.4.2 考試進行
- **倒數計時**：顯示剩餘時間。
- **題目導航**：快速切換題目。
- **公告系統**：考試期間發布更正或通知。
- **提問系統 (Clarification)**：學生可對題目提問，教師回覆（公開或私密）。

#### 2.4.3 即時排名 (Leaderboard)
- 根據賽制即時計算排名。
- 支援「封榜」功能（考試結束前 X 分鐘停止更新排名）。

---

## 3. 技術選型 (Technology Stack)

### 3.1 前端 (Frontend)
- **框架**：React 18+
- **語言**：TypeScript
- **UI 庫**：IBM Carbon Design System (符合專業、學術風格)
- **狀態管理**：Redux Toolkit 或 React Query
- **編輯器**：Monaco Editor
- **構建工具**：Vite

### 3.2 後端 (Backend)
- **框架**：Django (Python) + Django REST Framework (DRF)
- **非同步任務**：Celery + Redis (處理評測任務)
- **即時通訊**：Django Channels (WebSocket)

### 3.3 資料庫與存儲
- **關聯式資料庫**：PostgreSQL (儲存使用者、題目、提交記錄)
- **快取**：Redis (快取排名、Session、頻率限制)
- **物件儲存**：MinIO 或 AWS S3 (儲存測試資料、圖片)

### 3.4 評測機 (Judge Server)
- **核心**：基於 Linux Cgroups 和 Namespace 的隔離環境
- **語言支援**：GCC/G++, Python, OpenJDK
- **通訊**：透過 Redis Message Queue 與後端溝通

### 3.5 部署與運維
- **容器化**：Docker + Docker Compose
- **反向代理**：Nginx
- **CI/CD**：GitHub Actions
- **監控**：Prometheus + Grafana (監控系統負載、評測隊列)

---

## 4. 實施計畫 (Implementation Plan)

### Phase 1: MVP (Minimum Viable Product) - 預計 2 週
- [x] 需求分析與設計文檔
- [ ] 基礎架構搭建 (Django + React + Docker)
- [ ] 使用者註冊/登入 (NYCU OAuth + Email)
- [ ] 題目 CRUD (含測資上傳)
- [ ] 基礎評測功能 (C++ 支援)
- [ ] 簡單的提交列表與詳情

### Phase 2: 考試與進階功能 - 預計 1 週
- [ ] 考試管理系統 (創建、參加、排名)
- [ ] 測資生成功能
- [ ] 螢幕監控防作弊
- [ ] 練習模式自訂測資

### Phase 3: 優化與部署 - 預計 1 週
- [ ] UI/UX 優化 (Carbon Design System 深度整合)
- [ ] 系統壓力測試與效能優化
- [ ] 生產環境部署 (Cloudflare Tunnel)
- [ ] 完整文檔與交接

---

## 5. 附錄

### 5.1 參考連結
- NYCU OAuth: https://id.nycu.edu.tw/
- IBM Carbon Design System: https://carbondesignsystem.com/
