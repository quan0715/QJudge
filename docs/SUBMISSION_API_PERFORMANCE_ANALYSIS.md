# Submission API 性能分析報告

## 問題概述

在 production 環境中，由於 submission 數量過高，導致 `GET /api/v1/submissions/` API 載入時間過長。

## 當前實作分析

### 後端 API (Backend)

#### 1. ViewSet 配置
**檔案**: `backend/apps/submissions/views.py`

```python
class SubmissionViewSet(viewsets.ModelViewSet):
    queryset = Submission.objects.all()
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [
        DjangoFilterBackend,
        filters.OrderingFilter
    ]
    filterset_fields = ['problem', 'contest', 'status', 'language', 'source_type']
    ordering_fields = ['created_at', 'score', 'exec_time']
    ordering = ['-created_at']
```

**問題點**:
- ✅ 已使用 `select_related('user', 'problem', 'contest')` 優化 N+1 查詢
- ⚠️ 分頁設定為 20 筆 (在 `base.py` 中設定)
- ❌ 沒有使用 `only()` 或 `defer()` 限制欄位
- ❌ 在 serializer 中可能還有額外的查詢

#### 2. Serializer 分析
**檔案**: `backend/apps/submissions/serializers.py`

```python
class SubmissionListSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()
    problem = ProblemListSerializer(read_only=True)
```

**問題點**:
- ❌ `ProblemListSerializer` 可能載入過多 problem 相關資料
- ❌ `get_user()` 方法中有 ContestParticipant 查詢（匿名模式）
- ❌ 每個 submission 都可能觸發額外的資料庫查詢

#### 3. 資料庫索引
**檔案**: `backend/apps/submissions/models.py`

```python
class Meta:
    indexes = [
        models.Index(fields=['user', 'problem']),
        models.Index(fields=['status']),
    ]
    # source_type, created_at, status 都有 db_index=True
```

**問題點**:
- ⚠️ 缺少複合索引用於常見查詢組合
- ⚠️ 沒有針對 `contest + created_at` 的索引
- ⚠️ 沒有針對 `source_type + created_at` 的索引

### 前端 API 呼叫 (Frontend)

#### 1. 全域提交記錄頁面
**檔案**: `frontend/src/domains/submission/pages/SubmissionsPage.tsx`

```typescript
const fetchSubmissions = async () => {
  const params: any = { page, page_size: pageSize, is_test: false };
  if (statusFilter !== "all") {
    params.status = statusFilter;
  }
  const { results, count } = await getSubmissions(params);
};
```

**問題點**:
- ✅ 已使用分頁
- ⚠️ 預設載入 20 筆資料
- ❌ 沒有使用 `source_type='practice'` 過濾（會載入所有類型）

#### 2. 比賽提交記錄頁面
**檔案**: `frontend/src/domains/contest/pages/ContestSubmissionListPage.tsx`

```typescript
const params: any = {
  source_type: "contest",
  contest: contestId,
  page: page,
  page_size: pageSize,
};
```

**問題點**:
- ✅ 已正確使用 `source_type` 和 `contest` 過濾
- ✅ 已使用分頁

#### 3. 題目提交歷史
**檔案**: `frontend/src/domains/problem/components/ProblemSubmissionHistory.tsx`

```typescript
const { results, count } = await getSubmissions({
  problem: problemId,
  ordering: "-created_at",
  is_test: false,
  contest: contestId,
  source_type: contestId ? "contest" : undefined,
  page: page,
  page_size: pageSize,
});
```

**問題點**:
- ✅ 已正確過濾和分頁

## 性能瓶頸分析

### 1. 資料庫查詢層面

#### 主要問題：
1. **缺少複合索引**: 
   - 常見查詢： `source_type='practice' AND is_test=False ORDER BY created_at DESC`
   - 常見查詢： `contest_id=X AND source_type='contest' ORDER BY created_at DESC`
   - 目前沒有針對這些組合的複合索引

2. **Serializer 的 N+1 問題**:
   - `ProblemListSerializer` 可能載入不必要的欄位
   - 匿名模式下的 `ContestParticipant` 查詢未優化

3. **欄位載入過多**:
   - List API 載入了完整的 `code` 欄位（可能很大）
   - 載入了不需要顯示的欄位

### 2. API 設計層面

#### 問題：
1. **全域提交頁面沒有預設過濾**:
   - 應該預設只顯示 `source_type='practice'`
   - 目前會嘗試載入所有 submission

2. **分頁大小**:
   - 預設 20 筆可能對大量資料仍不夠
   - 前端可以選擇 100 筆，可能會很慢

### 3. 前端效能層面

#### 問題：
1. **沒有使用快取機制**
2. **每次切換頁面都重新載入**
3. **沒有使用虛擬滾動**

## 優化建議

### 高優先級 (High Priority)

