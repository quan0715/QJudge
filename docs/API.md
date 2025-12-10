# QJudge API 文件

> **版本**: 1.0.0  
> **最後更新**: 2025-12-10  
> **Base URL**: `/api/v1`

## 目錄

- [1. 認證系統 (Auth)](#1-認證系統-auth)
- [2. 題目系統 (Problems)](#2-題目系統-problems)
- [3. 提交系統 (Submissions)](#3-提交系統-submissions)
- [4. 競賽系統 (Contests)](#4-競賽系統-contests)
- [5. 通知系統 (Notifications)](#5-通知系統-notifications)
- [6. 公告系統 (Announcements)](#6-公告系統-announcements)
- [7. 管理系統 (Admin)](#7-管理系統-admin)

---

## 認證機制

本 API 使用 JWT (JSON Web Token) 進行認證。

### 獲取 Token

```http
POST /api/v1/auth/email/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

### 使用 Token

```http
GET /api/v1/problems/
Authorization: Bearer <access_token>
```

### Token 刷新

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refresh": "<refresh_token>"
}
```

---

## 1. 認證系統 (Auth)

### 1.1 使用者註冊

```http
POST /api/v1/auth/email/register
```

**Request Body**:
```json
{
  "username": "student123",
  "email": "student@nycu.edu.tw",
  "password": "SecurePass123!",
  "password_confirm": "SecurePass123!"
}
```

**Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "username": "student123",
      "email": "student@nycu.edu.tw",
      "role": "student",
      "auth_provider": "email"
    },
    "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
    "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
    "verification_url": "http://localhost:8000/api/v1/auth/verify-email?token=..."
  },
  "message": "註冊成功,請檢查您的Email以驗證帳號"
}
```

### 1.2 使用者登入

```http
POST /api/v1/auth/email/login
```

**Request Body**:
```json
{
  "email": "student@nycu.edu.tw",
  "password": "SecurePass123!"
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "username": "student123",
      "email": "student@nycu.edu.tw",
      "role": "student",
      "email_verified": true
    },
    "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
    "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGc..."
  }
}
```

### 1.3 NYCU OAuth 登入

#### 1.3.1 取得授權 URL

```http
GET /api/v1/auth/nycu/login
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "authorization_url": "https://id.nycu.edu.tw/o/authorize/?client_id=..."
  }
}
```

#### 1.3.2 OAuth 回調

```http
POST /api/v1/auth/nycu/callback
```

**Request Body**:
```json
{
  "code": "oauth_authorization_code",
  "redirect_uri": "http://localhost:5173/auth/nycu/callback"
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 2,
      "username": "nycu_student",
      "email": "student@nycu.edu.tw",
      "role": "student",
      "auth_provider": "nycu-oauth"
    },
    "access_token": "...",
    "refresh_token": "..."
  }
}
```

### 1.4 取得當前使用者

```http
GET /api/v1/auth/me
Authorization: Bearer <token>
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "student123",
    "email": "student@nycu.edu.tw",
    "role": "student",
    "auth_provider": "email",
    "email_verified": true,
    "created_at": "2025-01-01T00:00:00Z"
  }
}
```

### 1.5 更新個人資料

```http
PATCH /api/v1/auth/me
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "username": "new_username"
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "new_username",
    "email": "student@nycu.edu.tw",
    "role": "student"
  },
  "message": "個人資料已更新"
}
```

### 1.6 使用者統計

```http
GET /api/v1/auth/me/stats
Authorization: Bearer <token>
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "total_solved": 15,
    "easy_solved": 8,
    "medium_solved": 5,
    "hard_solved": 2,
    "total_easy": 50,
    "total_medium": 80,
    "total_hard": 30
  }
}
```

### 1.7 搜尋使用者 (Admin)

```http
GET /api/v1/auth/search?q=student
Authorization: Bearer <admin_token>
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "username": "student123",
      "email": "student@nycu.edu.tw",
      "role": "student",
      "last_login_at": "2025-12-10T10:00:00Z"
    }
  ]
}
```

### 1.8 更新使用者角色 (Admin)

```http
PATCH /api/v1/auth/{user_id}/role
Authorization: Bearer <admin_token>
```

**Request Body**:
```json
{
  "role": "teacher"
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "student123",
    "role": "teacher"
  },
  "message": "已將 student123 的角色從 student 更新為 teacher"
}
```

---

## 2. 題目系統 (Problems)

### 2.1 題目列表

```http
GET /api/v1/problems/
Authorization: Bearer <token>
```

**Query Parameters**:
- `difficulty`: `easy` | `medium` | `hard`
- `is_visible`: `true` | `false`
- `search`: 搜尋關鍵字
- `scope`: `visible` | `manage` (Teacher+)
- `ordering`: `id` | `-id` | `difficulty` | `-submission_count`
- `page`: 頁碼 (預設 1)
- `page_size`: 每頁數量 (預設 20)

**Response (200 OK)**:
```json
{
  "count": 100,
  "next": "http://api/v1/problems/?page=2",
  "previous": null,
  "results": [
    {
      "id": 1,
      "title": "A + B Problem",
      "display_id": "P001",
      "difficulty": "easy",
      "submission_count": 150,
      "accepted_count": 120,
      "acceptance_rate": 80.0,
      "time_limit": 1000,
      "memory_limit": 128,
      "tags": [
        {
          "id": 1,
          "name": "基礎",
          "slug": "basic",
          "color": "#0f62fe"
        }
      ]
    }
  ]
}
```

### 2.2 題目詳情

```http
GET /api/v1/problems/{id}/
Authorization: Bearer <token>
```

**Response (200 OK)**:
```json
{
  "id": 1,
  "title": "A + B Problem",
  "display_id": "P001",
  "difficulty": "easy",
  "time_limit": 1000,
  "memory_limit": 128,
  "is_visible": true,
  "is_practice_visible": true,
  "created_by": {
    "id": 1,
    "username": "teacher"
  },
  "translations": [
    {
      "language": "zh-TW",
      "title": "A + B 問題",
      "description": "給定兩個整數 A 和 B，請輸出它們的和。",
      "input_description": "兩個整數 A 和 B。",
      "output_description": "輸出一個整數，即 A + B 的和。",
      "hint": "使用加法運算子。"
    }
  ],
  "test_cases": [
    {
      "id": 1,
      "input_data": "1 2",
      "output_data": "3",
      "is_sample": true,
      "is_hidden": false,
      "score": 10,
      "order": 1
    }
  ],
  "language_configs": [
    {
      "language": "cpp",
      "template_code": "#include <iostream>\nusing namespace std;\n\nint main() {\n    // Your code here\n    return 0;\n}\n",
      "is_enabled": true
    }
  ],
  "tags": [
    {
      "id": 1,
      "name": "基礎",
      "slug": "basic"
    }
  ],
  "forbidden_keywords": [],
  "required_keywords": [],
  "submission_count": 150,
  "accepted_count": 120,
  "acceptance_rate": 80.0,
  "created_at": "2025-01-01T00:00:00Z",
  "updated_at": "2025-01-02T00:00:00Z"
}
```

### 2.3 建立題目 (Teacher+)

```http
POST /api/v1/problems/
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "title": "Fibonacci Sequence",
  "display_id": "P002",
  "difficulty": "medium",
  "time_limit": 2000,
  "memory_limit": 256,
  "is_visible": true,
  "is_practice_visible": false,
  "translations": [
    {
      "language": "zh-TW",
      "title": "費氏數列",
      "description": "計算第 N 個費氏數。",
      "input_description": "一個整數 N (1 ≤ N ≤ 40)。",
      "output_description": "第 N 個費氏數。",
      "hint": "可以使用遞迴或動態規劃。"
    }
  ],
  "test_cases": [
    {
      "input_data": "5",
      "output_data": "5",
      "is_sample": true,
      "is_hidden": false,
      "score": 10,
      "order": 1
    },
    {
      "input_data": "10",
      "output_data": "55",
      "is_sample": false,
      "is_hidden": true,
      "score": 20,
      "order": 2
    }
  ],
  "language_configs": [
    {
      "language": "cpp",
      "template_code": "#include <iostream>\nusing namespace std;\n\nint fib(int n) {\n    // TODO: Implement\n}\n\nint main() {\n    int n;\n    cin >> n;\n    cout << fib(n) << endl;\n    return 0;\n}\n",
      "is_enabled": true
    }
  ],
  "tags": [1, 2],
  "forbidden_keywords": ["goto"],
  "required_keywords": []
}
```

**Response (201 Created)**:
```json
{
  "id": 2,
  "title": "Fibonacci Sequence",
  "display_id": "P002",
  "difficulty": "medium",
  ...
}
```

### 2.4 更新題目 (Teacher+)

```http
PUT /api/v1/problems/{id}/
PATCH /api/v1/problems/{id}/
Authorization: Bearer <token>
```

**Request Body** (PATCH 支援部分更新):
```json
{
  "time_limit": 3000,
  "is_practice_visible": true
}
```

**Response (200 OK)**:
```json
{
  "id": 2,
  "title": "Fibonacci Sequence",
  "time_limit": 3000,
  "is_practice_visible": true,
  ...
}
```

### 2.5 刪除題目 (Admin)

```http
DELETE /api/v1/problems/{id}/
Authorization: Bearer <admin_token>
```

**Response (204 No Content)**

### 2.6 批量導入題目 (Teacher+)

```http
POST /api/v1/problems/import/
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Form Data**:
- `file`: YAML 檔案

