# Submission API 優化實作指南

本文件提供 Submission API 性能優化的逐步實作指南。

## 目錄
1. [資料庫層優化](#1-資料庫層優化)
2. [後端 API 優化](#2-後端-api-優化)
3. [前端優化](#3-前端優化)
4. [測試驗證](#4-測試驗證)

---

## 1. 資料庫層優化

### 1.1 新增資料庫索引

#### 步驟 1: 建立 Migration

```bash
cd backend
python manage.py makemigrations submissions --empty -n add_performance_indexes
```

#### 步驟 2: 編輯 Migration 檔案

建立檔案: `backend/apps/submissions/migrations/00XX_add_performance_indexes.py`

```python
from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('submissions', '00XX_previous_migration'),  # 替換為實際的前一個 migration
    ]

    operations = [
        # 為常見的查詢模式新增複合索引
        migrations.AddIndex(
            model_name='submission',
            index=models.Index(
                fields=['source_type', 'is_test', '-created_at'],
                name='sub_src_test_created_idx'
            ),
        ),
        migrations.AddIndex(
            model_name='submission',
            index=models.Index(
                fields=['contest', 'source_type', '-created_at'],
                name='sub_contest_src_created_idx'
            ),
        ),
        migrations.AddIndex(
            model_name='submission',
            index=models.Index(
                fields=['problem', '-created_at'],
                name='sub_problem_created_idx'
            ),
        ),
        migrations.AddIndex(
            model_name='submission',
            index=models.Index(
                fields=['status', '-created_at'],
                name='sub_status_created_idx'
            ),
        ),
        migrations.AddIndex(
            model_name='submission',
            index=models.Index(
                fields=['user', '-created_at'],
                name='sub_user_created_idx'
            ),
        ),
    ]
```

#### 步驟 3: 執行 Migration（建議在維護時段）

```bash
# 測試環境先測試
python manage.py migrate submissions --database=default

# Production 環境（使用 --fake-initial 如果需要）
python manage.py migrate submissions
```

#### 步驟 4: 更新 Model Meta

更新 `backend/apps/submissions/models.py`:

```python
class Submission(models.Model):
    # ... 欄位定義 ...
    
    class Meta:
        db_table = 'submissions'
        verbose_name = '提交記錄'
        verbose_name_plural = '提交記錄'
        ordering = ['-created_at']
        indexes = [
            # 原有索引
            models.Index(fields=['user', 'problem']),
            models.Index(fields=['status']),
            # 新增的複合索引（與 migration 一致）
            models.Index(fields=['source_type', 'is_test', '-created_at'], name='sub_src_test_created_idx'),
            models.Index(fields=['contest', 'source_type', '-created_at'], name='sub_contest_src_created_idx'),
            models.Index(fields=['problem', '-created_at'], name='sub_problem_created_idx'),
            models.Index(fields=['status', '-created_at'], name='sub_status_created_idx'),
            models.Index(fields=['user', '-created_at'], name='sub_user_created_idx'),
        ]
```

---

## 2. 後端 API 優化

### 2.1 建立精簡版 Serializer

編輯 `backend/apps/submissions/serializers.py`:

```python
class SubmissionListSerializer(serializers.ModelSerializer):
    """
    Optimized serializer for submission list.
    Only includes necessary fields to reduce response size.
    """
    # 使用直接欄位而非嵌套 serializer
    username = serializers.CharField(source='user.username', read_only=True)
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    problem_id = serializers.IntegerField(source='problem.id', read_only=True)
    problem_title = serializers.CharField(source='problem.title', read_only=True)
    contest_id = serializers.IntegerField(source='contest.id', read_only=True, allow_null=True)
    
    class Meta:
        model = Submission
        fields = [
            'id',
            'user_id',
            'username',
            'problem_id',
            'problem_title',
            'contest_id',
            'source_type',
            'language',
            'status',
            'score',
            'exec_time',
            'memory_usage',
            'created_at',
        ]
    
    def get_username(self, obj):
        """Handle anonymous mode for contests"""
        # 如果不是比賽或沒有開啟匿名模式，直接返回真實用戶名
        if not obj.contest or not obj.contest.anonymous_mode_enabled:
            return obj.user.username
        
        request = self.context.get('request')
        viewer = request.user if request else None
        
        # 特權用戶或本人可以看到真實姓名
        is_privileged = viewer and (viewer.is_staff or getattr(viewer, 'role', '') in ['teacher', 'admin'])
        is_owner = viewer and viewer == obj.user
        
        if is_privileged or is_owner:
            return obj.user.username
        
        # 其他人看到暱稱（如果有的話）
        # 使用 prefetched data 避免 N+1 查詢
        if hasattr(obj.user, '_contest_participant_nickname'):
            return obj.user._contest_participant_nickname or obj.user.username
        
        # Fallback: 查詢（但應該避免到這裡）
        from apps.contests.models import ContestParticipant
        try:
            participant = ContestParticipant.objects.get(contest=obj.contest, user=obj.user)
            return participant.nickname or obj.user.username
        except ContestParticipant.DoesNotExist:
            return obj.user.username
```

### 2.2 優化 ViewSet QuerySet

編輯 `backend/apps/submissions/views.py`:

```python
from django.db.models import Prefetch, F, Q

class SubmissionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for viewing and creating submissions.
    """
    queryset = Submission.objects.all()
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [
        DjangoFilterBackend,
        filters.OrderingFilter
    ]
    filterset_fields = ['problem', 'contest', 'status', 'language', 'source_type']
    ordering_fields = ['created_at', 'score', 'exec_time']
    ordering = ['-created_at']
    
    def get_queryset(self):
        """
        Optimized queryset with proper select_related and only() for list view.
        """
        user = self.request.user
        queryset = super().get_queryset()
        
        # 根據 action 優化查詢
        if self.action == 'list':
            # 只載入必要欄位
            queryset = queryset.only(
                'id',
                'user_id',
                'problem_id', 
                'contest_id',
                'source_type',
                'language',
                'status',
                'score',
                'exec_time',
                'memory_usage',
                'created_at',
                # 關聯表的欄位
                'user__id',
                'user__username',
                'problem__id',
                'problem__title',
                'contest__id',
                'contest__anonymous_mode_enabled',
            ).select_related('user', 'problem', 'contest')
            
            # 如果有 contest 且開啟匿名模式，prefetch participant data
            contest_id = self.request.query_params.get('contest')
            if contest_id:
                from apps.contests.models import ContestParticipant
                # Prefetch to avoid N+1
                queryset = queryset.prefetch_related(
                    Prefetch(
                        'user__contest_participants',
                        queryset=ContestParticipant.objects.filter(contest_id=contest_id).only('nickname', 'user_id', 'contest_id'),
                        to_attr='_prefetched_participants'
                    )
                )
        
        elif self.action == 'retrieve':
            # Detail view 載入完整資料
            queryset = queryset.select_related('user', 'problem', 'contest')
        
        # Filter by source_type
        source_type = self.request.query_params.get('source_type', 'practice')
        
        if source_type == 'practice':
            # Practice: Show ALL practice submissions (Public)
            return queryset.filter(source_type='practice', is_test=False)
            
        elif source_type == 'contest':
            # Contest: See all (for scoreboard), but filter by contest if provided
            contest_id = self.request.query_params.get('contest')
            if contest_id:
                queryset = queryset.filter(contest_id=contest_id)
            
            return queryset.filter(source_type='contest')
            
        # Fallback
        return queryset.filter(user=user)
    
    # ... 其他方法保持不變 ...
```

### 2.3 新增快取 (可選)

如果需要快取，可以使用 Redis:

```python
# backend/apps/submissions/views.py
from django.core.cache import cache
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
import hashlib
import json

class SubmissionViewSet(viewsets.ModelViewSet):
    # ... 
    
    def list(self, request, *args, **kwargs):
        # 根據查詢參數生成快取 key
        cache_key = f"submissions_list_{hashlib.md5(json.dumps(request.query_params.dict(), sort_keys=True).encode()).hexdigest()}"
        
        # 嘗試從快取取得
        cached_data = cache.get(cache_key)
        if cached_data:
            return Response(cached_data)
        
        # 正常查詢
        response = super().list(request, *args, **kwargs)
        
        # 快取 30 秒
        cache.set(cache_key, response.data, 30)
        
        return response
```

---

## 3. 前端優化

### 3.1 安裝 React Query

```bash
cd frontend
npm install @tanstack/react-query
```

### 3.2 設定 React Query Provider

編輯 `frontend/src/App.tsx` 或 `frontend/src/main.tsx`:

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30 秒內重用資料
      gcTime: 5 * 60 * 1000, // 5 分鐘後清除快取
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* 你的 app */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

### 3.3 建立 useSubmissions Hook

建立 `frontend/src/domains/submission/hooks/useSubmissions.ts`:

```typescript
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSubmissions } from '@/services/submission';

interface UseSubmissionsParams {
  page?: number;
  pageSize?: number;
  status?: string;
  sourceType?: string;
  contest?: string;
  problem?: string;
  enabled?: boolean;
}

export const useSubmissions = (params: UseSubmissionsParams) => {
  const {
    page = 1,
    pageSize = 20,
    status,
    sourceType = 'practice',
    contest,
    problem,
    enabled = true,
  } = params;

  const queryKey = ['submissions', { page, pageSize, status, sourceType, contest, problem }];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const apiParams: any = {
        page,
        page_size: pageSize,
        source_type: sourceType,
        is_test: false,
      };

      if (status && status !== 'all') {
        apiParams.status = status;
      }

      if (contest) {
        apiParams.contest = contest;
      }

      if (problem) {
        apiParams.problem = problem;
      }

      return await getSubmissions(apiParams);
    },
    enabled,
    staleTime: 30000, // 30秒
    gcTime: 5 * 60 * 1000, // 5分鐘
  });

  const queryClient = useQueryClient();

  const prefetchNextPage = () => {
    queryClient.prefetchQuery({
      queryKey: ['submissions', { ...params, page: page + 1 }],
      queryFn: () => getSubmissions({ ...params, page: page + 1 }),
    });
  };

  return {
    ...query,
    submissions: query.data?.results || [],
    totalCount: query.data?.count || 0,
    prefetchNextPage,
  };
};
```

### 3.4 更新 SubmissionsPage 使用 React Query

編輯 `frontend/src/domains/submission/pages/SubmissionsPage.tsx`:

```typescript
import { useSubmissions } from '@/domains/submission/hooks/useSubmissions';

const SubmissionsPage = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // 使用 React Query hook
  const { 
    submissions, 
    totalCount, 
    isLoading, 
    isFetching,
    refetch,
    prefetchNextPage 
  } = useSubmissions({
    page,
    pageSize,
    status: statusFilter,
    sourceType: 'practice', // 預設只顯示 practice
  });

  // Prefetch 下一頁
  useEffect(() => {
    if (page < Math.ceil(totalCount / pageSize)) {
      prefetchNextPage();
    }
  }, [page, totalCount, pageSize, prefetchNextPage]);

  const handleRefresh = () => {
    refetch();
  };

  // Read submission_id from URL
  const submissionIdFromUrl = searchParams.get("submission_id");
  const isModalOpen = !!submissionIdFromUrl;

  const statusOptions = [
    { id: "all", label: "全部狀態" },
    { id: "AC", label: "通過 (AC)" },
    { id: "WA", label: "答案錯誤 (WA)" },
    { id: "TLE", label: "超時 (TLE)" },
    { id: "MLE", label: "記憶體超限 (MLE)" },
    { id: "RE", label: "執行錯誤 (RE)" },
    { id: "CE", label: "編譯錯誤 (CE)" },
    { id: "pending", label: "等待中" },
    { id: "judging", label: "評測中" },
  ];

  const canViewSubmission = (sub: Submission): boolean => {
    if (!user) return false;
    if (user.role === "admin" || user.role === "teacher") return true;
    if (sub.userId === user.id?.toString()) return true;
    return false;
  };

  const submissionRows: SubmissionRow[] = submissions.map((sub) => ({
    id: sub.id,
    status: sub.status,
    problem_id: sub.problemId ? parseInt(sub.problemId) : 0,
    problem_title: sub.problemTitle || `Problem #${sub.problemId}`,
    username: sub.username || "Unknown",
    userId: sub.userId,
    language: sub.language,
    score: sub.score || 0,
    exec_time: sub.execTime || 0,
    created_at: sub.createdAt,
    canView: canViewSubmission(sub),
  }));

  const handleViewDetails = (id: string) => {
    setSearchParams({ submission_id: id });
  };

  const handleCloseModal = () => {
    setSearchParams({});
  };

  const isInitialLoading = isLoading && submissions.length === 0;

  return (
    <div style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
      <PageHeader
        title="提交記錄"
        subtitle="查看所有公開的程式碼提交狀態與結果。"
        extra={
          <Button
            kind="tertiary"
            renderIcon={isFetching ? InlineLoading : Renew}
            onClick={handleRefresh}
            disabled={isFetching}
          >
            {isFetching ? "更新中..." : "重新整理"}
          </Button>
        }
      />

      <TableToolbar>
        <TableToolbarContent>
          <TableToolbarSearch
            placeholder="搜尋用戶或題目..."
            onChange={(e: any) => {
              // 實作搜尋功能
            }}
            persistent
          />
          <div style={{ width: "200px" }}>
            <Dropdown
              id="status-filter"
              titleText=""
              label="篩選狀態"
              items={statusOptions}
              itemToString={(item: any) => (item ? item.label : "")}
              selectedItem={statusOptions.find((s) => s.id === statusFilter)}
              onChange={({ selectedItem }: any) => {
                if (selectedItem) {
                  setStatusFilter(selectedItem.id);
                  setPage(1);
                }
              }}
            />
          </div>
        </TableToolbarContent>
      </TableToolbar>

      {isInitialLoading ? (
        renderSkeletonTable()
      ) : (
        <SubmissionTable
          submissions={submissionRows}
          onViewDetails={handleViewDetails}
          showProblem={true}
          showUser={true}
          showScore={true}
        />
      )}

      <Pagination
        totalItems={totalCount}
        backwardText="上一頁"
        forwardText="下一頁"
        itemsPerPageText="每頁顯示"
        page={page}
        pageSize={pageSize}
        pageSizes={[10, 20, 50, 100]}
        size="md"
        onChange={({ page: newPage, pageSize: newPageSize }: any) => {
          setPage(newPage);
          setPageSize(newPageSize);
        }}
        style={{ marginTop: "1rem" }}
      />

      <SubmissionDetailModal
        submissionId={submissionIdFromUrl}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </div>
  );
};

