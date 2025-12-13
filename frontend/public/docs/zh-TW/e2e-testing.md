# E2E 測試指南

本文件說明如何設置和執行前端 E2E 測試。

## 概覽

本專案使用 Playwright 進行端對端（E2E）測試，搭配 Docker Compose 提供完整的測試環境，包括：

- 獨立的測試資料庫（PostgreSQL）
- 測試用 Redis
- Django 後端測試服務
- Celery Worker（用於處理提交）
- React 前端測試服務
- 預先注入的測試資料

## 架構

```
┌─────────────────────────────────────────────────────────┐
│                    Playwright 測試                       │
│              (Chrome + Safari 雙瀏覽器)                  │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│              Docker Compose 測試環境                     │
│              (docker-compose.test.yml)                  │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ frontend-test│  │ backend-test │  │ celery-test  │  │
│  │   :5174      │◄─┤   :8001      │◄─┤   Worker     │  │
│  └──────────────┘  └──────┬───────┘  └──────┬───────┘  │
│                           │                  │          │
│                   ┌───────▼────────┐ ┌──────▼───────┐  │
│                   │ postgres-test  │ │  redis-test  │  │
│                   │ (test_oj_e2e)  │ │   :6380      │  │
│                   └────────────────┘ └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 測試資料

測試環境會自動注入以下測試資料：

### 測試用戶

| 角色     | Email                | 密碼       | 用途         |
| -------- | -------------------- | ---------- | ------------ |
| Admin    | admin@example.com    | admin123   | 管理員測試   |
| Teacher  | teacher@example.com  | teacher123 | 教師功能測試 |
| Student  | student@example.com  | student123 | 學生功能測試 |
| Student2 | student2@example.com | student123 | 多用戶測試   |

### 測試題目

- **P001: A+B Problem** (簡單) - 計算兩個整數的和，包含 3 個測試案例
- **P002: Hello World** (簡單) - 輸出 "Hello, World!"，包含 1 個測試案例
- **P003: Factorial** (中等) - 計算階乘，包含 3 個測試案例

### 測試競賽

- **E2E Test Contest** (進行中) - 包含 A+B Problem 和 Hello World，可以加入並提交
- **Upcoming Contest** (即將開始) - 包含 Factorial，無法加入

## 快速開始

### 1. 安裝依賴

```bash
cd frontend
npm install
```

### 2. 安裝 Playwright 瀏覽器

```bash
# 安裝 Chrome 和 Safari
npx playwright install chromium webkit
```

### 3. 啟動測試環境

```bash
# 使用 Docker Compose 啟動測試環境
docker-compose -f docker-compose.test.yml up -d

# 等待服務就緒（約 30-60 秒）
# 可以使用以下命令檢查服務狀態
docker-compose -f docker-compose.test.yml ps
```

### 4. 執行測試

```bash
cd frontend

# 執行所有 E2E 測試（自動檢測環境是否已運行）
npm run test:e2e

# 只測試 Chrome
npx playwright test -c playwright.config.e2e.ts --project=chromium

# 只測試 Safari
npx playwright test -c playwright.config.e2e.ts --project=webkit

# 執行特定測試檔案
npx playwright test -c playwright.config.e2e.ts tests/e2e/auth.e2e.spec.ts

# 執行特定測試案例
npx playwright test -c playwright.config.e2e.ts --grep "should login"

# 使用 UI 模式（推薦偵錯時使用）
npm run test:e2e:ui

# 偵錯模式
npm run test:e2e:debug

# 查看測試報告
npx playwright show-report playwright-report-e2e
```

### 5. 停止測試環境

```bash
# 停止並清理測試環境
docker-compose -f docker-compose.test.yml down -v
```

## 測試環境特性

### 智慧環境檢測

測試框架會自動檢測環境狀態：
- 如果環境已運行，直接執行測試（快速）
- 如果環境未運行，自動啟動 Docker 環境

### 環境保留

預設情況下，測試完成後會保留 Docker 環境，以便：
- 快速重複執行測試
- 手動偵錯問題

如需清理環境：
```bash
# 測試後清理環境
E2E_CLEANUP=true npm run test:e2e