**Response (201 Created)**:
```json
{
  "success": true,
  "message": "成功導入 5 個題目",
  "data": {
    "imported": 5,
    "failed": 0,
    "problems": [
      {
        "id": 1,
        "title": "A + B Problem",
        "display_id": "P001"
      }
    ]
  }
}
```

### 2.7 測試執行

```http
POST /api/v1/problems/{id}/test/
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "language": "cpp",
  "code": "#include <iostream>\nusing namespace std;\nint main() { int a, b; cin >> a >> b; cout << a + b << endl; return 0; }\n",
  "custom_test_cases": [
    {
      "input": "1 2",
      "output": "3"
    }
  ]
}
```

**Response (200 OK)**:
```json
{
  "submission_id": 123,
  "status": "pending",
  "message": "測試已提交，請稍後查看結果"
}
```

---

## 3. 提交系統 (Submissions)

### 3.1 提交程式碼

```http
POST /api/v1/submissions/
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "problem": 1,
  "language": "cpp",
  "code": "#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << a + b << endl;\n    return 0;\n}\n",
  "contest": null,
  "is_test": false
}
```

**Response (201 Created)**:
```json
{
  "id": 123,
  "user": {
    "id": 1,
    "username": "student123"
  },
  "problem": {
    "id": 1,
    "title": "A + B Problem",
    "display_id": "P001"
  },
  "language": "cpp",
  "status": "pending",
  "score": 0,
  "exec_time": 0,
  "memory_usage": 0,
  "created_at": "2025-12-10T10:00:00Z"
}
```

