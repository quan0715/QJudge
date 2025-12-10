"""
分析 Submission API 查詢性能的診斷腳本

用途:
1. 檢查資料庫索引使用情況
2. 分析慢查詢
3. 測試不同查詢場景的性能

執行方式:
    python manage.py shell < scripts/analyze_submission_queries.py

或在 Django shell 中:
    from scripts.analyze_submission_queries import run_analysis
    run_analysis()
"""

import time
from django.db import connection, reset_queries
from django.conf import settings
from apps.submissions.models import Submission
from tabulate import tabulate


def analyze_query_plan(queryset, description=""):
    """分析 SQL 查詢計畫"""
    sql, params = queryset.query.sql_with_params()
    
    print(f"\n{'='*80}")
    print(f"查詢場景: {description}")
    print(f"{'='*80}")
    
    # 顯示生成的 SQL
    print(f"\n生成的 SQL:")
    print(f"{sql}\n")
    
    # 執行 EXPLAIN ANALYZE（僅在 PostgreSQL）
    if 'postgresql' in settings.DATABASES['default']['ENGINE']:
        with connection.cursor() as cursor:
            explain_sql = f"EXPLAIN ANALYZE {sql}"
            cursor.execute(explain_sql, params)
            results = cursor.fetchall()
            
            print("PostgreSQL EXPLAIN ANALYZE 結果:")
            print("-" * 80)
            for row in results:
                print(row[0])
            print("-" * 80)


def test_query_performance(queryset, description="", iterations=3):
    """測試查詢性能"""
    times = []
    
    for i in range(iterations):
        reset_queries()
        start_time = time.time()
        
        # 執行查詢並強制 evaluation
        list(queryset)
        
        end_time = time.time()
        elapsed = (end_time - start_time) * 1000  # 轉換為毫秒
        times.append(elapsed)
    
    avg_time = sum(times) / len(times)
    min_time = min(times)
    max_time = max(times)
    
    print(f"\n查詢場景: {description}")
    print(f"  平均時間: {avg_time:.2f} ms")
    print(f"  最快時間: {min_time:.2f} ms")
    print(f"  最慢時間: {max_time:.2f} ms")
    print(f"  查詢數量: {len(connection.queries)}")
    
    if avg_time > 500:
        print(f"  ⚠️  警告: 查詢時間超過 500ms！")
    elif avg_time > 200:
        print(f"  ⚡ 注意: 查詢時間較慢")
    else:
        print(f"  ✅ 性能良好")
    
    return avg_time


def check_database_indexes():
    """檢查資料庫索引"""
    print(f"\n{'='*80}")
    print("資料庫索引檢查")
    print(f"{'='*80}")
    
    with connection.cursor() as cursor:
        # PostgreSQL: 列出 submissions 表的所有索引
        if 'postgresql' in settings.DATABASES['default']['ENGINE']:
            cursor.execute("""
                SELECT 
                    indexname,
                    indexdef
                FROM pg_indexes
                WHERE tablename = 'submissions'
                ORDER BY indexname;
            """)
            
            results = cursor.fetchall()
            print("\n目前的索引:")
            for idx_name, idx_def in results:
                print(f"\n  索引名稱: {idx_name}")
                print(f"  定義: {idx_def}")
        
        # 檢查索引使用統計
        if 'postgresql' in settings.DATABASES['default']['ENGINE']:
            cursor.execute("""
                SELECT 
                    schemaname,
                    tablename,
                    indexname,
                    idx_scan as index_scans,
                    idx_tup_read as tuples_read,
                    idx_tup_fetch as tuples_fetched
                FROM pg_stat_user_indexes
                WHERE tablename = 'submissions'
                ORDER BY idx_scan DESC;
            """)
            
            results = cursor.fetchall()
            print("\n\n索引使用統計:")
            headers = ['Schema', 'Table', 'Index', 'Scans', 'Tuples Read', 'Tuples Fetched']
            print(tabulate(results, headers=headers, tablefmt='grid'))


