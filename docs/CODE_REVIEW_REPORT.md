# QJudge 專案 Code Review 報告

> **審查日期**: 2025-12-10  
> **審查範圍**: 完整專案（後端、前端、配置、測試）  
> **審查者**: AI Code Reviewer

---

## 執行摘要

本次 Code Review 對 QJudge 專案進行了全面的審查，涵蓋程式碼品質、安全性、效能、可維護性等多個面向。

**總體評價**: ⭐⭐⭐⭐ (4/5)

**優點**:
- ✅ 完整的功能實作（認證、題目、競賽、評測）
- ✅ 良好的專案結構（前後端分離、模組化設計）
- ✅ 完善的測試覆蓋（後端 pytest、前端 Playwright）
- ✅ Docker 容器化部署
- ✅ 安全的評測系統（Docker 沙箱、Seccomp）
- ✅ 詳細的中文文件

**需改進**:
- ⚠️ 部分安全性問題需處理
- ⚠️ 效能優化空間
- ⚠️ 前端錯誤處理不夠完善
- ⚠️ 部分程式碼重複
- ⚠️ 缺少部分文件

---

## 目錄

1. [架構與設計](#1-架構與設計)
2. [安全性分析](#2-安全性分析)
3. [程式碼品質](#3-程式碼品質)
4. [效能與可擴展性](#4-效能與可擴展性)
5. [測試覆蓋率](#5-測試覆蓋率)
6. [文件完整性](#6-文件完整性)
7. [冗餘程式碼識別](#7-冗餘程式碼識別)
8. [改進建議](#8-改進建議)

---

## 1. 架構與設計

### 1.1 整體架構 ⭐⭐⭐⭐⭐

**優點**:
- ✅ **前後端分離**: React (前端) + Django (後端)
- ✅ **微服務導向**: 使用 Celery 異步處理評測任務
- ✅ **容器化**: Docker Compose 編排所有服務
- ✅ **資料庫架構**: 支援 Local/Cloud 雙資料庫動態切換
- ✅ **RESTful API**: 標準化的 API 設計
- ✅ **OpenAPI 規範**: 使用 drf-spectacular 自動生成 API 文件

**建議**:
- 考慮引入 API Gateway（如 Kong、Traefik）統一管理 API
- 未來可考慮將評測系統拆分為獨立微服務

### 1.2 後端架構 ⭐⭐⭐⭐⭐

**Django 應用模組化**:

```
apps/
├── core/         ✅ 核心功能（資料庫路由、中介層）
├── users/        ✅ 使用者管理
├── problems/     ✅ 題目管理
├── submissions/  ✅ 提交評測
├── contests/     ✅ 競賽系統
├── notifications/✅ 通知系統
├── announcements/✅ 公告管理
└── judge/        ✅ 評測引擎
```

**優點**:
- ✅ 職責清晰，模組解耦
- ✅ 使用 Django REST Framework
- ✅ JWT 認證
- ✅ 資料庫 Router 實現動態切換

**問題**:
- ⚠️ `apps/core` 有些功能可以進一步拆分
- ⚠️ 缺少統一的錯誤處理中介層

### 1.3 前端架構 ⭐⭐⭐⭐

**領域驅動設計 (DDD)**:

```
src/domains/
├── auth/       ✅ 認證領域
├── problem/    ✅ 題目領域
├── submission/ ✅ 提交領域
├── contest/    ✅ 競賽領域
└── admin/      ✅ 管理領域
```

**優點**:
- ✅ 清晰的領域劃分
- ✅ 使用 Carbon Design System（統一 UI）
- ✅ TanStack Query 管理伺服器狀態
- ✅ Monaco Editor 整合

**問題**:
- ⚠️ 部分元件過大（如 `ContestLayout.tsx` 超過 600 行）
- ⚠️ 錯誤處理不夠統一
- ⚠️ 缺少全域錯誤邊界（Error Boundary）

---

## 2. 安全性分析

### 2.1 認證與授權 ⭐⭐⭐⭐

**優點**:
- ✅ JWT Token 認證
- ✅ RBAC 角色管理（Admin/Teacher/Student）
- ✅ 密碼強度驗證（8 字元以上）
- ✅ bcrypt 密碼加密
- ✅ Token 刷新機制

**問題**:
- ⚠️ **缺少 Token 黑名單**: 當使用者登出時，Token 仍然有效（CRITICAL）
- ⚠️ **缺少速率限制**: API 端點沒有速率限制，容易被暴力破解（HIGH）
- ⚠️ **Session 超時**: 沒有強制 session 超時機制（MEDIUM）

**建議**:
```python
# 1. 實作 Token 黑名單
# apps/users/models.py
class BlacklistedToken(models.Model):
    token = models.CharField(max_length=500, unique=True)
    blacklisted_at = models.DateTimeField(auto_now_add=True)

# 2. 新增速率限制
# pip install django-ratelimit
from django_ratelimit.decorators import ratelimit

@ratelimit(key='ip', rate='5/m', method='POST')
def login_view(request):
    ...
```

### 2.2 程式碼執行安全 ⭐⭐⭐⭐⭐

**優點**:
- ✅ Docker 容器隔離
- ✅ 網路禁用 (`network_disabled=True`)
- ✅ CPU/Memory 限制
- ✅ PID 限制（防 Fork Bomb）
- ✅ Seccomp profile 系統呼叫過濾
- ✅ Capabilities 移除
- ✅ Tmpfs（可執行）

**測試驗證**:
- ✅ Fork bomb 防護測試通過
- ✅ 檔案寫入限制測試通過
- ✅ 網路隔離測試通過
- ✅ 時間/記憶體限制測試通過

**建議**:
- 考慮加入更嚴格的 Seccomp profile（白名單模式）
- 定期更新 Judge Docker Image（安全性補丁）

### 2.3 Web 安全 ⭐⭐⭐⭐

**優點**:
- ✅ HTTPS（生產環境）
- ✅ CORS 配置
- ✅ CSRF 保護
- ✅ XSS 防護（Django 預設）
- ✅ SQL 注入防護（ORM）
- ✅ Security Headers（生產環境）

**問題**:
- ⚠️ **開發環境 CORS 允許所有來源**: `CORS_ALLOW_ALL_ORIGINS = True` (LOW)
- ⚠️ **缺少 Content Security Policy (CSP)**: 可加強 XSS 防護（MEDIUM）
- ⚠️ **Cloudflare Tunnel Token 明碼**: 建議使用 Secret 管理（HIGH）

**建議**:
```python
# config/settings/prod.py
# 1. 新增 CSP
MIDDLEWARE += ['csp.middleware.CSPMiddleware']
CSP_DEFAULT_SRC = ("'self'",)
CSP_SCRIPT_SRC = ("'self'", "'unsafe-inline'")  # Monaco Editor 需要

# 2. 使用 django-environ 管理敏感資訊
import environ
env = environ.Env()
TUNNEL_TOKEN = env('TUNNEL_TOKEN')  # 從環境變數讀取
```

### 2.4 資料安全 ⭐⭐⭐⭐

**優點**:
- ✅ 敏感資料加密（密碼）
- ✅ 資料庫連線使用 SSL（Cloud DB）
- ✅ 定期備份（Celery Beat 每 6 小時）

**問題**:
- ⚠️ **程式碼明文儲存**: 使用者提交的程式碼沒有加密（LOW）
- ⚠️ **備份未加密**: 資料庫備份檔案未加密（MEDIUM）

**建議**:
```python
# 1. 程式碼加密（可選）
from cryptography.fernet import Fernet

class Submission(models.Model):
    encrypted_code = models.BinaryField()
    
    def set_code(self, code):
        cipher = Fernet(settings.CODE_ENCRYPTION_KEY)
        self.encrypted_code = cipher.encrypt(code.encode())
    
    def get_code(self):
        cipher = Fernet(settings.CODE_ENCRYPTION_KEY)
        return cipher.decrypt(self.encrypted_code).decode()

# 2. 備份加密
gpg --symmetric --cipher-algo AES256 backup.sql
```

### 2.5 考試模式安全 ⭐⭐⭐⭐

**優點**:
- ✅ 前端監控（視窗失焦、Tab 切換、全螢幕退出）
- ✅ 後端記錄（ExamEvent 表）
- ✅ 自動鎖定機制
- ✅ 違規計數

**問題**:
- ⚠️ **前端監控可繞過**: 使用者可透過瀏覽器開發工具停用監控（CRITICAL）
- ⚠️ **缺少後端驗證**: 沒有後端定時心跳檢查（HIGH）

**建議**:
```typescript
// frontend: 定期發送心跳
setInterval(() => {
  fetch('/api/v1/contests/{id}/heartbeat/', {
    method: 'POST',
    body: JSON.stringify({
      is_focused: document.hasFocus(),
      is_fullscreen: document.fullscreenElement !== null,
    })
  });
}, 30000);  // 每 30 秒

// backend: 檢查心跳超時
# apps/contests/tasks.py
@shared_task
def check_exam_heartbeat():
    """檢查考試心跳，超過 1 分鐘未心跳則標記異常"""
    timeout = timezone.now() - timedelta(minutes=1)
    stale_participants = ContestParticipant.objects.filter(
        exam_status='in_progress',
        last_heartbeat__lt=timeout
    )
    for p in stale_participants:
        ExamEvent.objects.create(
            contest=p.contest,
            user=p.user,
            event_type='heartbeat_timeout'
        )
```

---

## 3. 程式碼品質

### 3.1 後端程式碼 ⭐⭐⭐⭐

**優點**:
- ✅ 遵循 PEP 8 規範
- ✅ 清晰的註解與 Docstring
- ✅ 合理的函數拆分
- ✅ 使用 Type Hints（部分）

**問題**:

#### 3.1.1 程式碼重複

**檔案**: `backend/apps/submissions/tasks.py`

```python
# 重複的錯誤處理邏輯
except Submission.DoesNotExist:
    return f"Submission {submission_id} not found"
except Exception as e:
    if 'submission' in locals():
        submission.status = 'SE'
        submission.error_message = str(e)
        submission.save()
    return f"Error judging submission {submission_id}: {str(e)}"
```

**建議**: 提取為共用函數

```python
def handle_submission_error(submission_id, error):
    """統一的提交錯誤處理"""
    try:
        submission = Submission.objects.get(id=submission_id)
        submission.status = 'SE'
        submission.error_message = str(error)
        submission.save()
    except Submission.DoesNotExist:
        logger.error(f"Submission {submission_id} not found")
    return f"Error judging submission {submission_id}: {str(error)}"
```

#### 3.1.2 Magic Numbers

**檔案**: `backend/apps/judge/docker_runner.py`

```python
memory_usage_kb = 4096  # 預設 4MB - Magic Number!
```

**建議**: 使用常數

```python
DEFAULT_MEMORY_USAGE_KB = 4096  # 4MB
memory_usage_kb = DEFAULT_MEMORY_USAGE_KB
```

#### 3.1.3 過長的函數

**檔案**: `backend/apps/contests/views.py`

部分 ViewSet 方法超過 100 行，建議拆分為 Service 層。

**建議**:
```python
# apps/contests/services.py
class ContestService:
    @staticmethod
    def register_participant(contest, user, password, nickname):
        """註冊參賽者"""
        ...
    
    @staticmethod
    def calculate_scoreboard(contest):
        """計算排行榜"""
        ...

# apps/contests/views.py
class ContestViewSet(viewsets.ModelViewSet):
    @action(detail=True, methods=['post'])
    def register(self, request, pk=None):
        contest = self.get_object()
        result = ContestService.register_participant(
            contest, request.user, 
            request.data.get('password'),
            request.data.get('nickname')
        )
        return Response(result)
```

### 3.2 前端程式碼 ⭐⭐⭐⭐

**優點**:
- ✅ TypeScript 型別安全
- ✅ 元件化設計
- ✅ 使用 Custom Hooks
- ✅ 狀態管理清晰（Context + TanStack Query）

**問題**:

#### 3.2.1 元件過大

**檔案**: `frontend/src/domains/contest/components/layout/ContestLayout.tsx` (600+ 行)

**建議**: 拆分為更小的元件

```typescript
// ContestLayout.tsx (主元件)
// ContestHeader.tsx (Header 邏輯)
// ContestExamControls.tsx (考試控制)
// ContestModals.tsx (各種 Modal)
```

#### 3.2.2 錯誤處理不足

**檔案**: 多處 API 呼叫

```typescript
// ❌ 不好的做法
const fetchData = async () => {
  const response = await fetch('/api/v1/problems/');
  const data = await response.json();
  setData(data);
};

// ✅ 改進
const fetchData = async () => {
  try {
    const response = await fetch('/api/v1/problems/');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    setData(data);
  } catch (error) {
    console.error('Failed to fetch problems:', error);
    toast.error('無法載入題目列表，請重試');
  }
};
```

#### 3.2.3 Hard-coded 字串

**檔案**: 多處元件

```typescript
// ❌ 不好
<button>提交</button>
<p>請輸入競賽密碼</p>

// ✅ 改進：使用 i18n
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();
<button>{t('common.submit')}</button>
<p>{t('contest.enter_password')}</p>
```

#### 3.2.4 缺少 Error Boundary

**建議**: 新增全域錯誤邊界

```typescript
// components/ErrorBoundary.tsx
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    // 可以發送到錯誤追蹤服務 (Sentry)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div>
          <h1>Oops! 發生錯誤</h1>
          <p>{this.state.error?.message}</p>
          <button onClick={() => window.location.reload()}>
            重新載入
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// App.tsx
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

### 3.3 程式碼註解與文件 ⭐⭐⭐⭐

**優點**:
- ✅ 後端有清晰的 Docstring
- ✅ 複雜邏輯有註解說明
- ✅ API 有 OpenAPI 規範

**問題**:
- ⚠️ 前端註解較少
- ⚠️ 部分 TODO 註解未處理

**TODO 清單**:

1. **backend/apps/core/management/commands/seed_e2e_data.py:301**
   ```python
   // TODO: Calculate factorial
   ```

2. **backend/apps/users/services.py:96**
   ```python
   # TODO: Implement actual email sending
   ```

3. **backend/apps/submissions/management/commands/archive_old_submissions.py:129**
   ```python
   # TODO: 如果要實作真正的歸檔，需要：
   ```

4. **frontend/src/domains/contest/components/ContestSidebar.tsx:45, 206**
   ```typescript
   // TODO: Implement actual status check from backend
   // TODO: Get actual status from backend
   ```

**建議**: 建立 Issue 追蹤這些 TODO，或標記為 WONTFIX。

---

## 4. 效能與可擴展性

### 4.1 資料庫效能 ⭐⭐⭐⭐

**優點**:
- ✅ 合理的索引策略
- ✅ 使用 `select_related` 和 `prefetch_related`
- ✅ 統計欄位反正規化（避免即時計算）
- ✅ 連線池設定

**問題**:

#### 4.1.1 N+1 查詢問題

**檔案**: `backend/apps/submissions/views.py`

```python
# ❌ 可能產生 N+1
submissions = Submission.objects.all()
for sub in submissions:
    print(sub.user.username)  # N 次查詢
    print(sub.problem.title)  # N 次查詢

# ✅ 使用 select_related
submissions = Submission.objects.select_related('user', 'problem').all()
```

**已實作部分**: 檢查後發現 SubmissionSerializer 有使用 `select_related`，但需確保所有查詢都有優化。

#### 4.1.2 缺少資料庫連線池監控

**建議**:
```python
# config/settings/prod.py
DATABASES['default']['CONN_HEALTH_CHECKS'] = True  # Django 4.1+

# 監控連線池
from django.db import connection
print(connection.queries_log)  # DEBUG=True 時可用
```

#### 4.1.3 Submission 表可能成為瓶頸

**問題**: 隨著提交量增加，`submissions` 表會變得非常大。

**建議**:
1. **分區表** (Partitioning): 按時間分區
   ```sql
   -- PostgreSQL 12+ 支援分區
   CREATE TABLE submissions (
       ...
   ) PARTITION BY RANGE (created_at);
   
   CREATE TABLE submissions_2025_12 PARTITION OF submissions
   FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
   ```

2. **歸檔舊資料**: 將超過 6 個月的提交移到歸檔表
   ```python
   # apps/submissions/management/commands/archive_old_submissions.py
   # 已有框架，需完善實作
   ```

3. **冷熱分離**: 熱資料（recent submissions）使用快取

### 4.2 快取策略 ⭐⭐⭐

**目前實作**:
- ✅ Redis 用於 Celery Broker
- ✅ TanStack Query 前端快取（1 分鐘）

**問題**:
- ⚠️ **未充分利用 Redis 快取**: 熱門題目、排行榜等應快取（HIGH）

**建議**:
```python
# 1. Django Cache Framework
# config/settings/base.py
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': os.getenv('REDIS_URL', 'redis://localhost:6379/1'),
    }
}

# 2. 快取熱門題目
from django.core.cache import cache

def get_popular_problems():
    cache_key = 'popular_problems'
    problems = cache.get(cache_key)
    if problems is None:
        problems = Problem.objects.filter(
            is_visible=True
        ).order_by('-submission_count')[:10]
        cache.set(cache_key, problems, 60 * 5)  # 5 分鐘
    return problems

# 3. 快取排行榜
@cache_page(60)  # 快取 1 分鐘
def scoreboard_view(request, contest_id):
    ...
```

### 4.3 Celery 效能 ⭐⭐⭐⭐

**優點**:
- ✅ 異步處理評測任務
- ✅ 定時任務（Celery Beat）
- ✅ 任務重試機制

**問題**:
- ⚠️ **Worker 數量未配置**: 預設只有 1 個 worker（MEDIUM）
- ⚠️ **缺少任務優先權**: 所有任務同等優先權（LOW）

**建議**:
```yaml
# docker-compose.yml
celery:
  deploy:
    replicas: 3  # 3 個 workers

# 或使用不同佇列
celery:
  command: celery -A config worker -l info -Q high_priority,default

# apps/submissions/tasks.py
@shared_task(queue='high_priority')
def judge_contest_submission(submission_id):
    """競賽提交（高優先權）"""
    ...

@shared_task(queue='default')
def judge_practice_submission(submission_id):
    """練習提交（一般優先權）"""
    ...
```

### 4.4 前端效能 ⭐⭐⭐⭐

**優點**:
- ✅ Vite 建置（快速）
- ✅ Code Splitting（按路由）
- ✅ TanStack Query 快取

**問題**:
- ⚠️ **Monaco Editor bundle 很大**: 影響首次載入（MEDIUM）
- ⚠️ **缺少圖片 Lazy Loading**: 影響效能（LOW）

**建議**:
```typescript
// 1. Monaco Editor 動態載入
import { lazy, Suspense } from 'react';
const MonacoEditor = lazy(() => import('@monaco-editor/react'));

<Suspense fallback={<div>Loading editor...</div>}>
  <MonacoEditor {...props} />
</Suspense>

// 2. 圖片 Lazy Loading
<img src="..." loading="lazy" alt="..." />

// 3. 使用 React.memo 避免不必要的重渲染
const ProblemCard = React.memo(({ problem }) => {
  ...
});
```

---

## 5. 測試覆蓋率

### 5.1 後端測試 ⭐⭐⭐⭐⭐

**測試框架**: pytest

**覆蓋率目標**: 80%+

**測試範圍**:
- ✅ Users (認證、角色管理)
- ✅ Problems (CRUD、權限)
- ✅ Submissions (評測流程)
- ✅ Contests (競賽邏輯、考試模式)
- ✅ Judge (Docker 執行、安全性、多語言)

**測試檔案**:
```
backend/tests/
├── test_users.py
├── test_problems.py
├── test_contests.py
└── test_judge.py

backend/apps/*/tests.py
backend/apps/*/tests/
```

**CI/CD**: ✅ GitHub Actions 自動執行

**優點**:
- ✅ 完整的 Judge 測試（包含安全性測試）
- ✅ 使用 Factory Boy 產生測試資料
- ✅ 測試資料庫隔離

**問題**:
- ⚠️ **缺少整合測試**: 跨模組的整合測試較少（MEDIUM）
- ⚠️ **缺少效能測試**: 沒有負載測試（LOW）

**建議**:
```python
# tests/integration/test_submission_flow.py
def test_complete_submission_flow():
    """測試完整的提交流程：建立題目 → 提交程式碼 → 評測 → 更新統計"""
    # 1. 建立題目
    problem = ProblemFactory()
    TestCaseFactory(problem=problem, input_data="1 2", output_data="3")
    
    # 2. 提交程式碼
    submission = SubmissionFactory(problem=problem, code="...")
    
    # 3. 執行評測
    judge_submission(submission.id)
    
    # 4. 驗證結果
    submission.refresh_from_db()
    assert submission.status == 'AC'
    
    # 5. 驗證統計更新
    problem.refresh_from_db()
    assert problem.submission_count == 1
    assert problem.accepted_count == 1
```

### 5.2 前端測試 ⭐⭐⭐⭐

**測試框架**: Playwright (E2E)

**測試範圍**:
- ✅ 認證流程（登入、註冊）
- ✅ 題目瀏覽與提交
- ✅ 競賽參與流程
- ✅ 考試模式

**測試檔案**:
```
frontend/tests/e2e/
├── auth.e2e.spec.ts
├── problems.e2e.spec.ts
├── contest.e2e.spec.ts
└── submission.e2e.spec.ts
```

**CI/CD**: ⚠️ 尚未整合到 GitHub Actions

**問題**:
- ⚠️ **缺少單元測試**: 元件、Hooks 沒有單元測試（HIGH）
- ⚠️ **E2E 測試覆蓋率低**: 只有基本流程（MEDIUM）

**建議**:
```bash
# 1. 新增單元測試 (Vitest)
npm install -D vitest @testing-library/react

# vite.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
  },
});

# 2. 測試 Custom Hooks
// src/hooks/__tests__/useProblem.test.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { useProblem } from '../useProblem';

test('should fetch problem data', async () => {
  const { result } = renderHook(() => useProblem(1));
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toHaveProperty('title');
});

# 3. 新增 GitHub Actions E2E workflow
# .github/workflows/frontend-e2e.yml
name: Frontend E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Start test environment
        run: docker-compose -f docker-compose.test.yml up -d
      - name: Run E2E tests
        run: |
          cd frontend
          npm ci
          npx playwright install
          npm run test:e2e
```

---

## 6. 文件完整性

### 6.1 現有文件 ⭐⭐⭐⭐⭐

**README.md**: ✅ 完整（專案概述、快速開始、技術棧）

**docs/ 目錄**:
- ✅ `STUDENT_GUIDE.md` - 學生使用指南
- ✅ `TEACHER_CONTEST_GUIDE.md` - 教師競賽指南
- ✅ `TEACHER_PROBLEM_GUIDE.md` - 教師題目管理
- ✅ `RUN_AND_DEPLOY.md` - 執行與部署
- ✅ `problem-import-format.md` - 題目導入格式
- ✅ `E2E_TESTING.md` - E2E 測試指南

**本次新增文件** (2025-12-10):
- ✅ `ARCHITECTURE.md` - 系統架構文件
- ✅ `API.md` - API 文件
- ✅ `DATABASE.md` - 資料模型文件
- ✅ `DEPLOYMENT_AND_TESTING.md` - 部署與測試
- ✅ `CODE_REVIEW_REPORT.md` - Code Review 報告

**缺少的文件**:
- ⚠️ `CONTRIBUTING.md` - 貢獻指南（如何提交 PR、程式碼規範）
- ⚠️ `CHANGELOG.md` - 版本變更記錄
- ⚠️ `TROUBLESHOOTING.md` - 常見問題排查
- ⚠️ `SECURITY.md` - 安全漏洞回報流程
- ⚠️ API 使用範例（Postman Collection 或 cURL 範例）

**建議**: 補充這些文件以提升專案完整性。

---

## 7. 冗餘程式碼識別

### 7.1 Deprecated 欄位

**檔案**: `backend/apps/problems/models.py`

```python
class Problem(models.Model):
    # 已棄用欄位（註解說明）
    # DEPRECATED: The following fields are deprecated and will be removed in a future version
    # Use is_practice_visible and created_in_contest instead
```

**問題**: 註解說明有 deprecated 欄位，但沒有明確列出是哪些欄位。

**建議**: 明確標記並建立遷移計劃。

```python
# 如果欄位已不再使用，建立遷移移除
# migrations/0XXX_remove_deprecated_fields.py
operations = [
    migrations.RemoveField(model_name='problem', name='old_field'),
]
```

### 7.2 未使用的 Import

**多處檔案**: 存在未使用的 import（TypeScript 的 `noUnusedLocals` 已啟用）

**建議**: 執行 linter 自動清理

```bash
# Python
pip install autoflake
autoflake --remove-all-unused-imports --in-place backend/**/*.py

# TypeScript
npm run lint -- --fix
```

### 7.3 重複的錯誤處理邏輯

**檔案**: `backend/apps/*/views.py`

多個 ViewSet 有類似的錯誤處理邏輯。

**建議**: 建立統一的錯誤處理 Mixin

```python
# apps/core/mixins.py
class StandardResponseMixin:
    def success_response(self, data, message=None, status=200):
        response_data = {'success': True, 'data': data}
        if message:
            response_data['message'] = message
        return Response(response_data, status=status)
    
    def error_response(self, code, message, details=None, status=400):
        response_data = {
            'success': False,
            'error': {
                'code': code,
                'message': message,
            }
        }
        if details:
            response_data['error']['details'] = details
        return Response(response_data, status=status)

# Usage
class ProblemViewSet(StandardResponseMixin, viewsets.ModelViewSet):
    def create(self, request):
        try:
            ...
            return self.success_response(data, "題目建立成功", 201)
        except Exception as e:
            return self.error_response('CREATE_FAILED', str(e), status=500)
```

### 7.4 前端重複的 API 呼叫邏輯

**多處元件**: 類似的 `fetch` 邏輯

**建議**: 統一使用 `httpClient` 並新增錯誤處理攔截器

```typescript
// services/api/httpClient.ts
export const httpClient = {
  async request(endpoint: string, init: RequestInit = {}) {
    try {
      const response = await customFetch(endpoint, init);
      if (!response.ok) {
        const error = await response.json();
        throw new ApiError(error.error?.message || 'Request failed', response.status);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('Network error', 0);
    }
  },
  // ... get, post, put, patch, delete
};

// 使用
try {
  const data = await httpClient.get('/api/v1/problems/');
} catch (error) {
  if (error instanceof ApiError) {
    toast.error(error.message);
  }
}
```

---

## 8. 改進建議

### 8.1 高優先權 (Critical/High)

#### 8.1.1 安全性改進

1. **實作 Token 黑名單** (CRITICAL)
   ```python
   # apps/users/models.py
   class BlacklistedToken(models.Model):
       token = models.CharField(max_length=500, unique=True)
       blacklisted_at = models.DateTimeField(auto_now_add=True)
   
   # apps/users/views.py
   class LogoutView(APIView):
       def post(self, request):
           token = request.auth
           BlacklistedToken.objects.create(token=str(token))
           return Response({'success': True, 'message': '登出成功'})
   ```

2. **新增 API 速率限制** (HIGH)
   ```bash
   pip install django-ratelimit
   ```
   ```python
   from django_ratelimit.decorators import ratelimit
   
   @ratelimit(key='ip', rate='5/m', method='POST')
   def login_view(request):
       ...
   ```

3. **改進考試模式安全** (HIGH)
   - 新增後端心跳檢查
   - 加強前端監控（防繞過）
   - 記錄更多違規行為

#### 8.1.2 效能改進

1. **實作 Redis 快取** (HIGH)
   ```python
   # 快取熱門題目
   # 快取排行榜
   # 快取使用者統計
   ```

2. **資料庫查詢優化** (HIGH)
   - 檢查所有 View 是否使用 `select_related` / `prefetch_related`
   - 新增缺少的索引
   - 分析慢查詢（`pg_stat_statements`）

3. **Celery Worker 擴展** (MEDIUM)
   ```yaml
   celery:
     deploy:
       replicas: 3
   ```

#### 8.1.3 測試改進

1. **新增前端單元測試** (HIGH)
   ```bash
   npm install -D vitest @testing-library/react
   ```

2. **E2E 測試整合到 CI** (HIGH)
   ```yaml
   # .github/workflows/frontend-e2e.yml
   ```

3. **新增整合測試** (MEDIUM)
   ```python
   # tests/integration/test_submission_flow.py
   ```

### 8.2 中優先權 (Medium)

#### 8.2.1 程式碼品質

1. **拆分大型元件**
   - `ContestLayout.tsx` (600+ 行)
   - `ContestDashboard.tsx`

2. **統一錯誤處理**
   - 後端：`StandardResponseMixin`
   - 前端：`ErrorBoundary` + 統一 API 錯誤處理

3. **清理 TODO 註解**
   - 建立 Issue 追蹤
   - 或標記為 WONTFIX

4. **新增 Type Hints**
   ```python
   # 後端所有函數新增型別提示
   def get_problem(problem_id: int) -> Problem:
       ...
   ```

#### 8.2.2 文件補充

1. **CONTRIBUTING.md**
2. **CHANGELOG.md**
3. **TROUBLESHOOTING.md**
4. **SECURITY.md**

#### 8.2.3 監控與日誌

1. **整合錯誤追蹤服務** (Sentry)
   ```python
   import sentry_sdk
   sentry_sdk.init(dsn="...")
   ```

2. **新增效能監控** (New Relic / Datadog)

3. **日誌聚合** (ELK Stack / Grafana Loki)

### 8.3 低優先權 (Low)

#### 8.3.1 功能增強

1. **程式碼相似度檢測**（抄襲偵測）
2. **即時排行榜**（WebSocket）
3. **更多統計圖表**
4. **批次匯出成績**（Excel/CSV）
5. **題目推薦系統**

#### 8.3.2 國際化

1. **前端 i18n**
   ```bash
   npm install react-i18next i18next
   ```

2. **多語言支援**（英文、繁中、簡中）

#### 8.3.3 UI/UX 改進

1. **Dark Mode 優化**
2. **響應式設計改進**（Mobile）
3. **無障礙性** (Accessibility)

---

## 9. 總結

### 9.1 優勢

✅ **功能完整**: 實作了完整的 Online Judge 核心功能  
✅ **架構清晰**: 前後端分離、模組化設計良好  
✅ **安全性高**: Docker 沙箱、安全評測、權限控制完善  
✅ **測試覆蓋**: 後端測試覆蓋率高、有 E2E 測試  
✅ **文件齊全**: 中文文件完整、新增架構與 API 文件  
✅ **容器化部署**: Docker Compose 一鍵部署  

### 9.2 需改進

⚠️ **安全性**: Token 黑名單、速率限制、考試模式後端驗證  
⚠️ **效能**: Redis 快取、資料庫查詢優化、Celery 擴展  
⚠️ **測試**: 前端單元測試、整合測試、E2E CI 整合  
⚠️ **程式碼品質**: 拆分大型元件、統一錯誤處理、清理 TODO  
⚠️ **監控**: 錯誤追蹤、效能監控、日誌聚合  

### 9.3 建議開發路徑

**Phase 1: 安全性與穩定性**（1-2 週）
1. 實作 Token 黑名單
2. 新增 API 速率限制
3. 改進考試模式安全
4. Redis 快取實作

**Phase 2: 效能優化**（2-3 週）
1. 資料庫查詢優化
2. Celery Worker 擴展
3. 前端效能優化
4. 新增監控與日誌

**Phase 3: 測試與品質**（2-3 週）
1. 前端單元測試
2. E2E 測試整合到 CI
3. 拆分大型元件
4. 統一錯誤處理
5. 清理程式碼

**Phase 4: 功能增強**（長期）
1. 程式碼相似度檢測
2. 即時排行榜
3. 國際化
4. 更多統計功能

---

## 10. 附錄

### 10.1 檢查清單

使用此清單追蹤改進進度：

**安全性**:
- [ ] 實作 Token 黑名單
- [ ] 新增 API 速率限制
- [ ] 考試模式後端心跳檢查
- [ ] Content Security Policy
- [ ] 備份加密

**效能**:
- [ ] Redis 快取（題目、排行榜、統計）
- [ ] 所有查詢使用 select_related/prefetch_related
- [ ] Celery Worker 擴展
- [ ] 前端 Monaco Editor 動態載入
- [ ] 圖片 Lazy Loading

**測試**:
- [ ] 前端單元測試 (Vitest)
- [ ] E2E 測試整合到 GitHub Actions
- [ ] 整合測試
- [ ] 效能測試 (Locust)

**程式碼品質**:
- [ ] 拆分 ContestLayout.tsx
- [ ] 統一錯誤處理 (StandardResponseMixin)
- [ ] 前端 Error Boundary
- [ ] 清理所有 TODO 註解
- [ ] 清理未使用的 import

**文件**:
- [ ] CONTRIBUTING.md
- [ ] CHANGELOG.md
- [ ] TROUBLESHOOTING.md
- [ ] SECURITY.md
- [ ] API 使用範例

**監控**:
- [ ] 整合 Sentry
- [ ] 效能監控 (New Relic / Datadog)
- [ ] 日誌聚合 (ELK / Loki)

### 10.2 聯絡資訊

如有任何問題或建議，請聯絡：
- **GitHub Issues**: [專案 Issues](https://github.com/quan0715/QJudge/issues)
- **Email**: 專案維護者

---

**Code Review 完成日期**: 2025-12-10  
**下次 Review 建議**: 實作高優先權改進後（預計 2026-01）

---

**QJudge Code Review** - 持續改進，追求卓越 🚀
