#!/bin/bash
# Pre-push 檢查腳本
# 在 push 前確保前端 lint、typecheck、build 與 Docker 配置正常

set -e

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 輔助函數
print_step() {
    echo -e "\n${BLUE}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✔ $1${NC}"
}

print_error() {
    echo -e "${RED}✖ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# 計時開始
START_TIME=$(date +%s)

echo -e "\n${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}       Pre-push 檢查開始              ${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"

# 取得腳本所在目錄的專案根目錄
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# ==================== 1. 前端 Lint 檢查 ====================
print_step "檢查前端 ESLint..."

cd frontend
if npm run lint; then
    print_success "ESLint 檢查通過"
else
    print_error "ESLint 檢查失敗"
    exit 1
fi

# ==================== 2. TypeScript 編譯檢查 ====================
print_step "檢查 TypeScript 編譯..."

run_typescript_check() {
    if npm run typecheck >/tmp/qjudge-tsc-build.log 2>&1; then
        cat /tmp/qjudge-tsc-build.log
        return 0
    fi
    cat /tmp/qjudge-tsc-build.log
    return 1
}

if run_typescript_check; then
    print_success "TypeScript 編譯檢查通過"
else
    print_error "TypeScript 編譯失敗"
    exit 1
fi

# ==================== 3. 前端 Build 檢查 ====================
print_step "檢查前端 Build..."

if npm run build; then
    print_success "前端 Build 成功"
else
    print_error "前端 Build 失敗"
    exit 1
fi

cd "$PROJECT_ROOT"

# ==================== 4. Docker Compose 配置驗證 ====================
print_step "驗證 Docker Compose 配置..."

if QJUDGE_VERSION=ci docker compose --project-directory deploy --env-file deploy/.env.example \
    -f deploy/compose.yml -f deploy/compose.build.yml config --quiet; then
    print_success "Docker Compose 配置有效"
else
    print_error "Docker Compose 配置無效"
    exit 1
fi

# ==================== 5. 前端 E2E 檢查（已停用）====================
# E2E 測試需啟停 Docker 環境、耗時 4-5 分鐘，不適合放在 pre-push gate。
# 請在需要時手動執行：cd frontend && npm run test:e2e
print_warning "已跳過 E2E 檢查（請手動執行 npm run test:e2e）"

# ==================== 完成 ====================
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo -e "\n${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}       所有檢查通過！ (${DURATION}s)         ${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}\n"

exit 0
