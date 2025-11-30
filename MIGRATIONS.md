# Migration 管理說明

## 問題解決記錄

### 循環依賴錯誤（已修復）

**問題**：`CircularDependencyError` 發生在 contests 和 problems 的 migrations 之間

**原因**：
- squashed migration (`0001_squashed_initial.py`) 依賴 `contests.0006`
- contests 的某些 migration 可能依賴舊的 problems migrations
- 造成循環依賴

**解決方案**：
1. 刪除舊的 migration 文件（0001-0006）
2. 將 squashed migration 重命名為 `0001_initial.py`
3. 修改依賴為 `contests.0001_initial` 而非 `contests.0006`
4. 移除 `replaces` 標記，添加 `initial = True`

**執行命令**：
```bash
# 1. 刪除舊 migrations（已執行）
rm backend/apps/problems/migrations/0001_initial.py
rm backend/apps/problems/migrations/0002_initial.py
rm backend/apps/problems/migrations/0003_add_language_support.py
rm backend/apps/problems/migrations/0004_problem_contest_problem_is_contest_only_and_more.py
rm backend/apps/problems/migrations/0005_add_display_id.py
rm backend/apps/problems/migrations/0006_allow_blank_slug.py

# 2. 重命名 squashed migration（已執行）
mv backend/apps/problems/migrations/0001_squashed_initial.py \
   backend/apps/problems/migrations/0001_initial.py
```

## 新環境設置

對於全新的環境（或重置資料庫），直接執行：

```bash
# 開發environment
docker exec oj_backend_dev python manage.py migrate

# 測試環境
docker-compose -f docker-compose.test.yml run --rm backend_test
```

## 注意事項

⚠️ **已有資料庫的環境**：如果您的資料庫已經應用了舊的 migrations（0001-0006），Django 可能會檢測到衝突。

**解決方法**：
1. 備份資料庫
2. 手動標記 migration 為已應用：
   ```bash
   docker exec oj_backend_dev python manage.py migrate --fake problems zero
   docker exec oj_backend_dev python manage.py migrate problems
   ```
3. 或重置資料庫（開發環境）：
   ```bash
   docker-compose down -v
   docker-compose up -d
   ```

## Migration 最佳實踐

1. **定期 squash**：當 migration 文件過多時（>10個），考慮 squash
2. **謹慎處理依賴**：避免跨 app 的複雜依賴
3. **測試**：在應用 migration 前，在測試環境測試
4. **版本控制**：所有 migration 文件都應納入版本控制
