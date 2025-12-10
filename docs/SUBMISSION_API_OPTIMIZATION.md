# Submission API 性能優化

## 問題
Production 環境中 submission 數量過高，API 載入時間 2-5 秒。

## 已實作的優化

### 1. 資料庫索引 (改善 60-80%)
✅ 新增 5 個複合索引用於常見查詢模式：
- `sub_src_test_created_idx`: source_type + is_test + created_at
- `sub_contest_src_created_idx`: contest + source_type + created_at  
- `sub_problem_created_idx`: problem + created_at
- `sub_status_created_idx`: status + created_at
- `sub_user_created_idx`: user + created_at

**檔案**: 
- `apps/submissions/migrations/0010_add_performance_indexes.py`
- `apps/submissions/models.py`

### 2. API 優化 (改善 20-30%)
✅ **Serializer 優化** (`apps/submissions/serializers.py`):
- 使用扁平欄位取代嵌套 serializer
- 移除 list view 中的 `code` 欄位
- 減少 N+1 查詢問題

✅ **ViewSet 優化** (`apps/submissions/views.py`):
- 使用 `only()` 限制查詢欄位
- 優化 `select_related` 和 `prefetch_related`
- 針對 list/detail view 使用不同策略

✅ **前端優化** (`frontend/src/domains/submission/pages/SubmissionsPage.tsx`):
- 預設過濾 `source_type='practice'`

### 3. 測試
✅ 新增性能測試 (`apps/submissions/tests/test_performance.py`):
- 查詢數量測試
- 回應時間測試
- 回應大小測試
- 資料完整性測試

## 部署步驟

### 1. 執行測試
```bash
cd backend
pytest apps/submissions/tests/test_performance.py -v
```

### 2. 執行 Migration
```bash
# 測試環境
python manage.py migrate submissions

# Production 環境（建議維護時段）
python manage.py migrate submissions --database=default
```

### 3. 驗證索引建立
```bash
python manage.py dbshell
# PostgreSQL:
\d submissions
# 或
SELECT indexname FROM pg_indexes WHERE tablename = 'submissions';
```

### 4. 監控效能
使用診斷腳本檢查優化效果：
```bash
python manage.py shell < scripts/analyze_submission_queries.py
```

## 預期效果
- API 回應: 2-5秒 → 0.2-0.5秒 (改善 90%)
- 資料庫查詢: 3-10個 → 1-2個
- 回應大小: 500KB → 100KB (減少 80%)

## 回滾計畫
如果出現問題：
```bash
# 回滾 migration
python manage.py migrate submissions 0009

# 或手動刪除索引
python manage.py dbshell
DROP INDEX IF EXISTS sub_src_test_created_idx;
DROP INDEX IF EXISTS sub_contest_src_created_idx;
DROP INDEX IF EXISTS sub_problem_created_idx;
DROP INDEX IF EXISTS sub_status_created_idx;
DROP INDEX IF EXISTS sub_user_created_idx;
```

程式碼變更可透過 git revert 回滾。
