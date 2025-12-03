# QJudge 後端 API 文件

本文檔提供 QJudge 平台後端 RESTful API 的完整規格說明，包括端點定義、請求格式、回應格式、錯誤處理等。

**技術棧**: Django + Django REST Framework  
**認證方式**: JWT Token  
**API 版本**: v1  
**Base URL**: `/api/v1`

---

## 📋 目錄

- [API 基本規範](#api-基本規範)
- [認證與授權](#認證與授權)
- [題目管理](#題目管理)
- [提交與評測](#提交與評測)
- [競賽系統](#競賽系統)
- [通知系統](#通知系統)
- [WebSocket 即時推送](#websocket-即時推送)
- [錯誤處理](#錯誤處理)

---

## 🌐 API 基本規範

### 基本資訊

- **Base URL**: `/api/v1`
- **Content-Type**: `application/json`
- **字元編碼**: UTF-8
- **認證方式**: Bearer Token (JWT)

### 通用回應格式

#### 成功回應
```json
{
  "success": true,
  "data": {
    // 回應資料
  }
}
```

#### 錯誤回應
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "錯誤描述"
  }
}
```

### HTTP 狀態碼

| 狀態碼 | 說明 |
|--------|------|
| `200 OK` | 請求成功 |
| `201 Created` | 資源創建成功 |
| `400 Bad Request` | 請求參數錯誤 |
| `401 Unauthorized` | 未認證 |
| `403 Forbidden` | 權限不足 |
| `404 Not Found` | 資源不存在 |
| `500 Internal Server Error` | 伺服器錯誤 |

### 認證方式

使用 JWT Token 進行身份認證：

```http
Authorization: Bearer <access_token>
```

---

## 🔐 認證與授權

### 1.1 使用者註冊

**端點**: `POST /auth/register`

**請求參數**:
```json
{
  "username": "student001",
  "email": "student@nycu.edu.tw",
  "password": "SecurePass123!",
  "confirmPassword": "SecurePass123!"
}
```

**成功回應** (201):
```json
{
  "success": true,
  "data": {
    "message": "註冊成功，請檢查您的信箱以驗證帳號"
  }
}
```

### 1.2 使用者登入

**端點**: `POST /auth/login`

**請求參數**:
```json
{
  "email": "student@nycu.edu.tw",
  "password": "SecurePass123!"
}
```

**成功回應** (200):
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "username": "student001",
      "email": "student@nycu.edu.tw",
      "role": "student"
    }
  }
}
```

### 1.3 刷新 Token

**端點**: `POST /auth/refresh`

**請求參數**:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 1.4 登出

**端點**: `POST /auth/logout`

**認證**: 需要

### 1.5 取得當前使用者資訊

**端點**: `GET /auth/me`

**認證**: 需要

**成功回應** (200):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "student001",
    "email": "student@nycu.edu.tw",
    "role": "student",
    "statistics": {
      "solvedCount": 42,
      "submissionCount": 156
    }
  }
}
```

### 1.6 Email 驗證

**端點**: `POST /auth/verify-email`

**請求參數**:
```json
{
  "token": "verification_token_here"
}
```

### 1.7 忘記密碼

**端點**: `POST /auth/forgot-password`

**請求參數**:
```json
{
  "email": "student@nycu.edu.tw"
}
```

### 1.8 重設密碼

**端點**: `POST /auth/reset-password`

**請求參數**:
```json
{
  "token": "reset_token_here",
  "newPassword": "NewSecurePass123!",
  "confirmPassword": "NewSecurePass123!"
}
```

---

## 📚 題目管理

### 2.1 取得題目列表

**端點**: `GET /problems`

**查詢參數**:
- `page`: 頁碼（預設: 1）
- `limit`: 每頁筆數（預設: 20）
- `difficulty`: 難度篩選（easy/medium/hard）
- `tags`: 標籤篩選（逗號分隔）
- `search`: 搜尋關鍵字
- `status`: 解題狀態（solved/attempted/unsolved）

**成功回應** (200):
```json
{
  "success": true,
  "data": {
    "problems": [
      {
        "id": 1,
        "displayId": "P001",
        "title": "A + B Problem",
        "difficulty": "easy",
        "tags": ["math", "basic"],
        "acceptRate": 81.7,
        "userStatus": "solved"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100
    }
  }
}
```

### 2.2 取得題目詳情

**端點**: `GET /problems/{id}`

**成功回應** (200):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "displayId": "P001",
    "title": "A + B Problem",
    "difficulty": "easy",
    "timeLimit": 1000,
    "memoryLimit": 256,
    "description": "給定兩個整數 A 和 B，計算它們的和。",
    "inputDescription": "一行包含兩個整數 A 和 B。",
    "outputDescription": "輸出一個整數，代表 A + B 的和。",
    "sampleTestCases": [
      {
        "input": "1 2",
        "output": "3"
      }
    ],
    "supportedLanguages": ["cpp", "python", "java"]
  }
}
```

### 2.3 創建題目（教師）

**端點**: `POST /problems`

**認證**: 需要（教師權限）

**請求參數**:
```json
{
  "title": "二元搜尋",
  "difficulty": "medium",
  "timeLimit": 1000,
  "memoryLimit": 256,
  "description": "實作二元搜尋演算法...",
  "inputDescription": "第一行包含整數 n...",
  "outputDescription": "輸出目標值的索引...",
  "tags": ["binary-search", "algorithm"],
  "isVisible": true
}
```

### 2.4 更新題目（教師）

**端點**: `PUT /problems/{id}`

**認證**: 需要（教師權限）

### 2.5 刪除題目（教師）

**端點**: `DELETE /problems/{id}`

**認證**: 需要（教師權限）

### 2.6 管理測試資料（教師）

**端點**: `POST /problems/{id}/testcases`

**認證**: 需要（教師權限）

**請求參數**:
```json
{
  "testCases": [
    {
      "input": "1 2",
      "output": "3",
      "isSample": true,
      "score": 0
    }
  ]
}
```

---

## 💻 提交與評測

### 3.1 提交程式碼

**端點**: `POST /submissions`

**認證**: 需要

**請求參數**:
```json
{
  "problemId": 1,
  "language": "cpp",
  "code": "#include <iostream>...",
  "contestId": null
}
```

**成功回應** (201):
```json
{
  "success": true,
  "data": {
    "submissionId": 12345,
    "status": "pending"
  }
}
```

### 3.2 取得提交列表

**端點**: `GET /submissions`

**認證**: 需要

**查詢參數**:
- `page`: 頁碼
- `limit`: 每頁筆數
- `problemId`: 篩選特定題目
- `contestId`: 篩選特定競賽
- `status`: 篩選評測狀態

**成功回應** (200):
```json
{
  "success": true,
  "data": {
    "submissions": [
      {
        "id": 12345,
        "problemId": 1,
        "problemTitle": "A + B Problem",
        "language": "cpp",
        "status": "Accepted",
        "score": 100,
        "time": 98,
        "memory": 12.5,
        "submittedAt": "2025-12-03T14:30:00Z"
      }
    ]
  }
}
```

### 3.3 取得提交詳情

**端點**: `GET /submissions/{id}`

**認證**: 需要

**成功回應** (200):
```json
{
  "success": true,
  "data": {
    "id": 12345,
    "problemId": 1,
    "language": "cpp",
    "code": "#include <iostream>...",
    "status": "Accepted",
    "score": 100,
    "time": 98,
    "memory": 12.5,
    "testResults": [
      {
        "testId": 1,
        "status": "Accepted",
        "time": 15,
        "memory": 2.1,
        "score": 20
      }
    ],
    "submittedAt": "2025-12-03T14:30:00Z"
  }
}
```

### 3.4 重新評測（教師）

**端點**: `POST /submissions/{id}/rejudge`

**認證**: 需要（教師權限）

---

## 🏆 競賽系統

### 4.1 取得競賽列表

**端點**: `GET /contests`

**查詢參數**:
- `page`: 頁碼
- `limit`: 每頁筆數
- `status`: 競賽狀態（upcoming/running/ended）

**成功回應** (200):
```json
{
  "success": true,
  "data": {
    "contests": [
      {
        "id": 1,
        "title": "資料結構期中考試",
        "startTime": "2025-12-15T14:00:00Z",
        "endTime": "2025-12-15T17:00:00Z",
        "status": "upcoming",
        "participantCount": 45,
        "problemCount": 5
      }
    ]
  }
}
```

### 4.2 取得競賽詳情

**端點**: `GET /contests/{id}`

**成功回應** (200):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "title": "資料結構期中考試",
    "description": "考試範圍：陣列、鏈結串列...",
    "startTime": "2025-12-15T14:00:00Z",
    "endTime": "2025-12-15T17:00:00Z",
    "isPublic": false,
    "requirePassword": true,
    "rule": "OI",
    "status": "upcoming"
  }
}
```

### 4.3 註冊競賽

**端點**: `POST /contests/{id}/register`

**認證**: 需要

**請求參數**:
```json
{
  "password": "DataStruct2025"
}
```

### 4.4 取得競賽題目

**端點**: `GET /contests/{id}/problems`

**認證**: 需要（需已註冊競賽）

### 4.5 取得競賽排名

**端點**: `GET /contests/{id}/rankings`

**成功回應** (200):
```json
{
  "success": true,
  "data": {
    "rankings": [
      {
        "rank": 1,
        "username": "student101",
        "solvedCount": 5,
        "totalScore": 500,
        "lastSubmissionTime": "2025-12-15T15:45:00Z"
      }
    ]
  }
}
```

### 4.6 創建競賽（教師）

**端點**: `POST /contests`

**認證**: 需要（教師權限）

**請求參數**:
```json
{
  "title": "演算法競賽第一回",
  "description": "競賽說明...",
  "startTime": "2025-12-20T14:00:00Z",
  "endTime": "2025-12-20T17:00:00Z",
  "isPublic": true,
  "password": "algo2025",
  "rule": "ACM"
}
```

### 4.7 發布競賽公告（教師）

**端點**: `POST /contests/{id}/announcements`

**認證**: 需要（教師權限）

**請求參數**:
```json
{
  "title": "題目 C 範例測試修正",
  "content": "題目 C 的範例測試 #2 輸出有誤，已更正。",
  "priority": "high"
}
```

---

## 🔔 通知系統

### 5.1 取得通知列表

**端點**: `GET /notifications`

**認證**: 需要

**查詢參數**:
- `page`: 頁碼
- `unreadOnly`: 只顯示未讀通知

**成功回應** (200):
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": 1,
        "type": "submission_result",
        "title": "評測完成",
        "content": "您的提交 #12345 已評測完成",
        "isRead": false,
        "createdAt": "2025-12-03T14:30:15Z"
      }
    ],
    "unreadCount": 5
  }
}
```

### 5.2 標記通知為已讀

**端點**: `PUT /notifications/read`

**認證**: 需要

**請求參數**:
```json
{
  "notificationIds": [1, 2, 3]
}
```

---

## 🔌 WebSocket 即時推送

### 連接 WebSocket

**端點**: `/ws/connect?token=<access_token>`

### 訊息類型

#### 提交狀態更新
```json
{
  "type": "submission_update",
  "data": {
    "submissionId": 12345,
    "status": "Running",
    "progress": {
      "current": 3,
      "total": 10
    }
  }
}
```

#### 競賽公告
```json
{
  "type": "contest_announcement",
  "data": {
    "contestId": 1,
    "title": "題目修正",
    "content": "題目 C 的範例測試已修正"
  }
}
```

#### 排名更新
```json
{
  "type": "ranking_update",
  "data": {
    "contestId": 1,
    "newRank": 5,
    "solvedCount": 3
  }
}
```

---

## ⚠️ 錯誤處理

### 錯誤碼列表

| 錯誤碼 | HTTP 狀態 | 說明 |
|--------|-----------|------|
| `AUTH_001` | 401 | 未登入或 Token 無效 |
| `AUTH_002` | 403 | 權限不足 |
| `AUTH_003` | 401 | Token 已過期 |
| `AUTH_004` | 400 | 密碼不正確 |
| `PROB_001` | 404 | 題目不存在 |
| `PROB_002` | 403 | 無權存取此題目 |
| `SUBM_001` | 400 | 提交失敗 |
| `SUBM_002` | 429 | 提交過於頻繁 |
| `CONT_001` | 404 | 競賽不存在 |
| `CONT_002` | 400 | 競賽尚未開始 |
| `CONT_003` | 400 | 競賽已結束 |
| `CONT_004` | 400 | 競賽密碼錯誤 |

### 錯誤回應範例

```json
{
  "success": false,
  "error": {
    "code": "AUTH_001",
    "message": "未登入或 Token 無效"
  }
}
```

---

## 🔧 開發方法論：測試驅動開發（TDD）

### TDD 概述

本專案採用**測試驅動開發（Test-Driven Development, TDD）**方法。

**TDD 三步驟循環**（Red-Green-Refactor）：
1. 🔴 **Red**: 寫一個失敗的測試
2. 🟢 **Green**: 寫最少的程式碼讓測試通過
3. 🔵 **Refactor**: 重構改善程式碼

### 測試框架
- **pytest**: 測試執行器
- **factory-boy**: 測試資料生成
- **pytest-django**: Django 整合

### TDD 開發流程範例

#### Step 1: 寫測試 (Red)
```python
def test_login_valid_credentials(api_client, user):
    response = api_client.post('/api/v1/auth/login', {
        'email': user.email,
        'password': 'password123'
    })
    assert response.status_code == 200
    assert 'accessToken' in response.data['data']
```

#### Step 2: 寫程式碼 (Green)
```python
class LoginView(APIView):
    def post(self, request):
        # 實作登入邏輯
        return Response({'data': {'accessToken': token}})
```

#### Step 3: 重構 (Refactor)
- 提取 Service 層邏輯
- 優化錯誤處理
- 改善程式碼可讀性

---

## 📚 相關文件

- [執行與部署指南](./docs/RUN_AND_DEPLOY.md)
- [學生使用指南](./docs/STUDENT_GUIDE.md)
- [教師競賽指南](./docs/TEACHER_CONTEST_GUIDE.md)
- [教師題目管理指南](./docs/TEACHER_PROBLEM_GUIDE.md)

---

**更新日期**: 2025-12-03  
**文件版本**: 2.0.0  
**API 版本**: v1
