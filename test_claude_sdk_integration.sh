#!/bin/bash

# Claude SDK Integration Test Script
# 用於驗證 Session 恢復與 AI Service 整合

set -e

# 顏色代碼
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 測試配置
BACKEND_URL="http://localhost:8000"
AI_SERVICE_URL="http://localhost:8001"
FRONTEND_SESSION_ID="test-session-$(date +%s)"

echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Claude SDK Integration 集成測試${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"

# Step 1: 檢查後端連接
echo -e "\n${YELLOW}[Step 1] 檢查後端連接...${NC}"
if curl -s "${BACKEND_URL}/api/v1/ai/sessions/" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ 後端已連接${NC}"
else
    echo -e "${RED}✗ 後端無法連接，請確保 Django 服務器運行中${NC}"
    echo "  啟動命令: python manage.py runserver"
    exit 1
fi

# Step 2: 檢查 AI Service 連接
echo -e "\n${YELLOW}[Step 2] 檢查 AI Service 連接...${NC}"
if curl -s "${AI_SERVICE_URL}/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ AI Service 已連接${NC}"
else
    echo -e "${RED}✗ AI Service 無法連接，請確保 AI Service 運行中${NC}"
    echo "  啟動命令: cd ai-service && python -m uvicorn main:app --host 0.0.0.0 --port 8001"
    exit 1
fi

# Step 3: 發送第一則訊息（初始化會話）
echo -e "\n${YELLOW}[Step 3] 發送第一則訊息（初始化會話）...${NC}"
echo "  前端會話 ID: ${FRONTEND_SESSION_ID}"
echo "  訊息內容: 你好"

RESPONSE=$(curl -s -X POST \
    "${BACKEND_URL}/api/v1/ai/sessions/${FRONTEND_SESSION_ID}/send_message_stream/" \
    -H "Content-Type: application/json" \
    -d '{"content":"你好"}' \
    -N)

echo "  SSE 事件接收："

# 解析 SSE 事件
INIT_EVENT=""
SESSION_EVENT=""
DELTA_COUNT=0

while IFS= read -r line; do
    if [[ $line == data:* ]]; then
        EVENT=$(echo "$line" | sed 's/^data: //')
        EVENT_TYPE=$(echo "$EVENT" | jq -r '.type' 2>/dev/null)

        case "$EVENT_TYPE" in
            "init")
                echo -e "    ${GREEN}✓ init${NC}: $(echo "$EVENT" | jq -r '.backend_session_id')"
                INIT_EVENT="$EVENT"
                ;;
            "session")
                echo -e "    ${GREEN}✓ session${NC}: $(echo "$EVENT" | jq -r '.session_id' | cut -c1-20)..."
                SESSION_EVENT="$EVENT"
                ;;
            "delta")
                ((DELTA_COUNT++))
                if (( DELTA_COUNT % 10 == 0 )); then
                    echo -e "    ${GREEN}✓ delta${NC} (已接收 $DELTA_COUNT 個)"
                fi
                ;;
            "done")
                echo -e "    ${GREEN}✓ done${NC}"
                ;;
            "error")
                echo -e "    ${RED}✗ error${NC}: $(echo "$EVENT" | jq -r '.content')"
                ;;
        esac
    fi
done <<< "$RESPONSE"

# 提取 backend_session_id 和 claude_session_id
BACKEND_SESSION_ID=$(echo "$INIT_EVENT" | jq -r '.backend_session_id' 2>/dev/null)
CLAUDE_SESSION_ID=$(echo "$SESSION_EVENT" | jq -r '.session_id' 2>/dev/null)

if [ -z "$BACKEND_SESSION_ID" ] || [ -z "$CLAUDE_SESSION_ID" ]; then
    echo -e "${RED}✗ 未能獲取會話 ID${NC}"
    exit 1
fi

echo -e "${GREEN}✓ 第一則訊息成功${NC}"
echo "  後端會話 ID: ${BACKEND_SESSION_ID}"
echo "  Claude SDK Session ID: ${CLAUDE_SESSION_ID}"

# Step 4: 驗證後端數據庫
echo -e "\n${YELLOW}[Step 4] 驗證後端數據庫...${NC}"
echo "  運行 Django shell 命令..."

PYTHON_CMD="
from apps.ai.models import AISession
session = AISession.objects.get(id=${BACKEND_SESSION_ID})
print(f'Session ID: {session.id}')
print(f'Context: {session.context}')
print(f'Message Count: {session.messages.count()}')
"

cd backend
python manage.py shell <<EOF
$PYTHON_CMD
EOF
cd ..

# Step 5: 發送第二則訊息（驗證會話恢復）
echo -e "\n${YELLOW}[Step 5] 發送第二則訊息（驗證會話恢復）...${NC}"
echo "  訊息內容: 再說一遍"

RESPONSE2=$(curl -s -X POST \
    "${BACKEND_URL}/api/v1/ai/sessions/${FRONTEND_SESSION_ID}/send_message_stream/" \
    -H "Content-Type: application/json" \
    -d '{"content":"再說一遍"}' \
    -N)

SESSION_EVENT2=""
while IFS= read -r line; do
    if [[ $line == data:* ]]; then
        EVENT=$(echo "$line" | sed 's/^data: //')
        EVENT_TYPE=$(echo "$EVENT" | jq -r '.type' 2>/dev/null)

        if [ "$EVENT_TYPE" == "session" ]; then
            SESSION_EVENT2="$EVENT"
            break
        fi
    fi
done <<< "$RESPONSE2"

CLAUDE_SESSION_ID2=$(echo "$SESSION_EVENT2" | jq -r '.session_id' 2>/dev/null)

if [ -z "$CLAUDE_SESSION_ID2" ]; then
    echo -e "${RED}✗ 未能在第二則訊息中獲取會話 ID${NC}"
    exit 1
fi

if [ "$CLAUDE_SESSION_ID" == "$CLAUDE_SESSION_ID2" ]; then
    echo -e "${GREEN}✓ 會話成功恢復${NC}"
    echo "  Claude SDK Session ID 一致: ${CLAUDE_SESSION_ID}"
else
    echo -e "${RED}✗ 會話 ID 不匹配${NC}"
    echo "  第一則訊息: ${CLAUDE_SESSION_ID}"
    echo "  第二則訊息: ${CLAUDE_SESSION_ID2}"
    exit 1
fi

# Step 6: 驗證前端 localStorage（需要人工檢查）
echo -e "\n${YELLOW}[Step 6] 前端 localStorage 驗證（需要人工檢查）${NC}"
echo "  在瀏覽器控制台執行以下命令："
echo -e "  ${YELLOW}const sessions = JSON.parse(localStorage.getItem('ai_sessions'));${NC}"
echo -e "  ${YELLOW}console.log(sessions.find(s => s.id === '${FRONTEND_SESSION_ID}').metadata);${NC}"
echo "  預期輸出應包含："
echo "  - backend_session_id: ${BACKEND_SESSION_ID}"
echo "  - claude_session_id: ${CLAUDE_SESSION_ID}"
echo "  - title_pending: true"

# 測試完成
echo -e "\n${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ 集成測試通過${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"

echo -e "\n${YELLOW}建議的後續驗證：${NC}"
echo "1. 檢查前端 localStorage 中的會話元數據"
echo "2. 驗證多會話隔離（創建兩個會話，確保 session_id 不同）"
echo "3. 檢查後端日誌輸出（應包含 'Saved claude_session_id' 信息）"
echo "4. 測試會話切換和消息路由"
