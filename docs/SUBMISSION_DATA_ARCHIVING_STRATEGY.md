# Submission 資料歸檔與冷熱分離策略

## 問題分析

每次考試增加 2000+ 筆提交，但這些提交未來大部分不會被查看，導致：
- 資料表持續膨脹
- 查詢效能下降
- 索引維護成本增加
- 備份時間增長

## 解決方案

### 方案 1: 查詢時間範圍限制 (最簡單，立即可用)

#### 概念
預設只查詢最近 N 天/N 個月的資料，舊資料需要特別篩選才顯示。

#### 優點
- 實作簡單，立即見效
- 不需要改動資料庫結構
- 可逆，風險低

#### 實作
- 預設查詢最近 3 個月的資料
- 提供「查看所有歷史」選項

**預期效果**: 
- 查詢範圍減少 75-90%
- 回應時間改善 70-80%

---

### 方案 2: 資料分區 (Partitioning) (中期方案)

#### 概念
按照時間或 contest 將資料表分區，舊資料自動存入不同的分區。

#### 優點
- PostgreSQL 自動路由查詢到正確分區
- 舊分區可以設為只讀
- 刪除舊資料時可直接 DROP 分區（秒級）
- 查詢效能大幅提升

#### 實作
按月或按 contest 分區：
```sql
-- 按月分區
CREATE TABLE submissions_2024_12 PARTITION OF submissions
FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');

-- 按 contest 分區  
CREATE TABLE submissions_contest_active PARTITION OF submissions
FOR VALUES IN (SELECT id FROM contests WHERE status = 'active');
```

**預期效果**:
- 查詢只掃描相關分區
- 歷史資料自動隔離
- 改善 60-80%

---

### 方案 3: 資料歸檔 (推薦 - 最佳長期方案)

#### 概念
將舊的 submission 移到歸檔表，主表只保留活躍資料。

#### 優點
- 主表保持輕量
- 歷史資料可用但不影響效能
- 可以針對歷史資料使用不同的儲存策略
- 成本最優

#### 架構設計

```
submissions (主表 - 熱資料)
  ├─ 最近 3 個月的提交
  └─ 正在進行的考試提交

submissions_archive (歸檔表 - 冷資料)
  ├─ 3 個月前的提交
  └─ 已結束考試的提交
```

**預期效果**:
- 主表縮小 80-90%
- 查詢速度提升 5-10 倍
- 維護成本大幅降低

---

## 推薦實作順序

### 階段 1: 立即優化 (本週)
✅ **時間範圍限制**
- 前端預設查詢最近 3 個月
- 後端加入日期過濾
- 提供「查看全部歷史」選項

### 階段 2: 中期優化 (1-2 個月)
⚡ **實作資料歸檔系統**
- 建立歸檔表
- 實作自動歸檔腳本
- 建立統一查詢介面

### 階段 3: 長期優化 (視需求)
💡 **資料分區** (如果資料量持續增長)
- 只在必要時實作
- 需要較大的架構變更

---

## 詳細實作指南

### 實作 1: 時間範圍限制

#### 後端修改
```python
# apps/submissions/views.py
def get_queryset(self):
    queryset = super().get_queryset()
    
    # 預設只查詢最近 3 個月的資料
    include_all = self.request.query_params.get('include_all', 'false').lower() == 'true'
    
    if not include_all:
        from datetime import timedelta
        from django.utils import timezone
        
        three_months_ago = timezone.now() - timedelta(days=90)
        queryset = queryset.filter(created_at__gte=three_months_ago)
    
    # ... 其他過濾邏輯
```

#### 前端修改
```typescript
// 加入日期範圍選擇器
const [dateRange, setDateRange] = useState<'3months' | '6months' | 'all'>('3months');

const params = {
  page,
  page_size: pageSize,
  source_type: 'practice',
  include_all: dateRange === 'all' ? 'true' : 'false'
};
```

---

### 實作 2: 資料歸檔系統

#### 建立歸檔表
```python
# apps/submissions/models.py
class SubmissionArchive(models.Model):
    """歸檔的 submission 資料"""
    # 與 Submission 相同的欄位結構
    # ... (複製 Submission 的所有欄位)
    
    archived_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'submissions_archive'
        indexes = [
            # 較少的索引，因為查詢頻率低
            models.Index(fields=['-created_at']),
            models.Index(fields=['user', '-created_at']),
        ]
```