export default SubmissionsPage;
```

---

## 4. 測試驗證

### 4.1 效能測試腳本

建立 `backend/scripts/test_submission_performance.py`:

```python
import time
import requests
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from apps.submissions.models import Submission

User = get_user_model()

def test_submission_list_performance():
    """測試 submission list API 性能"""
    
    client = APIClient()
    
    # 建立測試用戶並登入
    user = User.objects.first()
    client.force_authenticate(user=user)
    
    # 測試不同的查詢場景
    test_cases = [
        {
            'name': 'All submissions (no filter)',
            'params': {'page_size': 20}
        },
        {
            'name': 'Practice submissions only',
            'params': {'source_type': 'practice', 'page_size': 20}
        },
        {
            'name': 'By status',
            'params': {'status': 'AC', 'page_size': 20}
        },
        {
            'name': 'By problem',
            'params': {'problem': 1, 'page_size': 20}
        },
    ]
    
    for test_case in test_cases:
        start_time = time.time()
        
        response = client.get('/api/v1/submissions/', test_case['params'])
        
        end_time = time.time()
        elapsed = (end_time - start_time) * 1000  # ms
        
        print(f"\n{test_case['name']}")
        print(f"  Status Code: {response.status_code}")
        print(f"  Response Time: {elapsed:.2f} ms")
        print(f"  Result Count: {len(response.data.get('results', []))}")
        
        if elapsed > 500:
            print(f"  ⚠️  SLOW! (> 500ms)")
        else:
            print(f"  ✅ OK")