### 3.2 提交列表

```http
GET /api/v1/submissions/
Authorization: Bearer <token>
```

**Query Parameters**:
- `problem`: 題目 ID
- `user`: 使用者 ID
- `contest`: 競賽 ID
- `status`: `pending` | `judging` | `AC` | `WA` | `TLE` | `MLE` | `RE` | `CE` | `KR` | `SE`
- `source_type`: `practice` | `contest`
- `is_test`: `true` | `false`
- `ordering`: `created_at` | `-created_at`
- `page`: 頁碼

**Response (200 OK)**:
```json
{
  "count": 500,
  "next": "http://api/v1/submissions/?page=2",
  "previous": null,
  "results": [
    {
      "id": 123,
      "user": {
        "id": 1,
        "username": "student123"
      },
      "problem": {
        "id": 1,
        "title": "A + B Problem",
        "display_id": "P001"
      },
      "language": "cpp",
      "status": "AC",
      "score": 100,
      "exec_time": 42,
      "memory_usage": 2048,
      "created_at": "2025-12-10T10:00:00Z"
    }
  ]
}
```

### 3.3 提交詳情

```http
GET /api/v1/submissions/{id}/
Authorization: Bearer <token>
```

**Response (200 OK)**:
```json
{
  "id": 123,
  "user": {
    "id": 1,
    "username": "student123"
  },
  "problem": {
    "id": 1,
    "title": "A + B Problem",
    "display_id": "P001"
  },
  "contest": null,
  "language": "cpp",
  "code": "#include <iostream>...",
  "status": "AC",
  "score": 100,
  "exec_time": 42,
  "memory_usage": 2048,
  "error_message": "",
  "is_test": false,
  "source_type": "practice",
  "created_at": "2025-12-10T10:00:00Z",
  "updated_at": "2025-12-10T10:00:05Z"
}
```