#### 歸檔腳本
```python
# apps/submissions/management/commands/archive_old_submissions.py
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from apps.submissions.models import Submission, SubmissionArchive

class Command(BaseCommand):
    help = '將舊的 submissions 歸檔'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=90,
            help='歸檔 N 天前的資料'
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=1000,
            help='每批處理的數量'
        )

    def handle(self, *args, **options):
        days = options['days']
        batch_size = options['batch_size']
        
        cutoff_date = timezone.now() - timedelta(days=days)
        
        # 只歸檔已結束的考試提交
        # 保留 practice 提交在主表中
        old_submissions = Submission.objects.filter(
            created_at__lt=cutoff_date,
            source_type='contest',
            contest__status='inactive'  # 只歸檔已結束的考試
        ).select_related('user', 'problem', 'contest')
        
        total = old_submissions.count()
        self.stdout.write(f'找到 {total} 筆需要歸檔的資料')
        
        archived_count = 0
        for i in range(0, total, batch_size):
            batch = old_submissions[i:i+batch_size]
            
            # 複製到歸檔表
            archive_objects = []
            for submission in batch:
                archive_objects.append(
                    SubmissionArchive(
                        # 複製所有欄位
                        **{field.name: getattr(submission, field.name) 
                           for field in Submission._meta.fields 
                           if field.name != 'id'}
                    )
                )
            
            SubmissionArchive.objects.bulk_create(archive_objects)
            
            # 刪除原資料
            submission_ids = [s.id for s in batch]
            Submission.objects.filter(id__in=submission_ids).delete()
            
            archived_count += len(batch)
            self.stdout.write(f'已歸檔 {archived_count}/{total}')
        
        self.stdout.write(self.style.SUCCESS(f'✅ 成功歸檔 {archived_count} 筆資料'))
```

#### 統一查詢介面
```python
# apps/submissions/services.py
class SubmissionQueryService:
    """統一的 submission 查詢介面，自動從主表和歸檔表查詢"""
    
    @staticmethod
    def get_submissions(filters, include_archive=False):
        """
        查詢 submissions，可選擇是否包含歸檔資料
        """
        from apps.submissions.models import Submission, SubmissionArchive
        
        # 查詢主表
        main_results = Submission.objects.filter(**filters)
        
        if include_archive:
            # 同時查詢歸檔表
            archive_results = SubmissionArchive.objects.filter(**filters)
            
            # 合併結果（使用 union 或在 Python 中合併）
            # 注意：需要處理欄位對齊
            return list(main_results) + list(archive_results)
        
        return main_results
```

#### Celery 定期任務
```python
# config/settings/base.py
CELERY_BEAT_SCHEDULE = {
    # ... 其他任務
    'archive-old-submissions-weekly': {
        'task': 'apps.submissions.tasks.archive_old_submissions',
        'schedule': crontab(hour=2, minute=0, day_of_week=0),  # 每週日凌晨 2 點
    },
}
```

```python
# apps/submissions/tasks.py
from celery import shared_task
from django.core.management import call_command

@shared_task
def archive_old_submissions():
    """定期歸檔舊資料"""
    call_command('archive_old_submissions', '--days=90', '--batch-size=1000')
```

---

### 實作 3: 資料分區 (進階)

#### PostgreSQL 分區設定
```python
# apps/submissions/migrations/00XX_partition_by_date.py
from django.db import migrations

class Migration(migrations.Migration):
    
    operations = [
        migrations.RunSQL("""
            -- 1. 重命名現有表
            ALTER TABLE submissions RENAME TO submissions_old;
            
            -- 2. 建立分區表
            CREATE TABLE submissions (
                LIKE submissions_old INCLUDING ALL
            ) PARTITION BY RANGE (created_at);
            
            -- 3. 建立分區
            CREATE TABLE submissions_2024_q4 PARTITION OF submissions
                FOR VALUES FROM ('2024-10-01') TO ('2025-01-01');
            
            CREATE TABLE submissions_2025_q1 PARTITION OF submissions
                FOR VALUES FROM ('2025-01-01') TO ('2025-04-01');
            
            -- 4. 複製舊資料
            INSERT INTO submissions SELECT * FROM submissions_old;
            
            -- 5. 驗證後刪除舊表
            -- DROP TABLE submissions_old;
        """)
    ]
```

