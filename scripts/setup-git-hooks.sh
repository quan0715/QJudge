#!/bin/bash
# 設置 Git Hooks
# 執行一次即可安裝所有 git hooks

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
GIT_HOOKS_DIR="$PROJECT_ROOT/.git/hooks"

echo "🔧 設置 Git Hooks..."

# 確保 hooks 目錄存在
mkdir -p "$GIT_HOOKS_DIR"

# 建立 pre-push hook
cat > "$GIT_HOOKS_DIR/pre-push" << 'EOF'
#!/bin/bash
# Git pre-push hook
# 在 push 前執行檢查腳本

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# 執行 pre-push 檢查腳本
if [ -f "$PROJECT_ROOT/scripts/pre-push-check.sh" ]; then
    bash "$PROJECT_ROOT/scripts/pre-push-check.sh"
else
    echo "⚠️  找不到 pre-push-check.sh 腳本"
    exit 1
fi
EOF

chmod +x "$GIT_HOOKS_DIR/pre-push"
chmod +x "$SCRIPT_DIR/pre-push-check.sh"

echo "✅ Git hooks 設置完成！"
echo ""
echo "已安裝的 hooks:"
echo "  - pre-push: 在 push 前檢查 lint、build、E2E 和 Docker 配置"
echo ""
echo "使用方式:"
echo "  正常 push 即會自動執行檢查"
echo "  跳過 E2E: SKIP_E2E=true git push"
echo "  跳過 Docker 啟動測試: SKIP_DOCKER_START=true git push"
echo "  跳過所有檢查: git push --no-verify"
