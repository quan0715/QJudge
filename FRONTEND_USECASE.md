# 前端 UseCase 設計 (Frontend Use Case Design)

## 1. 訪客/未登入使用者

### UC-1.1 瀏覽首頁
**流程**：
1. 使用者進入首頁
2. 看到平台介紹、最新公告、熱門題目預覽
3. 導覽列顯示「登入」按鈕

**UI 元件**：
- Hero Banner (Carbon Grid, Typography)
- 公告卡片 (Carbon Tile)
- 登入按鈕 (Carbon Button)

### UC-1.2 Email/Password 註冊與登入
**流程（註冊）**：
1. 使用者訪問註冊頁面
2. 填寫註冊表單：Username, Email, Password, Confirm Password
3. 系統驗證：Email 格式, Username 唯一性, 密碼強度
4. 提交註冊 -> 系統發送驗證信
5. 使用者點擊驗證連結 -> 帳號啟用

**流程（登入）**：
1. 使用者訪問登入頁面
2. 選擇「Email 登入」
3. 輸入 Email/Password -> 登入成功 -> 導向首頁

**UI 元件**：
- Carbon TextInput, PasswordInput
- ProgressBar (密碼強度)
- Carbon Button, Tabs

### UC-1.3 NYCU OAuth 登入
**流程**：
1. 點擊「NYCU 登入」按鈕
2. 重導向至 NYCU OAuth 授權頁面
3. 使用者同意授權
4. 重導向回平台 Callback 頁面
5. 系統交換 Token 並建立/更新使用者資料
6. 登入成功，導向首頁

---

## 2. 學生角色

### UC-2.1 瀏覽題目列表
**流程**：
1. 點擊「題目庫」
2. 看到題目列表（分頁顯示）
3. 使用篩選器（難度、標籤、狀態）
4. 使用搜尋框搜尋題目

**UI 元件**：
- Carbon DataTable (支援排序、篩選)
- Carbon Pagination
- Carbon Search
- Carbon Tag (顯示難度、標籤)

### UC-2.2 查看題目詳情
**流程**：
1. 點擊特定題目
2. 顯示題目標題、描述、範例輸入/輸出、限制條件
3. 顯示「提交程式碼」區塊或按鈕

**UI 元件**：
- Markdown Renderer
- Carbon Tabs (題目描述 / 提交記錄 / 討論)
- Code Snippet (範例測資)

### UC-2.3 提交程式碼 (練習模式)
**流程**：
1. 在題目詳情頁選擇程式語言
2. 在編輯器中編寫或貼上程式碼
3. (可選) 輸入自訂測資並點擊「測試執行」
4. 點擊「提交」
5. 顯示評測狀態 (Pending -> Running -> Result)
6. 顯示最終結果 (AC/WA/TLE...) 和詳細資訊

**UI 元件**：
- Monaco Editor
- Carbon Dropdown (語言選擇)
- Carbon Button (提交, 測試)
- Carbon Loading (評測中)
- Carbon InlineNotification (結果提示)

### UC-2.4 參加考試
**流程**：
1. 進入「考試列表」頁面
2. 點擊「參加」特定考試（可能需要密碼）
3. 進入考試大廳，看到倒數計時和題目列表
4. 點擊題目開始作答
5. 系統背景啟動螢幕監控（記錄切換視窗）

**UI 元件**：
- Carbon Modal (輸入考試密碼)
- Countdown Timer
- Exam Layout (左側題目導航，右側題目內容)

### UC-2.5 查看成績與排名
**流程**：
1. 點擊「排名」
2. 查看即時排名表（包含自己和其他人）
3. 點擊自己的提交查看詳情

**UI 元件**：
- Carbon DataTable (排名表)
- Score Visualization (長條圖或進度條)

---

## 3. 教師角色

### UC-3.1 創建/編輯題目
**流程**：
1. 進入「題目管理」
2. 點擊「新增題目」
3. 填寫基本資訊（標題、描述、限制）
4. 上傳或生成測試資料
5. 設定 Special Judge (可選)
6. 儲存題目

**UI 元件**：
- Form Wizard (分步驟創建)
- File Uploader (測資上傳)
- Markdown Editor

### UC-3.2 測資生成
**流程**：
1. 在題目編輯頁面選擇「測資生成」
2. 編寫輸入生成腳本 (Python)
3. 提供標準解答程式 (C++/Python)
4. 設定生成數量和參數
5. 點擊「生成」
6. 系統自動產生 .in 和 .out 檔案並加入測資列表

**UI 元件**：
- Code Editor (腳本編寫)
- Carbon NumberInput (數量設定)
- Test Case Preview List

### UC-3.3 創建/管理考試
**流程**：
1. 進入「考試管理」
2. 設定考試資訊（時間、權限、防作弊設定）
3. 從題庫選擇題目加入考試
4. 設定題目分數和順序
5. 發布考試

**UI 元件**：
- DatePicker / TimePicker
- Transfer List (選擇題目)
- Toggle (防作弊開關)

### UC-3.4 監控考試
**流程**：
1. 在考試進行中進入「監控面板」
2. 查看即時提交概況
3. 查看異常事件（如頻繁切換視窗的學生）
4. 發布考試公告

**UI 元件**：
- Dashboard Widgets (提交數、AC率)
- Alert List (異常事件)
- Broadcast Form

---

## 4. 管理員角色

### UC-4.1 用戶管理
**流程**：
1. 瀏覽用戶列表
2. 編輯用戶角色（如將學生升級為助教）
3. 停用/啟用帳號

### UC-4.2 系統設定
**流程**：
1. 設定公告
2. 查看系統資源使用量
3. 設定全域參數（如評測機隊列上限）

---

## 5. 頁面路由規劃 (Routes)

| 路徑 | 說明 | 權限 |
|------|------|------|
| `/` | 首頁 | 公開 |
| `/login` | 登入頁 | 未登入 |
| `/register` | 註冊頁 | 未登入 |
| `/problems` | 題目列表 | 公開 |
| `/problems/:id` | 題目詳情 | 公開 |
| `/contests` | 考試列表 | 公開 |
| `/contests/:id` | 考試大廳 | 登入 |
| `/contests/:id/problem/:pid` | 考試作答 | 參賽者 |
| `/status` | 提交狀態列表 | 公開 |
| `/status/:id` | 提交詳情 | 本人/教師/管理員 |
| `/ranking` | 全站排名 | 公開 |
| `/admin` | 管理後台 | 管理員 |
| `/teacher` | 教師後台 | 教師/管理員 |