#### 自動建立新分區
```python
# apps/submissions/management/commands/create_submission_partitions.py
from django.core.management.base import BaseCommand
from django.db import connection
from datetime import datetime, timedelta

class Command(BaseCommand):
    help = '建立未來的 submission 分區'

    def handle(self, *args, **options):
        # 建立未來 6 個月的分區
        for i in range(6):
            start_date = datetime.now() + timedelta(days=30*i)
            end_date = start_date + timedelta(days=30)
            
            partition_name = f"submissions_{start_date.strftime('%Y_%m')}"
            
            sql = f"""
            CREATE TABLE IF NOT EXISTS {partition_name} 
            PARTITION OF submissions
            FOR VALUES FROM ('{start_date.date()}') TO ('{end_date.date()}');
            """
            
            with connection.cursor() as cursor:
                cursor.execute(sql)
            
            self.stdout.write(f'✅ 建立分區: {partition_name}')
```

---

## 效能對比

### 主表資料量變化

| 策略 | 主表大小 | 查詢效能 | 實作複雜度 |
|------|---------|---------|-----------|
| 無優化 | 100% (所有資料) | 慢 | - |
| 時間範圍限制 | 100% (但只查 10-20%) | 快 70% | 低 ⭐ |
| 資料歸檔 | 10-20% (熱資料) | 快 5-10x | 中 ⭐⭐ |
| 資料分區 | 100% (分散存放) | 快 3-5x | 高 ⭐⭐⭐ |

### 查詢效能比較

假設總資料量 100 萬筆，每次考試 2000 筆：

| 場景 | 無優化 | 時間限制 | 歸檔 | 分區 |
|------|--------|---------|------|------|
| 查詢最近提交 | 掃描 100 萬 | 掃描 10 萬 | 掃描 5 萬 | 掃描當前分區 |
| 查詢時間 | 2-5 秒 | 0.3-0.5 秒 | 0.1-0.2 秒 | 0.1-0.2 秒 |
| 索引大小 | 大 | 大 | 小 | 中 |

---

## 實作建議

### 立即實作（本週）
```bash
# 1. 加入時間範圍過濾
# 修改 ViewSet 和前端

# 2. 測試效能改善
python manage.py shell < scripts/analyze_submission_queries.py
```

### 短期實作（1-2 週）
```bash
# 1. 建立歸檔表 migration
python manage.py makemigrations

# 2. 執行 migration
python manage.py migrate

# 3. 手動執行第一次歸檔
python manage.py archive_old_submissions --days=90 --batch-size=1000

# 4. 設定定期任務
# 在 Celery Beat 中設定每週執行
```

### 中期實作（1-2 個月）
- 監控資料增長速度
- 評估是否需要資料分區
- 持續優化歸檔策略

---

## 監控指標

實作後需要監控：

1. **主表大小**
   ```sql
   SELECT pg_size_pretty(pg_total_relation_size('submissions'));
   ```

2. **查詢效能**
   - 平均回應時間
   - P95 回應時間

3. **資料增長速度**
   ```sql
   SELECT DATE(created_at), COUNT(*) 
   FROM submissions 
   GROUP BY DATE(created_at) 
   ORDER BY DATE(created_at) DESC 
   LIMIT 30;
   ```

4. **歸檔狀態**
   - 主表 vs 歸檔表的資料量
   - 歸檔任務執行狀態

---

## 總結

### 推薦方案組合

**階段 1（立即）**: 時間範圍限制
- 實作簡單
- 立即見效
- 風險低

**階段 2（短期）**: 資料歸檔
- 長期最佳方案
- 持續保持主表輕量
- 成本效益高

**階段 3（視需求）**: 資料分區
- 只在資料量極大時考慮
- 適合無法刪除歷史資料的場景

這樣的組合可以：
- ✅ 立即改善 70-80% 效能
- ✅ 長期保持系統輕量
- ✅ 控制實作複雜度
- ✅ 保留歷史資料可查詢性