# 或手動停止
docker-compose -f docker-compose.test.yml down -v
```

## 測試結構

```
frontend/
├── tests/
│   ├── e2e/                      # E2E 測試檔案
│   │   ├── auth.e2e.spec.ts      # 認證測試（17 個測試案例）
│   │   ├── problems.e2e.spec.ts  # 題目列表測試
│   │   ├── submission.e2e.spec.ts# 提交測試
│   │   └── contest.e2e.spec.ts   # 競賽測試
│   └── helpers/                  # 測試輔助工具
│       ├── auth.helper.ts        # 認證相關輔助函數
│       ├── data.helper.ts        # 測試資料常數
│       ├── setup.ts              # 全域 setup（環境檢測）
│       └── teardown.ts           # 全域 teardown（環境保留）
├── playwright.config.e2e.ts      # Playwright E2E 配置
└── playwright-report-e2e/        # 測試報告輸出目錄
```

## 測試覆蓋範圍

### 認證測試 (auth.e2e.spec.ts) - 17 個測試

#### Registration（註冊）
- ✅ 註冊新用戶成功
- ✅ 密碼不匹配顯示錯誤
- ✅ Email 已存在顯示錯誤

#### Login（登入）
- ✅ Student 登入成功
- ✅ Teacher 登入成功
- ✅ Admin 登入成功
- ✅ 無效憑證顯示錯誤
- ✅ 錯誤密碼顯示錯誤
- ✅ 空欄位處理

#### Logout（登出）
- ✅ 登出成功並跳轉至登入頁

#### Session Management（Session 管理）
- ✅ 未授權訪問 Dashboard 重定向
- ✅ 刷新頁面保持登入狀態
- ✅ 登入後 Token 儲存至 localStorage
- ✅ 登出後清除 Token

#### Navigation（導航）
- ✅ 登入頁跳轉至註冊頁
- ✅ 註冊頁跳轉至登入頁
- ✅ 未登入訪問受保護路由重定向

### 題目列表測試 (problems.e2e.spec.ts)

- 顯示題目列表
- 題目資訊顯示（標題、難度、編號）
- 點擊題目進入詳情頁
- 導航功能

### 提交測試 (submission.e2e.spec.ts)

- 顯示題目詳情
- 題目描述與測試案例
- 代碼編輯器
- 提交代碼
- 查看提交結果

### 競賽測試 (contest.e2e.spec.ts)

- 顯示競賽列表
- 競賽詳情頁
- 加入競賽
- 競賽題目列表

## CI/CD 整合

### GitHub Actions 配置

測試會在以下情況自動觸發：
- Push 到 `main` / `develop` 分支
- 修改 `frontend/tests/e2e/**`、`frontend/src/services/**` 等相關檔案

### 測試報告 Artifacts

| Artifact 名稱 | 內容 | 保留時間 |
|--------------|------|---------|
| `playwright-report-e2e` | HTML 測試報告 | 30 天 |
| `playwright-test-results` | Screenshots, Videos, Traces | 14 天（僅失敗時）|

### 手動觸發測試

可在 GitHub Actions 頁面手動觸發，選擇測試類型：
- `api-only` - 只執行 API 整合測試
- `e2e-only` - 只執行 E2E 測試
- `all` - 執行所有測試

## 編寫新測試

在 `frontend/tests/e2e/` 建立新的測試檔案：

```typescript
import { test, expect } from "@playwright/test";
import { login, clearAuth } from "../helpers/auth.helper";
import { TEST_USERS } from "../helpers/data.helper";

test.describe("My Feature Tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await clearAuth(page);
  });

  test("should do something as student", async ({ page }) => {
    await login(page, "student");
    // 你的測試邏輯
  });
});
```

### 使用輔助函數

```typescript
import { login, logout, clearAuth, isAuthenticated } from "../helpers/auth.helper";
import { TEST_USERS, TEST_PROBLEMS, TEST_CONTESTS } from "../helpers/data.helper";

// 登入不同角色
await login(page, "student");
await login(page, "teacher");
await login(page, "admin");

// 登出
await logout(page);

// 使用測試資料
const user = TEST_USERS.student;  // { email, password, username, role }
const problem = TEST_PROBLEMS.aPlusB;  // { title, displayId, difficulty, slug }
```

## 偵錯測試

```bash
# UI 模式（推薦）- 可視化測試執行
npm run test:e2e:ui

# 偵錯模式 - 逐步執行
npm run test:e2e:debug

# 顯示瀏覽器視窗
npx playwright test -c playwright.config.e2e.ts --headed

# 查看失敗測試的 trace
npx playwright show-trace test-results/xxx/trace.zip
```

## 常見問題

### 測試環境啟動失敗

1. 確認 Docker 正在運行
2. 確認 Port 5174 和 8001 未被佔用
3. 查看服務日誌：
   ```bash
   docker-compose -f docker-compose.test.yml logs backend-test
   ```

### 測試資料不正確

重置測試環境：
```bash
docker-compose -f docker-compose.test.yml down -v
docker-compose -f docker-compose.test.yml up -d
```

### 登出測試失敗

確保使用正確的 selector，User Menu 按鈕的 aria-label 為「使用者選單」。

### API 請求失敗（400 錯誤）

確認 Docker 服務名稱使用連字符（`-`）而非底線（`_`），例如：`backend-test` 而非 `backend_test`。

## 最佳實踐

1. **資料隔離**：使用唯一的 timestamp 建立測試用戶，避免資料衝突
2. **等待策略**：使用 Playwright 的自動等待，避免 `waitForTimeout`
3. **選擇器優先級**：
   - 優先使用 `getByRole`、`getByText`
   - 其次使用 `data-testid`
   - 避免使用不穩定的 CSS class
4. **測試獨立性**：每個測試在 `beforeEach` 中清理狀態
5. **錯誤處理**：使用 `force: true` 處理元素被覆蓋的情況

## 參考資料

- [Playwright 官方文件](https://playwright.dev/)
- [Docker Compose 文件](https://docs.docker.com/compose/)
- [GitHub Actions 文件](https://docs.github.com/en/actions)
