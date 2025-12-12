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
│                   (localhost:5174)                      │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│              Docker Compose 測試環境                     │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Frontend   │  │   Backend    │  │   Celery     │  │
│  │   :5174      │◄─┤   :8001      │◄─┤   Worker     │  │
│  └──────────────┘  └──────┬───────┘  └──────┬───────┘  │
│                           │                  │          │
│                   ┌───────▼────────┐ ┌──────▼───────┐  │
│                   │   PostgreSQL   │ │    Redis     │  │
│                   │   (test_oj_e2e)│ │   :6380      │  │
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
npx playwright install
```

### 3. 啟動測試環境

使用管理腳本啟動完整的 E2E 測試環境：

```bash
# 方法 1: 使用管理腳本（推薦）
./frontend/scripts/e2e-env.sh start

# 方法 2: 直接使用 Docker Compose
docker-compose -f docker-compose.test.yml up -d
```

等待服務啟動（約 1-2 分鐘），腳本會自動等待服務就緒。

### 4. 執行測試

```bash
cd frontend

# 執行所有 E2E 測試
npm run test:e2e

# 使用 UI 模式執行
npm run test:e2e:ui

# 偵錯模式
npm run test:e2e:debug

# 在有視窗的瀏覽器中執行
npm run test:e2e:headed

# 查看測試報告
npm run test:e2e:report
```

### 5. 停止測試環境

```bash
# 使用管理腳本
./frontend/scripts/e2e-env.sh stop

# 或使用 Docker Compose
docker-compose -f docker-compose.test.yml down -v
```

## 管理腳本使用

`frontend/scripts/e2e-env.sh` 提供以下命令：

```bash
# 啟動環境
./frontend/scripts/e2e-env.sh start

# 停止環境
./frontend/scripts/e2e-env.sh stop

# 重置環境（重新建立測試資料）
./frontend/scripts/e2e-env.sh reset

# 查看服務狀態
./frontend/scripts/e2e-env.sh status

# 查看日誌
./frontend/scripts/e2e-env.sh logs                # 所有服務
./frontend/scripts/e2e-env.sh logs backend_test   # 特定服務

# 在容器中執行命令
./frontend/scripts/e2e-env.sh exec backend_test python manage.py shell

# 顯示幫助
./frontend/scripts/e2e-env.sh help
```

## 測試結構

```
frontend/
├── tests/
│   ├── e2e/                      # E2E 測試檔案
│   │   ├── auth.e2e.spec.ts      # 認證測試
│   │   ├── problems.e2e.spec.ts  # 題目列表測試
│   │   ├── submission.e2e.spec.ts# 提交測試
│   │   └── contest.e2e.spec.ts   # 競賽測試
│   └── helpers/                  # 測試輔助工具
│       ├── auth.helper.ts        # 認證相關輔助函數
│       ├── data.helper.ts        # 測試資料常數
│       ├── setup.ts              # 全域 setup
│       └── teardown.ts           # 全域 teardown
├── playwright.config.e2e.ts      # Playwright E2E 配置
└── scripts/
    └── e2e-env.sh                # 環境管理腳本
```

## 測試覆蓋範圍

### 認證測試 (auth.e2e.spec.ts)

- 用戶註冊
- 用戶登入（Student, Teacher, Admin）
- 用戶登出
- 無效憑證錯誤處理
- 未授權訪問保護
- Session 持久化

### 題目列表測試 (problems.e2e.spec.ts)

- 顯示題目列表
- 題目資訊顯示（標題、難度、編號）
- 點擊題目進入詳情頁
- 分頁功能
- 導航功能

### 提交測試 (submission.e2e.spec.ts)

- 顯示題目詳情
- 題目描述與測試案例
- 代碼編輯器
- 提交代碼
- 查看提交結果
- 提交歷史
- 提交篩選

### 競賽測試 (contest.e2e.spec.ts)

- 顯示競賽列表
- 競賽狀態顯示
- 競賽詳情頁
- 加入競賽
- 競賽題目列表
- 競賽中解題
- 競賽排行榜
- 時間限制檢查

## 編寫新測試

在 `frontend/tests/e2e/` 建立新的測試檔案：

```typescript
import { test, expect } from "@playwright/test";
import { login } from "../helpers/auth.helper";

test.describe("My Feature Tests", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "student");
  });

  test("should do something", async ({ page }) => {
    // 你的測試邏輯
  });
});
```

使用輔助函數：

```typescript
import { login, logout } from "../helpers/auth.helper";
import { TEST_USERS, TEST_PROBLEMS } from "../helpers/data.helper";

// 登入
await login(page, "student");

// 使用測試資料
const user = TEST_USERS.student;
const problem = TEST_PROBLEMS.aPlusB;
```

## 偵錯測試

```bash
# UI 模式（推薦）
npm run test:e2e:ui

# 偵錯模式
npm run test:e2e:debug

# 執行特定測試
npx playwright test -c playwright.config.e2e.ts tests/e2e/auth.e2e.spec.ts

# 執行特定測試案例
npx playwright test -c playwright.config.e2e.ts -g "should login as student"
```

## 常見問題

### 測試環境啟動失敗

檢查以下幾點：

1. Docker 是否正在運行
2. Port 5174 和 8001 是否被佔用
3. 查看服務日誌：`./frontend/scripts/e2e-env.sh logs`

### 測試資料不正確

重置測試環境：

```bash
./frontend/scripts/e2e-env.sh reset
```

### 測試執行很慢

1. 確保 Docker 資源配置足夠
2. 使用 `--workers=1` 避免並行測試
3. 考慮使用 API 登入取代 UI 登入（更快）

### 如何在 CI/CD 中執行測試

```bash
# 設置 CI 環境變數
export CI=true

# 啟動環境
./frontend/scripts/e2e-env.sh start

# 執行測試
cd frontend && npm run test:e2e

# 清理
cd .. && ./frontend/scripts/e2e-env.sh stop
```

## 最佳實踐

1. **資料隔離**：每次測試執行前重置環境，確保測試獨立性
2. **等待策略**：使用 Playwright 的自動等待，避免 `waitForTimeout`
3. **選擇器優先級**：
   - 優先使用 `data-testid`
   - 其次使用語義化選擇器（role, text）
   - 避免使用 CSS class（易變）
4. **測試獨立性**：每個測試應該獨立運行，不依賴其他測試
5. **清理狀態**：在 `beforeEach` 中清理認證狀態

## 效能優化

1. **使用 API 登入**：對於不測試登入流程的測試，使用 `loginViaAPI()` 更快
2. **減少等待時間**：善用 Playwright 的自動等待機制
3. **並行執行**：小心使用，確保測試資料不衝突
4. **快照測試**：對於穩定的 UI，考慮使用視覺快照測試

## 維護

### 更新測試資料

修改 `backend/apps/core/management/commands/seed_e2e_data.py` 來更新測試資料結構。

### 更新測試配置

修改 `frontend/playwright.config.e2e.ts` 來調整測試行為（超時、重試次數等）。

### 更新環境配置

修改 `docker-compose.test.yml` 來調整服務配置（port、環境變數等）。

## 參考資料

- [Playwright 官方文件](https://playwright.dev/)
- [Docker Compose 文件](https://docs.docker.com/compose/)
- [Django 測試最佳實踐](https://docs.djangoproject.com/en/stable/topics/testing/)