### 3.4 提交結果詳情

```http
GET /api/v1/submissions/{id}/results/
Authorization: Bearer <token>
```

**Response (200 OK)**:
```json
{
  "submission_id": 123,
  "status": "AC",
  "score": 100,
  "exec_time": 42,
  "memory_usage": 2048,
  "results": [
    {
      "id": 1,
      "test_case": {
        "id": 1,
        "is_sample": true,
        "is_hidden": false,
        "order": 1
      },
      "status": "AC",
      "exec_time": 15,
      "memory_usage": 1024,
      "output": "3",
      "error_message": "",
      "input_data": "1 2",
      "expected_output": "3"
    },
    {
      "id": 2,
      "test_case": {
        "id": 2,
        "is_sample": false,
        "is_hidden": true,
        "order": 2
      },
      "status": "AC",
      "exec_time": 27,
      "memory_usage": 1024,
      "output": "100",
      "error_message": "",
      "input_data": "**Hidden**",
      "expected_output": "**Hidden**"
    }
  ]
}
```

---

## 4. 競賽系統 (Contests)

### 4.1 競賽列表

```http
GET /api/v1/contests/
Authorization: Bearer <token>
```

**Query Parameters**:
- `scope`: `visible` | `manage` (Teacher+)
- `visibility`: `public` | `private`
- `status`: `active` | `inactive` | `archived`
- `ordering`: `created_at` | `-created_at` | `start_time`

**Response (200 OK)**:
```json
{
  "count": 10,
  "results": [
    {
      "id": 1,
      "name": "程式設計期中考",
      "description": "本次考試涵蓋基本演算法...",
      "start_time": "2025-12-15T09:00:00Z",
      "end_time": "2025-12-15T11:00:00Z",
      "visibility": "private",
      "status": "active",
      "exam_mode_enabled": true,
      "anonymous_mode_enabled": false,
      "owner": {
        "id": 2,
        "username": "teacher"
      },
      "participant_count": 50,
      "problem_count": 5,
      "created_at": "2025-12-01T00:00:00Z"
    }
  ]
}
```

### 4.2 競賽詳情

```http
GET /api/v1/contests/{id}/
Authorization: Bearer <token>
```

**Response (200 OK)**:
```json
{
  "id": 1,
  "name": "程式設計期中考",
  "description": "本次考試涵蓋基本演算法...",
  "rules": "1. 禁止使用外部資源\n2. 禁止與他人討論...",
  "start_time": "2025-12-15T09:00:00Z",
  "end_time": "2025-12-15T11:00:00Z",
  "visibility": "private",
  "has_password": true,
  "status": "active",
  "computed_status": "ongoing",
  "exam_mode_enabled": true,
  "scoreboard_visible_during_contest": false,
  "anonymous_mode_enabled": false,
  "allow_auto_unlock": true,
  "auto_unlock_minutes": 30,
  "max_cheat_warnings": 3,
  "owner": {
    "id": 2,
    "username": "teacher"
  },
  "admins": [
    {
      "id": 3,
      "username": "assistant_teacher"
    }
  ],
  "participant_count": 50,
  "problem_count": 5,
  "my_registration": {
    "registered": true,
    "exam_status": "in_progress",
    "score": 60,
    "started_at": "2025-12-15T09:05:00Z"
  },
  "my_role": "participant",
  "created_at": "2025-12-01T00:00:00Z",
  "updated_at": "2025-12-10T00:00:00Z"
}
```

### 4.3 建立競賽 (Teacher+)

