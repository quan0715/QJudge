# 執行測試指南

## 🚀 快速開始

```bash
cd backend

# 執行所有 submission 測試
pytest apps/submissions/tests/ -v

# 執行特定測試
pytest apps/submissions/tests/test_performance.py -v
pytest apps/submissions/tests/test_date_filtering.py -v
```

## 📋 測試說明

### test_performance.py
測試 API 性能優化：
- 查詢數量（避免 N+1）
- 回應時間
- 回應大小
- 資料完整性

### test_date_filtering.py
測試日期範圍過濾：
- 預設 3 個月過濾
- 查看所有歷史
- 自訂日期範圍

## 🔧 常見問題

### 問題 1: 測試資料庫已存在
```
psycopg2.errors.DuplicateDatabase: database "test_postgres" already exists
```

**解決**:
```bash
psql -U postgres -c "DROP DATABASE IF EXISTS test_postgres;"
```

### 問題 2: Problem model 欄位錯誤
```
TypeError: Problem() got unexpected keyword arguments: 'description'
```

**已修復**: 測試已更新，移除不存在的欄位。

## ✅ 預期結果

所有測試應該通過：
```
apps/submissions/tests/test_performance.py::SubmissionAPIPerformanceTestCase::test_submission_list_query_count PASSED
apps/submissions/tests/test_performance.py::SubmissionAPIPerformanceTestCase::test_submission_list_response_time PASSED
apps/submissions/tests/test_performance.py::SubmissionAPIPerformanceTestCase::test_submission_list_response_size PASSED
apps/submissions/tests/test_performance.py::SubmissionAPIPerformanceTestCase::test_submission_list_has_necessary_fields PASSED
apps/submissions/tests/test_performance.py::SubmissionAPIPerformanceTestCase::test_submission_list_with_filters PASSED
apps/submissions/tests/test_performance.py::SubmissionAPIPerformanceTestCase::test_submission_detail_includes_code PASSED
apps/submissions/tests/test_performance.py::SubmissionAPIPerformanceTestCase::test_practice_submissions_default_filter PASSED

apps/submissions/tests/test_date_filtering.py::DateRangeFilteringTestCase::test_default_returns_only_recent_submissions PASSED
apps/submissions/tests/test_date_filtering.py::DateRangeFilteringTestCase::test_include_all_returns_all_submissions PASSED
apps/submissions/tests/test_date_filtering.py::DateRangeFilteringTestCase::test_custom_date_range_filter PASSED
```

## 📊 執行 Migration

測試通過後，執行 migration：

```bash
# 檢查 migration
python manage.py showmigrations submissions

# 執行 migration
python manage.py migrate submissions

# 驗證索引建立
python manage.py dbshell
\d submissions
```

## 🎯 下一步

1. ✅ 測試通過
2. ✅ 執行 migration
3. ✅ 部署到 production
4. ✅ 監控效能改善