if __name__ == '__main__':
    test_submission_list_performance()
```

### 4.2 執行測試

```bash
# 進入 Django shell
python manage.py shell

# 執行測試
from scripts.test_submission_performance import test_submission_list_performance
test_submission_list_performance()
```

### 4.3 SQL 查詢分析

使用 Django Debug Toolbar 或直接檢查 SQL:

```python
from django.test.utils import override_settings
from django.db import connection
from django.db import reset_queries

# 在 settings.py 中啟用 DEBUG = True
reset_queries()

# 執行查詢
from apps.submissions.models import Submission
submissions = list(
    Submission.objects
    .filter(source_type='practice', is_test=False)
    .select_related('user', 'problem', 'contest')
    .only('id', 'user__username', 'problem__title', 'status', 'created_at')[:20]
)

# 檢查查詢數量和時間
from django.db import connection
print(f"Total Queries: {len(connection.queries)}")
for i, query in enumerate(connection.queries, 1):
    print(f"\nQuery {i}:")
    print(f"  SQL: {query['sql'][:200]}...")
    print(f"  Time: {query['time']}s")
```

### 4.4 前端性能測試

使用 Chrome DevTools:

1. 開啟 Network tab
2. 載入提交記錄頁面
3. 檢查：
   - API 請求時間
   - 回應大小
   - 渲染時間

或使用 React DevTools Profiler:

```typescript
import { Profiler } from 'react';

