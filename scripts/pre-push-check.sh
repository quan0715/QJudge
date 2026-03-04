#!/bin/bash
# Pre-push 檢查腳本
# 在 push 前確保前端 lint、build、E2E 與 Docker 配置正常

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

if npx tsc -b --noEmit 2>/dev/null || npx tsc --noEmit; then
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

if docker compose config -q 2>/dev/null || docker-compose config -q 2>/dev/null; then
    print_success "Docker Compose 配置有效"
else
    print_error "Docker Compose 配置無效"
    exit 1
fi

# ==================== 5. 前端 E2E 檢查 ====================
if [ "$SKIP_E2E" = "true" ]; then
    print_warning "已跳過 E2E 檢查（SKIP_E2E=true）"
else
    # 停止 dev 環境避免 port 衝突（dev 和 test 共用 port 如 8001）
    DEV_WAS_RUNNING=false
    if docker compose -f "$PROJECT_ROOT/docker-compose.dev.yml" ps --status running -q 2>/dev/null | grep -q .; then
        DEV_WAS_RUNNING=true
        print_step "暫停 dev 環境以避免 port 衝突..."
        docker compose -f "$PROJECT_ROOT/docker-compose.dev.yml" stop
    fi

    print_step "執行前端 E2E 測試..."
    cd frontend
    E2E_RESULT=0
    if E2E_CLEANUP=true npm run test:e2e; then
        print_success "前端 E2E 測試通過"
    else
        print_error "前端 E2E 測試失敗"
        E2E_RESULT=1
    fi
    cd "$PROJECT_ROOT"

    # 恢復 dev 環境
    if [ "$DEV_WAS_RUNNING" = "true" ]; then
        print_step "恢復 dev 環境..."
        docker compose -f "$PROJECT_ROOT/docker-compose.dev.yml" start
    fi

    if [ "$E2E_RESULT" -ne 0 ]; then
        exit 1
    fi
fi

# ==================== 6. Docker 環境啟動測試（可選）====================
# if [ "$SKIP_DOCKER_START" != "true" ]; then
#     print_step "測試 Docker 環境啟動..."
    
#     # 嘗試啟動核心服務（postgres, redis）
#     if docker compose up -d postgres redis 2>/dev/null || docker-compose up -d postgres redis 2>/dev/null; then
#         # 等待服務就緒
#         sleep 5
        
#         # 檢查服務健康狀態
#         if docker compose ps 2>/dev/null | grep -q "healthy\|running" || \
#            docker-compose ps 2>/dev/null | grep -q "Up"; then
#             print_success "Docker 核心服務啟動正常"
#         else
#             print_warning "Docker 服務可能未完全就緒，但配置有效"
#         fi
#     else
#         print_warning "無法啟動 Docker 服務（可能 Docker 未運行），跳過此檢查"
#     fi
# fi

# ==================== 完成 ====================
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo -e "\n${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}       所有檢查通過！ (${DURATION}s)         ${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}\n"

exit 0
