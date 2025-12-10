#!/bin/bash

# E2E 測試環境管理腳本
# 用於啟動、停止和重置 E2E 測試環境

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.test.yml"

# 顏色輸出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 輔助函數
print_info() {
    echo -e "${BLUE}ℹ ${1}${NC}"
}

print_success() {
    echo -e "${GREEN}✓ ${1}${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ ${1}${NC}"
}

print_error() {
    echo -e "${RED}✗ ${1}${NC}"
}

# 啟動環境
start_env() {
    print_info "啟動 E2E 測試環境..."
    
    cd "$ROOT_DIR"
    
    # 停止現有容器
    print_info "停止現有容器..."
    docker-compose -f "$COMPOSE_FILE" down -v 2>/dev/null || true
    
    # 啟動服務
    print_info "啟動 Docker Compose 服務..."
    docker-compose -f "$COMPOSE_FILE" up -d
    
    # 等待服務就緒
    print_info "等待服務就緒..."
    
    # 等待後端
    echo -n "等待後端啟動"
    MAX_ATTEMPTS=60
    ATTEMPT=0
    
    while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
        if curl -f http://localhost:8001/api/v1/ >/dev/null 2>&1; then
            echo ""
            print_success "後端已就緒"
            break
        fi
        echo -n "."
        sleep 2
        ATTEMPT=$((ATTEMPT + 1))
    done
    
    if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
        print_error "後端啟動超時"
        print_warning "查看後端日誌："
        docker-compose -f "$COMPOSE_FILE" logs --tail=50 backend_test
        exit 1
    fi
    
    # 等待前端
    echo -n "等待前端啟動"
    ATTEMPT=0
    
    while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
        if curl -f http://localhost:5174/ >/dev/null 2>&1; then
            echo ""
            print_success "前端已就緒"
            break
        fi
        echo -n "."
        sleep 2
        ATTEMPT=$((ATTEMPT + 1))
    done
    
    if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
        print_error "前端啟動超時"
        print_warning "查看前端日誌："
        docker-compose -f "$COMPOSE_FILE" logs --tail=50 frontend_test
        exit 1
    fi
    
    print_success "E2E 測試環境已啟動！"
    echo ""
    print_info "服務地址："
    echo "  前端: http://localhost:5174"
    echo "  後端: http://localhost:8001"
    echo ""
}

# 停止環境
stop_env() {
    print_info "停止 E2E 測試環境..."
    
    cd "$ROOT_DIR"
    docker-compose -f "$COMPOSE_FILE" down -v
    
    print_success "E2E 測試環境已停止"
}

# 重置環境（重新建立資料）
reset_env() {
    print_info "重置 E2E 測試環境..."
    
    cd "$ROOT_DIR"
    
    # 停止並清理
    docker-compose -f "$COMPOSE_FILE" down -v
    
    # 重新啟動
    start_env
}

# 查看日誌
logs() {
    SERVICE=${1:-}
    
    cd "$ROOT_DIR"
    
    if [ -z "$SERVICE" ]; then
        print_info "顯示所有服務日誌..."
        docker-compose -f "$COMPOSE_FILE" logs -f
    else
        print_info "顯示 $SERVICE 日誌..."
        docker-compose -f "$COMPOSE_FILE" logs -f "$SERVICE"
    fi
}

# 查看狀態
status() {
    cd "$ROOT_DIR"
    
    print_info "E2E 測試環境狀態："
    docker-compose -f "$COMPOSE_FILE" ps
}

# 執行命令
exec_cmd() {
    SERVICE=$1
    shift
    COMMAND="$@"
    
    cd "$ROOT_DIR"
    
    print_info "在 $SERVICE 中執行命令: $COMMAND"
    docker-compose -f "$COMPOSE_FILE" exec "$SERVICE" $COMMAND
}

# 顯示幫助
show_help() {
    cat << EOF
E2E 測試環境管理腳本

使用方式:
    $0 <command> [options]

命令:
    start       啟動 E2E 測試環境
    stop        停止 E2E 測試環境
    reset       重置環境（停止、清理、重新啟動）
    status      顯示服務狀態
    logs [服務] 顯示日誌（可選擇特定服務）
    exec <服務> <命令>  在服務容器中執行命令
    help        顯示此幫助訊息

範例:
    $0 start                              # 啟動環境
    $0 logs backend_test                  # 查看後端日誌
    $0 exec backend_test python manage.py shell  # 執行 Django shell
    $0 reset                              # 重置環境

服務名稱:
    - postgres_test    PostgreSQL 資料庫
    - redis_test       Redis
    - backend_test     Django 後端
    - celery_test      Celery Worker
    - frontend_test    React 前端

EOF
}

# 主邏輯
COMMAND=${1:-help}

case "$COMMAND" in
    start)
        start_env
        ;;
    stop)
        stop_env
        ;;
    reset)
        reset_env
        ;;
    status)
        status
        ;;
    logs)
        logs "${2:-}"
        ;;
    exec)
        if [ $# -lt 3 ]; then
            print_error "exec 命令需要服務名稱和命令"
            echo "使用方式: $0 exec <服務> <命令>"
            exit 1
        fi
        exec_cmd "$2" "${@:3}"
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "未知命令: $COMMAND"
        echo ""
        show_help
        exit 1
        ;;
esac
