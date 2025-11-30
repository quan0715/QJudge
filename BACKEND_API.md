# 後端 API Endpoint 設計 (Backend API Design)

## 文檔說明

本文檔定義 OJ 平台後端的 RESTful API 端點規格，包括請求格式、回應格式、狀態碼和錯誤處理。

**技術棧**：Django + Django REST Framework
**開發方法**：測試驅動開發（TDD）

---

## 開發方法論：測試驅動開發（TDD）

### TDD 概述

本專案採用**測試驅動開發（Test-Driven Development, TDD）**方法，確保程式碼質量和可維護性。

**TDD 三步驟循環**（Red-Green-Refactor）：
1. 🔴 **Red**: 寫一個失敗的測試
2. 🟢 **Green**: 寫最少的程式碼讓測試通過
3. 🔵 **Refactor**: 重構改善程式碼

### 測試框架
- **pytest**: 測試執行器
- **factory-boy**: 測試資料生成
- **pytest-django**: Django 整合

### TDD 開發流程範例 (Login)

#### Step 1: 寫測試 (Red)
```python
def test_login_valid_credentials(api_client, user):
    response = api_client.post('/api/v1/auth/email/login', {
        'email': user.email,
        'password': 'password123'
    })
    assert response.status_code == 200
    assert 'accessToken' in response.data['data']
```

#### Step 2: 寫程式碼 (Green)
```python
class EmailLoginView(APIView):
    def post(self, request):
        # 實作登入邏輯...
        return Response({'data': {'accessToken': token}})
```

#### Step 3: 重構 (Refactor)
- 提取 Service 層邏輯
- 優化錯誤處理

---

## API 基本規範

- **Base URL**: `/api/v1`
- **Content-Type**: `application/json`
- **認證方式**: Bearer Token (JWT)

### 通用回應格式

**成功回應**:
```json
{
  "success": true,
  "data": { ... }
}
```

**錯誤回應**:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "錯誤描述"
  }
}
```

---

## 1. 認證模組 (Authentication)

### 1.1 NYCU OAuth 登入回調
- **端點**: `POST /auth/nycu/callback`
- **描述**: 接收 Authorization Code，交換 Token 並登入
- **請求**: `{ "code": "...", "redirectUri": "..." }`
- **回應**: `{ "accessToken": "...", "user": { ... } }`

### 1.2 取得當前使用者
- **端點**: `GET /auth/me`
- **認證**: 需要
- **回應**: 使用者詳細資料

### 1.3 Email/Password 登入
- **端點**: `POST /auth/email/login`
- **請求**: `{ "email": "...", "password": "..." }`

### 1.4 Email/Password 註冊
- **端點**: `POST /auth/email/register`
- **請求**: `{ "username": "...", "email": "...", "password": "...", "confirmPassword": "..." }`
- **驗證**: 密碼需 8+ 字元，含大小寫、數字、特殊符號。

### 1.5 Email 驗證
- **端點**: `POST /auth/email/verify`
- **請求**: `{ "token": "..." }`

### 1.6 忘記密碼
- **端點**: `POST /auth/password/forgot`

### 1.7 重設密碼
- **端點**: `POST /auth/password/reset`

### 1.8 登出
- **端點**: `POST /auth/logout`

---

## 2. 題目模組 (Problems)

### 2.1 取得題目列表
- **端點**: `GET /problems`
- **參數**: `page`, `limit`, `difficulty`, `tags`, `search`

### 2.2 取得題目詳情
- **端點**: `GET /problems/:id`

### 2.3 創建題目 (教師)
- **端點**: `POST /problems`
- **權限**: Teacher+

### 2.4 更新題目 (教師)
- **端點**: `PUT /problems/:id`

### 2.5 刪除題目 (教師)
- **端點**: `DELETE /problems/:id`

### 2.6 測資生成 (教師)
- **端點**: `POST /problems/:id/generate-testcases`
- **請求**: `{ "script": "...", "solution": "...", "count": 10 }`
- **描述**: 執行腳本生成輸入，執行 Solution 生成輸出。

---

## 3. 提交與評測 (Submissions)

### 3.1 提交程式碼
- **端點**: `POST /submissions`
- **請求**: `{ "problemId": 1, "language": "cpp17", "code": "..." }`
- **回應**: `{ "submissionId": 123, "status": "pending" }`

### 3.2 取得提交列表
- **端點**: `GET /submissions`
- **參數**: `problemId`, `userId`, `contestId`

### 3.3 取得提交詳情
- **端點**: `GET /submissions/:id`

### 3.4 重新評測 (Rejudge)
- **端點**: `POST /submissions/:id/rejudge`
- **權限**: Teacher+

---

## 4. 考試模組 (Contests)

### 4.1 取得考試列表
- **端點**: `GET /contests`

### 4.2 取得考試詳情
- **端點**: `GET /contests/:id`

### 4.3 註冊/加入考試
- **端點**: `POST /contests/:id/register`
- **請求**: `{ "password": "..." }` (如果需要)

### 4.4 取得考試題目
- **端點**: `GET /contests/:id/problems`

### 4.5 取得考試排名
- **端點**: `GET /contests/:id/rankings`
- **參數**: `page`, `limit`

### 4.6 創建考試 (教師)
- **端點**: `POST /contests`

### 4.7 螢幕監控事件上報
- **端點**: `POST /contests/:id/monitor/events`
- **請求**: `{ "type": "blur", "timestamp": "..." }`

---

## 5. WebSocket 即時推送

**Endpoint**: `/ws/connect`

**Events**:
- `submission_update`: 評測狀態更新 (Pending -> Running -> AC)
- `contest_announcement`: 考試公告
- `contest_ranking_update`: 排名變動

---

## 6. 錯誤代碼表 (Error Codes)

| Code | Message | Description |
|------|---------|-------------|
| `AUTH_001` | Unauthorized | 未登入或 Token 無效 |
| `AUTH_002` | Forbidden | 權限不足 |
| `PROB_001` | Problem Not Found | 題目不存在 |
| `SUBM_001` | Submission Failed | 提交失敗 |
| `EXAM_001` | Contest Not Started | 考試尚未開始 |
