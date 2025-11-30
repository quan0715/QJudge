# Contest-to-Practice MVP - Quick Start Guide

## 📋 概述

本實作完成了 Contest-to-Practice 題目流程的 MVP，包含：
- 移除「從練習題複製」功能
- 新增「手動結束競賽」功能
- 新增「賽後公開題目到練習題庫」功能
- 練習題庫只顯示已公開的題目

---

## 🚀 執行 Migrations (必須)

**重要**: 所有指令都必須在 Docker 容器內執行！

### 1. 啟動開發環境

```bash
# 在專案根目錄
docker compose -f docker-compose.dev.yml up -d
```

### 2. 執行 Django Migrations

```bash
# 進入 backend 容器
docker compose -f docker-compose.dev.yml exec backend bash

# 在容器內執行以下指令
python manage.py makemigrations
python manage.py migrate

# 確認 migrations 成功
python manage.py showmigrations
```

### 3. 檢查資料庫（可選）

```bash
# 進入 Postgres 容器
docker exec -it oj_postgres_dev bash

# 連接資料庫
psql -U postgres -d online_judge_dev

# 檢查新欄位
\d problems;
\d contests;

# 離開
\q
exit
```

---

## 📝 新增的資料庫欄位

### Problem 表

| 欄位名稱 | 類型 | 說明 |
|---------|------|------|
| `is_practice_visible` | Boolean | 是否在練習題庫中顯示 (預設 False) |
| `created_in_contest_id` | BigInt (FK) | 記錄題目來源競賽 (可為 NULL) |

### Contest 表

| 欄位名稱 | 類型 | 說明 |
|---------|------|------|
| `is_ended` | Boolean | 主辦者是否已手動結束比賽 (預設 False) |

---

## 🔧 新增的 API 端點

### 1. 結束競賽

```http
POST /api/v1/contests/{contest_id}/end_contest/
```

**權限**: Contest creator 或 admin  
**回應**: 更新後的 Contest 資料

### 2. 公開題目到練習題庫

```http
POST /api/v1/contests/{contest_id}/problems/{problem_id}/publish/
```

**權限**: Contest creator 或 admin，且 `contest.is_ended == True`  
**行為**: 設定 `problem.is_practice_visible = True`

### 3. 建立比賽題目 (已修改)

```http
POST /api/v1/contests/{contest_id}/add_problem/
Content-Type: application/json

{
  "title": "Problem Title"
}
```

**變更**: 不再接受 `source_problem_id` 參數，只能建立全新題目

---

## 🎨 新增的前端元件

### 1. EndContestButton

**位置**: `frontend/src/components/EndContestButton.tsx`

**使用範例**:
```tsx
import { EndContestButton } from '../components/EndContestButton';

<EndContestButton 
  contest={contest} 
  onContestEnded={() => {
    // 刷新 contest 資料
    fetchContest();
  }} 
/>
```

### 2. ContestProblemManagementPage

**位置**: `frontend/src/pages/ContestProblemManagementPage.tsx`

**路由**: 需要在 router 中加入 `/contests/:id/manage-problems`

**功能**:
- 顯示比賽所有題目
- 若比賽未結束，顯示警告並停用按鈕
- 若比賽已結束，允許逐題公開到練習題庫

---

## ✅ 測試檢查清單

### Backend 測試

- [ ] Migrations 成功執行
- [ ] `/contests/{id}/end_contest/` 能正確結束比賽
- [ ] `/contests/{id}/problems/{problem_id}/publish/` 能公開題目
- [ ] `/problems/` 只回傳 `is_practice_visible=True` 的題目
- [ ] 權限檢查：非 creator/admin 無法執行上述操作
- [ ] `/contests/{id}/add_problem/` 拒絕 `source_problem_id` 參數

### Frontend 測試

- [ ] 建立比賽時不會出現「從練習題複製」選項
- [ ] 「結束競賽」按鈕正常運作
- [ ] 題目管理頁面正確顯示
- [ ] 題目管理頁面在比賽未結束時停用按鈕
- [ ] 公開題目後按鈕變為「已加入」
- [ ] 練習題列表只顯示已公開的題目

---

## 🛠️ 故障排除

### Migration 失敗

```bash
# 檢查當前 migration 狀態
python manage.py showmigrations

# 如果有衝突，嘗試手動建立 migration
python manage.py makemigrations --merge
```

### 權限錯誤

確保使用者是：
- Contest creator (建立該比賽的人)
- 或是 `is_staff=True`
- 或是 `role='admin'`

### API 404 錯誤

檢查前端呼叫的 API 路徑是否正確：
- 結束競賽: `/contests/{id}/end_contest/`
- 公開題目: `/contests/{id}/problems/{problem_id}/publish/`

---

## 📚 相關文檔

- [完整實作計劃](file:///Users/quan/.gemini/antigravity/brain/3aea6cb0-7fd2-416c-b663-afdc5ec5f6bc/implementation_plan.md)
- [Walkthrough 文檔](file:///Users/quan/.gemini/antigravity/brain/3aea6cb0-7fd2-416c-b663-afdc5ec5f6bc/walkthrough.md)
- [資料庫設計](file:///Users/quan/online_judge/DATABASE_DESIGN.md)

---

## ⚠️ 重要提醒

1. **所有 Django 指令都必須在 backend 容器內執行**
2. **比賽題目無法從練習題複製**（這是本次 MVP 的重要變更）
3. **只有主辦者手動按「結束競賽」後才能公開題目**
4. **舊有的 `is_contest_only`, `source_problem`, `contest` 欄位已 deprecated**

---

**實作完成**: 2025-11-30  
**下一步**: 執行 migrations 並測試新功能
