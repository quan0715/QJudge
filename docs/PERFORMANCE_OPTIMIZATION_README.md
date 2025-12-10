# Submission API 性能優化文件總覽

本目錄包含 Submission API 性能優化相關的完整文件和工具。

## 📋 文件清單

### 1. 性能分析報告
**檔案**: `SUBMISSION_API_PERFORMANCE_ANALYSIS.md`

**內容**:
- 當前實作分析
- 性能瓶頸識別
- 資料庫查詢問題
- 優化建議（按優先級分類）
- 預期效果評估

**適用對象**: 技術主管、後端開發者

### 2. 優化實作指南
**檔案**: `SUBMISSION_API_OPTIMIZATION_GUIDE.md`

**內容**:
- 逐步實作說明
- 完整程式碼範例
- 資料庫 migration 腳本
- 前後端優化方案
- 測試驗證步驟
- 回滾計畫

**適用對象**: 開發者、DevOps 工程師

### 3. 查詢分析腳本
**檔案**: `../backend/scripts/analyze_submission_queries.py`

**內容**:
- SQL 查詢計畫分析
- 索引使用情況檢查
- 性能基準測試
- 自動化建議生成

**適用對象**: DBA、後端開發者

## 🚀 快速開始

### 步驟 1: 診斷當前問題

```bash
cd backend

# 安裝必要的套件
pip install tabulate

# 執行診斷腳本
python manage.py shell < scripts/analyze_submission_queries.py

# 或在 Django shell 中
python manage.py shell
>>> from scripts.analyze_submission_queries import run_analysis
>>> run_analysis()
```

這將生成：
- 資料表統計資訊
- 索引使用情況
- 各種查詢場景的性能測試結果
- 具體的優化建議

### 步驟 2: 閱讀分析報告

閱讀 `SUBMISSION_API_PERFORMANCE_ANALYSIS.md` 了解：
- 問題根源
- 為什麼載入很慢
- 優化的優先順序

### 步驟 3: 實作優化

按照 `SUBMISSION_API_OPTIMIZATION_GUIDE.md` 的步驟：

#### 高優先級（立即實作）

1. **新增資料庫索引** (預計改善 60-80%)
   ```bash
   cd backend
   python manage.py makemigrations submissions --empty -n add_performance_indexes
   # 編輯 migration 檔案（參考指南）
   python manage.py migrate
   ```

2. **優化 Serializer** (預計改善 20-30%)
   - 修改 `backend/apps/submissions/serializers.py`
   - 使用精簡欄位而非嵌套 serializer

3. **ViewSet 使用 only()** (預計改善 10-20%)
   - 修改 `backend/apps/submissions/views.py`
   - 只載入必要欄位

4. **前端預設過濾**
   - 修改 `frontend/src/domains/submission/pages/SubmissionsPage.tsx`
   - 預設 `source_type='practice'`

#### 中優先級（短期實作）

5. **實作 React Query** (改善使用者體驗)
   ```bash
   cd frontend
   npm install @tanstack/react-query
   ```

6. **後端快取** (改善重複查詢)
   - Redis 快取 30-60 秒

### 步驟 4: 驗證效果

```bash
# 再次執行診斷腳本
python manage.py shell < scripts/analyze_submission_queries.py

# 比較優化前後的數據
```

## 📊 預期效果

### 優化前 (當前狀態)
- API 回應時間: 2-5 秒
- 資料庫查詢: 3-10 個查詢
- 回應大小: ~500KB (20 筆)
- 前端渲染: 1-2 秒

### 優化後 (高優先級完成)
- API 回應時間: 0.2-0.5 秒 (改善 80-90%)
- 資料庫查詢: 1-2 個查詢
- 回應大小: ~100KB (精簡 80%)
- 前端渲染: 0.3-0.5 秒

### 優化後 (中優先級完成)
- API 回應時間: 0.05-0.1 秒 (快取命中)
- 重複請求幾乎即時
- 更好的使用者體驗（React Query）

## 🎯 優化重點整理

### 資料庫層
- ✅ **新增複合索引**: 針對常見查詢組合
  - `source_type + is_test + created_at`
  - `contest + source_type + created_at`
  - `problem + created_at`
  - `status + created_at`

### 後端 API 層
- ✅ **使用 select_related()**: 避免 N+1 查詢
- ✅ **使用 only()**: 只載入必要欄位
- ✅ **精簡 Serializer**: 移除不必要的嵌套
- ⚡ **實作快取**: Redis 快取熱門查詢