def check_table_statistics():
    """檢查表統計資訊"""
    print(f"\n{'='*80}")
    print("表統計資訊")
    print(f"{'='*80}")
    
    # 總記錄數
    total_count = Submission.objects.count()
    print(f"\n總提交數: {total_count:,}")
    
    # 按 source_type 分組
    from django.db.models import Count
    source_type_stats = Submission.objects.values('source_type').annotate(count=Count('id'))
    print("\n按來源類型分組:")
    for stat in source_type_stats:
        print(f"  {stat['source_type']}: {stat['count']:,}")
    
    # 按 status 分組
    status_stats = Submission.objects.values('status').annotate(count=Count('id'))
    print("\n按狀態分組:")
    for stat in status_stats:
        print(f"  {stat['status']}: {stat['count']:,}")
    
    # 最近的提交
    recent_submission = Submission.objects.order_by('-created_at').first()
    if recent_submission:
        print(f"\n最近提交時間: {recent_submission.created_at}")
    
    # 資料表大小（PostgreSQL）
    if 'postgresql' in settings.DATABASES['default']['ENGINE']:
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT 
                    pg_size_pretty(pg_total_relation_size('submissions')) as total_size,
                    pg_size_pretty(pg_relation_size('submissions')) as table_size,
                    pg_size_pretty(pg_total_relation_size('submissions') - pg_relation_size('submissions')) as index_size
            """)
            total_size, table_size, index_size = cursor.fetchone()
            print(f"\n資料表大小:")
            print(f"  總大小: {total_size}")
            print(f"  表大小: {table_size}")
            print(f"  索引大小: {index_size}")


def run_performance_tests():
    """執行各種查詢場景的性能測試"""
    print(f"\n{'='*80}")
    print("查詢性能測試")
    print(f"{'='*80}")
    
    test_cases = [
        {
            'description': '場景 1: 未優化 - 載入所有欄位（包含 code）',
            'queryset': Submission.objects.all()[:20]
        },
        {
            'description': '場景 2: 優化 - 使用 select_related',
            'queryset': Submission.objects.select_related('user', 'problem', 'contest')[:20]
        },
        {
            'description': '場景 3: 優化 - 使用 select_related + only()',
            'queryset': Submission.objects.select_related('user', 'problem', 'contest').only(
                'id', 'user__username', 'problem__title', 'status', 'score', 
                'exec_time', 'created_at', 'language', 'source_type'
            )[:20]
        },
        {
            'description': '場景 4: Practice 提交（常見查詢）',
            'queryset': Submission.objects.filter(
                source_type='practice', 
                is_test=False
            ).select_related('user', 'problem').only(
                'id', 'user__username', 'problem__title', 'status', 
                'score', 'exec_time', 'created_at'
            )[:20]
        },
        {
            'description': '場景 5: 按狀態過濾 + 排序',
            'queryset': Submission.objects.filter(
                status='AC',
                source_type='practice'
            ).select_related('user', 'problem').only(
                'id', 'user__username', 'problem__title', 'status', 
                'score', 'exec_time', 'created_at'
            ).order_by('-created_at')[:20]
        },
        {
            'description': '場景 6: 按題目過濾',
            'queryset': Submission.objects.filter(
                problem_id=1
            ).select_related('user', 'problem').only(
                'id', 'user__username', 'status', 'score', 
                'exec_time', 'created_at'
            ).order_by('-created_at')[:20]
        },
    ]
    
    results = []
    for test_case in test_cases:
        avg_time = test_query_performance(
            test_case['queryset'],
            test_case['description']
        )
        results.append({
            'scenario': test_case['description'].split(':')[1].strip(),
            'time': f"{avg_time:.2f} ms"
        })
    
    print(f"\n{'='*80}")
    print("性能測試總結")
    print(f"{'='*80}")
    print(tabulate(results, headers=['查詢場景', '平均時間'], tablefmt='grid'))


def generate_recommendations():
    """生成優化建議"""
    print(f"\n{'='*80}")
    print("優化建議")
    print(f"{'='*80}")
    
    recommendations = []
    
    # 檢查是否有建議的索引
    with connection.cursor() as cursor:
        if 'postgresql' in settings.DATABASES['default']['ENGINE']:
            cursor.execute("""
                SELECT indexname 
                FROM pg_indexes 
                WHERE tablename = 'submissions' 
                AND indexname IN (
                    'sub_src_test_created_idx',
                    'sub_contest_src_created_idx',
                    'sub_problem_created_idx',
                    'sub_status_created_idx',
                    'sub_user_created_idx'
                );
            """)
            existing_indexes = {row[0] for row in cursor.fetchall()}
    
    required_indexes = {
        'sub_src_test_created_idx': 'source_type + is_test + created_at',
        'sub_contest_src_created_idx': 'contest + source_type + created_at',
        'sub_problem_created_idx': 'problem + created_at',
        'sub_status_created_idx': 'status + created_at',
        'sub_user_created_idx': 'user + created_at',
    }
    
    missing_indexes = set(required_indexes.keys()) - existing_indexes
    
    if missing_indexes:
        print("\n⚠️  缺少以下建議的索引:")
        for idx in missing_indexes:
            print(f"   - {idx} ({required_indexes[idx]})")
        recommendations.append("新增建議的複合索引")
    else:
        print("\n✅ 所有建議的索引都已建立")
    
    # 檢查記錄數量
    total_count = Submission.objects.count()
    if total_count > 100000:
        print(f"\n⚠️  提交記錄數量較多 ({total_count:,} 筆)")
        recommendations.append("考慮實作資料歸檔策略")
    
    if recommendations:
        print("\n建議採取的行動:")
        for i, rec in enumerate(recommendations, 1):
            print(f"  {i}. {rec}")
    else:
        print("\n✅ 目前配置良好，無需額外優化")


def run_analysis():
    """執行完整分析"""
    print("\n" + "="*80)
    print("Submission API 查詢性能分析工具")
    print("="*80)
    
    # 確保 DEBUG 模式開啟以追蹤查詢
    if not settings.DEBUG:
        print("\n⚠️  警告: DEBUG 模式未開啟，某些分析功能可能無法使用")
        print("    請在測試環境中啟用 DEBUG = True")
    
    try:
        # 1. 檢查表統計
        check_table_statistics()
        
        # 2. 檢查索引
        check_database_indexes()
        
        # 3. 執行性能測試
        run_performance_tests()
        
        # 4. 生成建議
        generate_recommendations()
        
        print(f"\n{'='*80}")
        print("分析完成")
        print(f"{'='*80}\n")
        
    except Exception as e:
        print(f"\n❌ 分析過程發生錯誤: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == '__main__':
    # 檢查是否安裝 tabulate
    try:
        import tabulate
    except ImportError:
        print("請安裝 tabulate 套件: pip install tabulate")
        exit(1)
    
    run_analysis()
