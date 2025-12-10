#!/bin/bash
# 修復測試資料庫問題

echo "清理測試資料庫..."

# 方法 1: 使用 Django 的測試資料庫管理
python3 manage.py test --keepdb --settings=config.settings.test 2>&1 | head -5

# 如果上面失敗，手動刪除測試資料庫
if [ $? -ne 0 ]; then
    echo ""
    echo "嘗試手動刪除測試資料庫..."
    
    # 從環境變數或設定檔取得資料庫資訊
    DB_NAME=${DB_NAME:-postgres}
    DB_USER=${DB_USER:-postgres}
    DB_HOST=${DB_HOST:-localhost}
    DB_PORT=${DB_PORT:-5432}
    
    # 刪除測試資料庫
    PGPASSWORD=${DB_PASSWORD} psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} << SQL
DROP DATABASE IF EXISTS test_postgres;
SQL
    
    if [ $? -eq 0 ]; then
        echo "✅ 測試資料庫已刪除"
    else
        echo "⚠️  無法自動刪除，請手動執行："
        echo "   psql -U postgres -c 'DROP DATABASE test_postgres;'"
    fi
fi

echo ""
echo "現在可以執行測試："
echo "  pytest apps/submissions/tests/ -v"