```http
POST /api/v1/contests/
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "name": "程式設計期末考",
  "description": "本次考試涵蓋進階演算法...",
  "rules": "1. 禁止使用外部資源\n2. 禁止與他人討論",
  "start_time": "2025-12-20T09:00:00Z",
  "end_time": "2025-12-20T11:00:00Z",
  "visibility": "private",
  "password": "exam2025",
  "status": "inactive",
  "exam_mode_enabled": true,
  "scoreboard_visible_during_contest": false,
  "anonymous_mode_enabled": false,
  "allow_auto_unlock": true,
  "auto_unlock_minutes": 30,
  "max_cheat_warnings": 3
}
```

**Response (201 Created)**:
```json
{
  "id": 2,
  "name": "程式設計期末考",
  ...
}
```

### 4.4 更新競賽 (Owner/Admin)

```http
PATCH /api/v1/contests/{id}/
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "status": "active",
  "max_cheat_warnings": 5
}
```

**Response (200 OK)**

### 4.5 註冊競賽

```http
POST /api/v1/contests/{id}/register/
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "password": "exam2025",
  "nickname": "匿名戰士" // 僅當 anonymous_mode_enabled 時
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "成功註冊競賽",
  "data": {
    "registration_id": 1,
    "exam_status": "not_started"
  }
}
```

### 4.6 開始考試

```http
POST /api/v1/contests/{id}/start/
Authorization: Bearer <token>
```

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "考試已開始",
  "data": {
    "exam_status": "in_progress",
    "started_at": "2025-12-15T09:05:00Z"
  }
}
```

### 4.7 結束考試（交卷）

```http
POST /api/v1/contests/{id}/end/
Authorization: Bearer <token>
```

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "考試已結束",
  "data": {
    "exam_status": "submitted",
    "left_at": "2025-12-15T10:30:00Z",
    "score": 85
  }
}
```

### 4.8 排行榜

```http
GET /api/v1/contests/{id}/scoreboard/
Authorization: Bearer <token>
```

**Response (200 OK)**:
```json
{
  "contest": {
    "id": 1,
    "name": "程式設計期中考",
    "anonymous_mode_enabled": false
  },
  "problems": [
    {
      "id": 1,
      "title": "A + B Problem",
      "label": "A"
    },
    {
      "id": 2,
      "title": "Fibonacci",
      "label": "B"
    }
  ],
  "scoreboard": [
    {
      "rank": 1,
      "user": {
        "id": 1,
        "username": "student123",
        "display_name": "student123"
      },
      "score": 200,
      "exam_status": "submitted",
      "problem_results": {
        "1": {
          "solved": true,
          "score": 100,
          "attempts": 1,
          "solve_time": 300
        },
        "2": {
          "solved": true,
          "score": 100,
          "attempts": 2,
          "solve_time": 1200
        }
      }
    }
  ]
}
```

### 4.9 競賽題目列表

```http
GET /api/v1/contests/{id}/problems/
Authorization: Bearer <token>
```

**Response (200 OK)**:
```json
{
  "results": [
    {
      "id": 1,
      "problem": {
        "id": 1,
        "title": "A + B Problem",
        "difficulty": "easy"
      },
      "label": "A",
      "order": 0
    },
    {
      "id": 2,
      "problem": {
        "id": 2,
        "title": "Fibonacci",
        "difficulty": "medium"
      },
      "label": "B",
      "order": 1
    }
  ]
}
```

### 4.10 新增競賽題目 (Owner/Admin)

```http
POST /api/v1/contests/{id}/problems/
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "problem": 3,
  "order": 2
}
```

**Response (201 Created)**

### 4.11 競賽公告列表

```http
GET /api/v1/contests/{id}/announcements/
Authorization: Bearer <token>
```

**Response (200 OK)**:
```json
{
  "results": [
    {
      "id": 1,
      "title": "考試開始",
      "content": "請同學們準時進入考場...",
      "created_by": {
        "id": 2,
        "username": "teacher"
      },
      "created_at": "2025-12-15T08:55:00Z"
    }
  ]
}
```

### 4.12 發布公告 (Owner/Admin)

```http
POST /api/v1/contests/{id}/announcements/
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "title": "考試提醒",
  "content": "距離考試結束還有 30 分鐘..."
}
```

**Response (201 Created)**

### 4.13 Clarification (Q&A)