#### 1. 新增資料庫複合索引

```python
# backend/apps/submissions/models.py
class Meta:
    indexes = [
        models.Index(fields=['user', 'problem']),
        models.Index(fields=['status']),
        # 新增以下索引
        models.Index(fields=['source_type', 'is_test', '-created_at']),
        models.Index(fields=['contest', 'source_type', '-created_at']),
        models.Index(fields=['problem', '-created_at']),
        models.Index(fields=['status', '-created_at']),
    ]
```

#### 2. 優化 Serializer - 限制欄位

```python
# backend/apps/submissions/serializers.py
class SubmissionListSerializer(serializers.ModelSerializer):
    # 使用簡化的 problem serializer
    problem_title = serializers.CharField(source='problem.title', read_only=True)
    problem_id = serializers.IntegerField(source='problem.id', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    
    class Meta:
        model = Submission
        fields = [
            'id', 'username', 'problem_id', 'problem_title',
            'contest', 'source_type', 'language', 'status',
            'score', 'exec_time', 'memory_usage', 'created_at',
        ]
```

#### 3. ViewSet 優化 - 使用 only()

```python
# backend/apps/submissions/views.py
def get_queryset(self):
    queryset = super().get_queryset()
    
    # 對於 list view，只載入必要欄位
    if self.action == 'list':
        queryset = queryset.only(
            'id', 'user__username', 'problem__id', 'problem__title',
            'contest', 'source_type', 'language', 'status',
            'score', 'exec_time', 'memory_usage', 'created_at'
        )
    
    return queryset.select_related('user', 'problem', 'contest')
```

#### 4. 前端預設過濾

```typescript
// frontend/src/domains/submission/pages/SubmissionsPage.tsx
const fetchSubmissions = async () => {
  const params: any = { 
    page, 
    page_size: pageSize, 
    is_test: false,
    source_type: 'practice'  // 新增預設過濾
  };
  // ...
};
```

### 中優先級 (Medium Priority)

#### 5. 實作後端快取

```python
# backend/apps/submissions/views.py
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page

class SubmissionViewSet(viewsets.ModelViewSet):
    
    @method_decorator(cache_page(60))  # 快取 1 分鐘
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)
```

#### 6. 優化匿名模式查詢

```python
# backend/apps/submissions/serializers.py
def get_queryset(self):
    queryset = super().get_queryset()
    
    # Prefetch ContestParticipant for anonymous mode
    if self.action == 'list':
        from apps.contests.models import ContestParticipant
        queryset = queryset.prefetch_related(
            'user__contest_participants'
        )
    
    return queryset
```

#### 7. 前端使用快取

```typescript
// 使用 React Query 或 SWR
import { useQuery } from '@tanstack/react-query';

const { data, isLoading } = useQuery({
  queryKey: ['submissions', page, pageSize, statusFilter],
  queryFn: () => getSubmissions({ page, page_size: pageSize, status: statusFilter }),
  staleTime: 30000, // 30秒內重用資料
});
```

### 低優先級 (Low Priority)

#### 8. 實作虛擬滾動
- 使用 `react-window` 或 `react-virtualized`
- 適合載入大量資料時使用

#### 9. 資料庫分區 (Partitioning)
- 按照 `created_at` 或 `source_type` 分區
- 適合資料量超過百萬筆時

#### 10. 讀寫分離
- 使用 PostgreSQL 的 read replica
- 將讀取查詢導向 replica

## 預期效果

### 優化前
- 查詢時間：2-5 秒（10萬筆資料）
- API 回應大小：~500KB（20 筆，含完整資料）
- 前端渲染時間：1-2 秒

### 優化後（高優先級）
- 查詢時間：0.2-0.5 秒（使用索引）
- API 回應大小：~100KB（20 筆，精簡欄位）
- 前端渲染時間：0.3-0.5 秒

### 優化後（中優先級）
- 查詢時間：0.05-0.1 秒（快取命中）
- 重複請求幾乎即時（前端快取）

## 實作優先順序

1. **第一階段** (立即實作)：
   - 新增資料庫索引
   - 優化 Serializer 欄位
   - ViewSet 使用 only()
   - 前端預設過濾

2. **第二階段** (短期實作)：
   - 後端快取
   - 前端 React Query
   - 優化匿名模式查詢

3. **第三階段** (長期規劃)：
   - 虛擬滾動
   - 資料庫分區
   - 讀寫分離

## 監控指標

實作後應監控以下指標：
- API 平均回應時間
- API P95 回應時間
- 資料庫查詢時間
- 快取命中率
- 前端頁面載入時間

## 相關文件

- Django 查詢優化: https://docs.djangoproject.com/en/stable/topics/db/optimization/
- PostgreSQL 索引: https://www.postgresql.org/docs/current/indexes.html
- React Query: https://tanstack.com/query/latest