### 前端層
- ✅ **預設過濾**: 只顯示 practice 提交
- ⚡ **React Query**: 自動快取和重新驗證
- ⚡ **Prefetch**: 預載入下一頁
- 💡 **虛擬滾動**: 處理大量資料（未來）

## 🔍 診斷工具使用

### 分析腳本功能

```python
# 完整分析
run_analysis()

# 只檢查索引
check_database_indexes()

# 只檢查表統計
check_table_statistics()

# 只測試性能
run_performance_tests()

# 只生成建議
generate_recommendations()

# 分析特定查詢的執行計畫
from apps.submissions.models import Submission
queryset = Submission.objects.filter(source_type='practice')[:20]
analyze_query_plan(queryset, "Practice submissions")
```

### PostgreSQL 直接查詢

```sql
-- 檢查慢查詢
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE query LIKE '%submissions%'
ORDER BY mean_exec_time DESC
LIMIT 10;

-- 檢查索引使用
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename = 'submissions'
ORDER BY idx_scan DESC;

-- 檢查表大小
SELECT 
    pg_size_pretty(pg_total_relation_size('submissions')) as total_size,
    pg_size_pretty(pg_relation_size('submissions')) as table_size,
    pg_size_pretty(pg_indexes_size('submissions')) as indexes_size;
```

## 📝 實作檢查清單

### 準備階段
- [ ] 閱讀性能分析報告
- [ ] 執行診斷腳本，記錄當前性能基準
- [ ] 備份資料庫（production）

### 實作階段（高優先級）
- [ ] 建立並執行索引 migration
- [ ] 更新 Submission model Meta
- [ ] 優化 SubmissionListSerializer
- [ ] 更新 SubmissionViewSet.get_queryset()
- [ ] 前端加入預設 source_type 過濾

### 測試階段
- [ ] 本地環境測試
- [ ] 執行診斷腳本驗證改善
- [ ] 測試環境部署和驗證
- [ ] 壓力測試

### 部署階段
- [ ] 確認回滾計畫
- [ ] Production 部署（建議在低峰時段）
- [ ] 監控 API 回應時間
- [ ] 監控資料庫負載
- [ ] 監控錯誤率

### 後續階段（中優先級）
- [ ] 安裝 React Query
- [ ] 建立 useSubmissions hook
- [ ] 更新前端頁面使用 React Query
- [ ] 實作後端快取（如需要）

## 🚨 常見問題

### Q1: 為什麼建立索引後沒有改善？

**可能原因**:
1. PostgreSQL 沒有使用新索引（需要 ANALYZE）
   ```sql
   ANALYZE submissions;
   ```

2. 查詢條件不符合索引設計
   - 檢查 WHERE 條件順序
   - 確保使用了索引的前導欄位

3. 資料量太小，PostgreSQL 選擇全表掃描
   - 這在小資料集是正常的

### Q2: 如何確認索引是否被使用？

```python
from django.db import connection
from apps.submissions.models import Submission

# 執行查詢
list(Submission.objects.filter(source_type='practice', is_test=False)[:20])

# 查看 SQL
print(connection.queries[-1]['sql'])

# 使用 EXPLAIN
from scripts.analyze_submission_queries import analyze_query_plan
queryset = Submission.objects.filter(source_type='practice', is_test=False)[:20]
analyze_query_plan(queryset, "Test query")
```

### Q3: 優化後 API 變慢了怎麼辦？

1. 立即回滾變更
2. 檢查是否有 N+1 查詢問題
3. 確認 select_related/prefetch_related 正確使用
4. 查看 PostgreSQL 慢查詢日誌

### Q4: 前端快取導致資料不即時？

調整 React Query 設定:
```typescript
staleTime: 10000, // 減少到 10 秒
refetchInterval: 30000, // 每 30 秒自動重新載入
refetchOnWindowFocus: true, // 視窗聚焦時重新載入
```

## 📞 支援

如有問題，請：
1. 先查閱本文件和相關指南
2. 執行診斷腳本收集資訊
3. 查看 Django 和 PostgreSQL 日誌
4. 聯繫技術團隊並提供診斷結果

## 📚 延伸閱讀

- [Django Database Optimization](https://docs.djangoproject.com/en/stable/topics/db/optimization/)
- [PostgreSQL Performance Tips](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [React Query Best Practices](https://tkdodo.eu/blog/practical-react-query)
- [Web Performance Optimization](https://web.dev/fast/)

---

**最後更新**: 2025-12-10
**版本**: 1.0
**作者**: Backend Team