<Profiler id="SubmissionsPage" onRender={(id, phase, actualDuration) => {
  console.log(`${id} (${phase}) took ${actualDuration}ms`);
}}>
  <SubmissionsPage />
</Profiler>
```

---

## 5. 部署檢查清單

在部署到 production 前，請確認：

- [ ] 資料庫索引已建立
- [ ] Migration 在測試環境成功執行
- [ ] API 回應時間改善
- [ ] 沒有引入 N+1 查詢問題
- [ ] 前端快取正常運作
- [ ] 向後相容性確認
- [ ] 監控和日誌設定完成

---

## 6. 回滾計畫

如果優化後出現問題：

### 後端回滾

```bash
# 回滾 migration
python manage.py migrate submissions <previous_migration_number>

# 或直接刪除索引（如果需要）
python manage.py dbshell
DROP INDEX IF EXISTS sub_src_test_created_idx;
DROP INDEX IF EXISTS sub_contest_src_created_idx;
# ... 其他索引
```

### 前端回滾

```bash
# 回到之前的 commit
git revert <commit-hash>

# 或使用功能開關
if (process.env.REACT_APP_USE_QUERY_OPTIMIZATION !== 'true') {
  // 使用舊的實作
}
```

---

## 7. 後續監控

優化後持續監控以下指標：

1. **API 效能指標**
   - 平均回應時間
   - P95/P99 回應時間
   - 錯誤率

2. **資料庫指標**
   - 查詢執行時間
   - 索引使用率
   - 慢查詢日誌

3. **前端指標**
   - 頁面載入時間
   - First Contentful Paint
   - Time to Interactive

4. **快取指標**
   - 快取命中率
   - 記憶體使用量

---

## 8. 參考資料

- [Django Database Optimization](https://docs.djangoproject.com/en/stable/topics/db/optimization/)
- [PostgreSQL Index Types](https://www.postgresql.org/docs/current/indexes-types.html)
- [React Query Documentation](https://tanstack.com/query/latest)
- [Web Performance Best Practices](https://web.dev/fast/)