#### 4.13.1 列表

```http
GET /api/v1/contests/{id}/clarifications/
Authorization: Bearer <token>
```

**Response (200 OK)**:
```json
{
  "results": [
    {
      "id": 1,
      "problem": {
        "id": 1,
        "title": "A + B Problem"
      },
      "author": {
        "id": 1,
        "username": "student123"
      },
      "question": "請問輸入範圍是？",
      "answer": "輸入範圍為 -10^9 到 10^9",
      "is_public": true,
      "status": "answered",
      "created_at": "2025-12-15T09:10:00Z",
      "answered_at": "2025-12-15T09:15:00Z"
    }
  ]
}
```

#### 4.13.2 提問

```http
POST /api/v1/contests/{id}/clarifications/
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "problem": 1,
  "question": "請問輸入範圍是？"
}
```

**Response (201 Created)**

#### 4.13.3 回答 (Owner/Admin)

```http
PATCH /api/v1/contests/{id}/clarifications/{clarification_id}/
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "answer": "輸入範圍為 -10^9 到 10^9",
  "is_public": true
}
```

**Response (200 OK)**

### 4.14 考試事件記錄 (Owner/Admin)

```http
GET /api/v1/contests/{id}/exam-events/
Authorization: Bearer <token>
```

**Query Parameters**:
- `user`: 使用者 ID
- `event_type`: `tab_hidden` | `window_blur` | `exit_fullscreen` | ...

**Response (200 OK)**:
```json
{
  "results": [
    {
      "id": 1,
      "user": {
        "id": 1,
        "username": "student123"
      },
      "event_type": "tab_hidden",
      "metadata": {
        "duration": 5
      },
      "created_at": "2025-12-15T09:20:00Z"
    }
  ]
}
```

### 4.15 參賽者管理 (Owner/Admin)

#### 4.15.1 列表

```http
GET /api/v1/contests/{id}/participants/
Authorization: Bearer <token>
```

**Response (200 OK)**:
```json
{
  "results": [
    {
      "id": 1,
      "user": {
        "id": 1,
        "username": "student123"
      },
      "exam_status": "in_progress",
      "score": 60,
      "violation_count": 2,
      "joined_at": "2025-12-15T08:50:00Z",
      "started_at": "2025-12-15T09:05:00Z"
    }
  ]
}
```

#### 4.15.2 鎖定參賽者

```http
POST /api/v1/contests/{id}/participants/{participant_id}/lock/
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "reason": "違規次數過多"
}
```

**Response (200 OK)**

#### 4.15.3 解鎖參賽者

```http
POST /api/v1/contests/{id}/participants/{participant_id}/unlock/
Authorization: Bearer <token>
```

**Response (200 OK)**

### 4.16 管理員管理 (Owner)

#### 4.16.1 新增管理員

```http
POST /api/v1/contests/{id}/admins/
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "user": 3
}
```

**Response (201 Created)**

#### 4.16.2 移除管理員

```http
DELETE /api/v1/contests/{id}/admins/{user_id}/
Authorization: Bearer <token>
```

**Response (204 No Content)**

### 4.17 活動日誌 (Owner/Admin)

```http
GET /api/v1/contests/{id}/activities/
Authorization: Bearer <token>
```

**Response (200 OK)**:
```json
{
  "results": [
    {
      "id": 1,
      "user": {
        "id": 1,
        "username": "student123"
      },
      "action_type": "start_exam",
      "details": "開始考試",
      "created_at": "2025-12-15T09:05:00Z"
    }
  ]
}
```

---

## 5. 通知系統 (Notifications)

### 5.1 通知列表

```http
GET /api/v1/notifications/
Authorization: Bearer <token>
```

**Query Parameters**:
- `is_read`: `true` | `false`

**Response (200 OK)**:
```json
{
  "count": 5,
  "results": [
    {
      "id": 1,
      "title": "評測完成",
      "message": "您的提交 #123 已評測完成，結果：AC",
      "type": "submission",
      "is_read": false,
      "created_at": "2025-12-10T10:00:05Z"
    }
  ]
}
```

### 5.2 標記已讀

```http
PATCH /api/v1/notifications/{id}/
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "is_read": true
}
```

