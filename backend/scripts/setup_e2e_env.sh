#!/bin/bash

# E2E 測試環境資料注入腳本
# 此腳本在 backend_test 容器啟動時執行

set -e

echo "========================================="
echo "🚀 開始設置 E2E 測試環境"
echo "========================================="

# 1. 載入 fixtures（如果有的話）
echo ""
echo "📦 載入 fixtures..."
if [ -f /app/fixtures/e2e_test_data.json ]; then
    python manage.py loaddata /app/fixtures/e2e_test_data.json || echo "⚠️  Fixtures 載入失敗或為空"
else
    echo "⚠️  未找到 fixtures 檔案，跳過"
fi

# 2. 執行 seed 命令建立測試資料
echo ""
echo "🌱 建立測試資料..."
python manage.py seed_e2e_data

# 3. 驗證資料完整性
echo ""
echo "✅ 驗證資料完整性..."
python manage.py shell << EOF
from django.contrib.auth import get_user_model
from apps.problems.models import Problem
from apps.contests.models import Contest

User = get_user_model()

user_count = User.objects.count()
problem_count = Problem.objects.count()
contest_count = Contest.objects.count()

print(f"  - 用戶數量: {user_count}")
print(f"  - 題目數量: {problem_count}")
print(f"  - 競賽數量: {contest_count}")

if user_count < 3:
    print("⚠️  警告：測試用戶數量不足")
    exit(1)

if problem_count < 2:
    print("⚠️  警告：測試題目數量不足")
    exit(1)

print("✓ 資料驗證完成")
EOF

echo ""
echo "========================================="
echo "✨ E2E 測試環境設置完成"
echo "========================================="
echo ""
