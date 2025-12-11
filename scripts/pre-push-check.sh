#!/bin/bash
# Pre-push check script
# 在 push 前執行 TypeScript 檢查和單元測試

set -e

echo "🔍 執行 pre-push 檢查..."

# 進入前端目錄
cd "$(dirname "$0")/../frontend"

echo "📝 TypeScript 類型檢查..."
npx tsc --noEmit

echo "🧪 執行單元測試..."
npm run test:run

echo "✅ 所有檢查通過！"