**Response (200 OK)**

### 5.3 全部標記已讀

```http
POST /api/v1/notifications/mark-all-read/
Authorization: Bearer <token>
```

**Response (200 OK)**

---

## 6. 公告系統 (Announcements)

### 6.1 公告列表

```http
GET /api/v1/management/announcements/
```

**Response (200 OK)**:
```json
{
  "results": [
    {
      "id": 1,
      "title": "系統維護通知",
      "content": "本系統將於 12/25 進行維護...",
      "priority": "high",
      "is_active": true,
      "created_by": {
        "id": 2,
        "username": "admin"
      },
      "created_at": "2025-12-10T00:00:00Z"
    }
  ]
}
```

### 6.2 建立公告 (Admin)

```http
POST /api/v1/management/announcements/
Authorization: Bearer <admin_token>
```

**Request Body**:
```json
{
  "title": "新功能上線",
  "content": "我們新增了程式碼相似度檢測功能...",
  "priority": "medium",
  "is_active": true
}
```

**Response (201 Created)**

---

## 7. 管理系統 (Admin)

### 7.1 資料庫狀態 (Admin)

```http
GET /api/admin/database/
Authorization: Bearer <admin_token>
```

**Response (200 OK)**:
```json
{
  "current_db": "default",
  "databases": {
    "default": {
      "available": true,
      "name": "online_judge",
      "host": "postgres",
      "port": 5432
    },
    "cloud": {
      "available": true,
      "name": "postgres",
      "host": "xxx.supabase.co",
      "port": 5432
    }
  }
}
```

### 7.2 切換資料庫 (Admin)

```http
POST /api/admin/database/switch/
Authorization: Bearer <admin_token>
```

**Request Body**:
```json
{
  "database": "cloud"
}
```

**Response (200 OK)**

### 7.3 資料同步 (Admin)

```http
POST /api/admin/database/sync/
Authorization: Bearer <admin_token>
```

**Request Body**:
```json
{
  "from_db": "local",
  "to_db": "cloud"
}
```

**Response (200 OK)**

---

## 錯誤碼

### HTTP 狀態碼

- `200 OK`: 請求成功
- `201 Created`: 資源建立成功
- `204 No Content`: 請求成功但無回應內容（DELETE）
- `400 Bad Request`: 請求參數錯誤
- `401 Unauthorized`: 未認證或 Token 無效
- `403 Forbidden`: 無權限
- `404 Not Found`: 資源不存在
- `500 Internal Server Error`: 伺服器錯誤

### 自訂錯誤碼

- `AUTH_001`: 登入失敗（Email 或密碼錯誤）
- `AUTH_002`: Token 無效或過期
- `AUTH_003`: OAuth 授權失敗
- `VALIDATION_ERROR`: 資料驗證失敗
- `PERMISSION_DENIED`: 權限不足
- `RESOURCE_NOT_FOUND`: 資源不存在
- `CONTEST_LOCKED`: 競賽已鎖定
- `CONTEST_ENDED`: 競賽已結束
- `CONTEST_PASSWORD_REQUIRED`: 需要競賽密碼
- `EXAM_NOT_STARTED`: 考試尚未開始
- `KEYWORD_RESTRICTION`: 關鍵字限制違規

### 錯誤回應格式

```json
{
  "success": false,
  "error": {
    "code": "AUTH_001",
    "message": "Email 或密碼錯誤",
    "details": {}
  }
}
```

---

## 速率限制

目前系統尚未實作速率限制，建議合理使用 API。

未來計劃實作：
- 一般使用者：100 requests/minute
- 認證端點：10 requests/minute
- 提交端點：5 requests/minute

---

## Webhook (計劃中)

未來將支援 Webhook，讓外部系統可以訂閱事件：
- 提交完成事件
- 競賽開始/結束事件
- 使用者註冊事件

---

## OpenAPI 規範

完整的 OpenAPI 3.0 規範可透過以下端點取得：

```http
GET /api/schema/
```

Swagger UI:
```
http://your-domain/api/schema/swagger-ui/
```

ReDoc:
```
http://your-domain/api/schema/redoc/
```

---

**QJudge API** - 強大、彈性、易用 🚀
