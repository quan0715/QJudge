# QJudge 資料模型文件

> **版本**: 1.0  
> **最後更新**: 2025-12-10  
> **資料庫**: PostgreSQL 15

## 目錄

- [1. 資料庫概述](#1-資料庫概述)
- [2. 使用者系統](#2-使用者系統)
- [3. 題目系統](#3-題目系統)
- [4. 提交系統](#4-提交系統)
- [5. 競賽系統](#5-競賽系統)
- [6. 通知與公告](#6-通知與公告)
- [7. 索引策略](#7-索引策略)
- [8. 資料完整性](#8-資料完整性)

---

## 1. 資料庫概述

### 1.1 資料庫架構

QJudge 支援雙資料庫配置：

```
┌──────────────────┐       ┌──────────────────┐
│   Local DB       │       │    Cloud DB      │
│  (PostgreSQL)    │ ←───→ │   (Supabase)     │
│  Port: 5432      │ Sync  │   Port: 6543     │
└──────────────────┘       └──────────────────┘
         ↑                          ↑
         │                          │
         └────────  Django  ────────┘
              (Dynamic Router)
```

### 1.2 連線設定

#### Local Database (開發環境)

```python
'default': {
    'ENGINE': 'django.db.backends.postgresql',
    'NAME': 'online_judge',
    'USER': 'postgres',
    'PASSWORD': 'postgres',
    'HOST': 'localhost',  # or 'postgres' in Docker
    'PORT': '5432',
}
```

#### Cloud Database (生產環境)

```python
'cloud': {
    'ENGINE': 'django.db.backends.postgresql',
    'NAME': 'postgres',
    'USER': 'postgres.xxx',
    'PASSWORD': '***',
    'HOST': 'xxx.supabase.co',
    'PORT': '6543',  # Transaction Mode Pooler
    'CONN_MAX_AGE': 0,  # 每次交易後釋放連線
    'OPTIONS': {
        'connect_timeout': 5,
        'keepalives': 1,
        'keepalives_idle': 30,
        'keepalives_interval': 10,
        'keepalives_count': 5,
        'sslmode': 'require',
    },
}
```

### 1.3 ER 圖總覽

```
┌─────────────────────────────────────────────────────────────────┐
│                          QJudge ER Diagram                       │
└─────────────────────────────────────────────────────────────────┘

        ┌─────────────┐
        │    User     │
        │-------------|
        │ id (PK)     │
        │ username    │
        │ email       │
        │ role        │
        └──────┬──────┘
               │ 1
               │
               │ 1:1
       ┌───────┴──────────┐
       │   UserProfile    │
       │------------------|
       │ user_id (FK)     │
       │ solved_count     │
       │ accept_rate      │
       └──────────────────┘

        ┌─────────────┐
        │   Problem   │
        │-------------|
        │ id (PK)     │
        │ title       │
        │ difficulty  │
        │ created_by  │──┐
        └──────┬──────┘  │
               │         │ Many
               │ 1       │
               │         ▼
               │    ┌─────────────┐
               │    │ TestCase    │
               │    │-------------|
               │    │ problem_id  │
               │    │ input_data  │
               │    │ output_data │
               │    └─────────────┘
               │
               │ Many
               │
        ┌──────┴─────────┐
        │   Submission   │
        │----------------|
        │ user_id (FK)   │──────────┐
        │ problem_id (FK)│          │ Many
        │ contest_id (FK)│          │
        │ status         │          ▼
        │ code           │   ┌──────────────────┐
        └────────────────┘   │ SubmissionResult │
                             │------------------|
                             │ submission_id    │
                             │ test_case_id     │
                             │ status           │
                             └──────────────────┘

        ┌─────────────┐
        │   Contest   │
        │-------------|
        │ id (PK)     │
        │ name        │
        │ owner_id    │
        │ status      │
        └──────┬──────┘
               │
               │ Many-to-Many
               │
        ┌──────┴─────────────┐
        │ ContestProblem     │
        │--------------------|
        │ contest_id (FK)    │
        │ problem_id (FK)    │
        │ order              │
        └────────────────────┘

        ┌──────────────────────┐
        │  ContestParticipant  │
        │----------------------|
        │ contest_id (FK)      │
        │ user_id (FK)         │
        │ exam_status          │
        │ score                │
        │ violation_count      │
        └──────────────────────┘
```

---

## 2. 使用者系統

### 2.1 User (使用者)

**表名**: `users`

**用途**: 儲存使用者基本資料與認證資訊

| 欄位名稱 | 型別 | 限制 | 說明 |
|---------|------|------|------|
| `id` | BIGINT | PK, AUTO_INCREMENT | 主鍵 |
| `username` | VARCHAR(150) | UNIQUE, NOT NULL | 使用者名稱 |
| `email` | VARCHAR(254) | UNIQUE, NOT NULL | Email |
| `password` | VARCHAR(128) | NOT NULL | 加密密碼（bcrypt）|
| `first_name` | VARCHAR(150) | | 名字 |
| `last_name` | VARCHAR(150) | | 姓氏 |
| `is_staff` | BOOLEAN | DEFAULT false | Django admin 權限 |
| `is_superuser` | BOOLEAN | DEFAULT false | 超級使用者 |
| `is_active` | BOOLEAN | DEFAULT true | 帳號啟用狀態 |
| **auth_provider** | VARCHAR(20) | NOT NULL, DEFAULT 'email' | 認證方式 |
| **oauth_id** | VARCHAR(255) | NULLABLE | OAuth ID |
| **email_verified** | BOOLEAN | DEFAULT false | Email 是否已驗證 |
| **email_verification_token** | VARCHAR(255) | NULLABLE | Email 驗證 Token |
| **email_verification_expires_at** | TIMESTAMP | NULLABLE | 驗證 Token 過期時間 |
| **password_reset_token** | VARCHAR(255) | NULLABLE | 密碼重設 Token |
| **password_reset_expires_at** | TIMESTAMP | NULLABLE | 重設 Token 過期時間 |
| **role** | VARCHAR(20) | NOT NULL, DEFAULT 'student' | 角色 |
| **last_login_at** | TIMESTAMP | NULLABLE | 最後登入時間 |
| `date_joined` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 註冊時間 |
| `updated_at` | TIMESTAMP | AUTO UPDATE | 更新時間 |

**auth_provider 值**:
- `email`: Email/密碼
- `nycu-oauth`: NYCU OAuth
- `google`: Google OAuth (未來)
- `github`: GitHub OAuth (未來)

**role 值**:
- `student`: 學生
- `teacher`: 教師
- `admin`: 管理員

**索引**:
```sql
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_auth_oauth ON users(auth_provider, oauth_id);
```

**限制條件**:
```sql
-- Email 使用者必須有密碼
ALTER TABLE users ADD CONSTRAINT email_users_must_have_password
CHECK (
    NOT (auth_provider = 'email' AND password = '') OR
    (auth_provider = 'email' AND password IS NOT NULL)
);
```

### 2.2 UserProfile (使用者資料)

**表名**: `user_profiles`

**用途**: 儲存使用者統計資料與偏好設定

| 欄位名稱 | 型別 | 限制 | 說明 |
|---------|------|------|------|
| `id` | BIGINT | PK, AUTO_INCREMENT | 主鍵 |
| `user_id` | BIGINT | FK → users.id, UNIQUE | 使用者 ID |
| `solved_count` | INTEGER | DEFAULT 0 | 已解題數 |
| `submission_count` | INTEGER | DEFAULT 0 | 提交次數 |
| `accept_rate` | DECIMAL(5,2) | DEFAULT 0.00 | 通過率 (%) |
| `preferred_language` | VARCHAR(20) | DEFAULT 'zh-hant' | 偏好語言 |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 建立時間 |
| `updated_at` | TIMESTAMP | AUTO UPDATE | 更新時間 |

**關聯**:
- `user_id` → `users.id` (ONE-TO-ONE)

**觸發器**:
- 當 User 建立時自動建立 UserProfile

---

## 3. 題目系統

### 3.1 Problem (題目)

**表名**: `problems`

**用途**: 儲存題目核心資料

| 欄位名稱 | 型別 | 限制 | 說明 |
|---------|------|------|------|
| `id` | BIGINT | PK, AUTO_INCREMENT | 主鍵 |
| `title` | VARCHAR(255) | NOT NULL | 題目標題 |
| `slug` | VARCHAR(255) | UNIQUE | URL Slug |
| `difficulty` | VARCHAR(10) | NOT NULL | 難度 |
| `display_id` | VARCHAR(20) | UNIQUE, NULLABLE | 顯示編號（如 P001）|
| `time_limit` | INTEGER | DEFAULT 1000 | 時間限制（毫秒）|
| `memory_limit` | INTEGER | DEFAULT 128 | 記憶體限制（MB）|
| `is_visible` | BOOLEAN | DEFAULT true | 是否可見 |
| **is_practice_visible** | BOOLEAN | DEFAULT false | 是否在練習題庫顯示 |
| **created_in_contest** | BIGINT | FK → contests.id, NULLABLE | 來源競賽 |
| `created_by` | BIGINT | FK → users.id, NULLABLE | 建立者 |
| `submission_count` | INTEGER | DEFAULT 0 | 提交次數（統計）|
| `accepted_count` | INTEGER | DEFAULT 0 | 通過次數（統計）|
| **forbidden_keywords** | JSONB | DEFAULT '[]' | 禁用關鍵字列表 |
| **required_keywords** | JSONB | DEFAULT '[]' | 必須關鍵字列表 |
| `order` | INTEGER | DEFAULT 0 | 排序 |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 建立時間 |
| `updated_at` | TIMESTAMP | AUTO UPDATE | 更新時間 |

**difficulty 值**:
- `easy`: 簡單
- `medium`: 中等
- `hard`: 困難

**索引**:
```sql
CREATE INDEX idx_problems_difficulty ON problems(difficulty);
CREATE INDEX idx_problems_is_visible ON problems(is_visible);
CREATE INDEX idx_problems_is_practice_visible ON problems(is_practice_visible);
CREATE INDEX idx_problems_created_by ON problems(created_by);
```

**虛擬欄位**:
```python
@property
def acceptance_rate(self):
    if self.submission_count == 0:
        return 0.0
    return (self.accepted_count / self.submission_count) * 100
```

### 3.2 ProblemTranslation (題目翻譯)

**表名**: `problem_translations`

**用途**: 儲存多語言題目內容

| 欄位名稱 | 型別 | 限制 | 說明 |
|---------|------|------|------|
| `id` | BIGINT | PK, AUTO_INCREMENT | 主鍵 |
| `problem_id` | BIGINT | FK → problems.id | 題目 ID |
| `language` | VARCHAR(10) | NOT NULL | 語言代碼 |
| `title` | VARCHAR(255) | NOT NULL | 標題 |
| `description` | TEXT | NOT NULL | 題目描述 |
| `input_description` | TEXT | NOT NULL | 輸入說明 |
| `output_description` | TEXT | NOT NULL | 輸出說明 |
| `hint` | TEXT | | 提示 |

**language 值**:
- `zh-TW`: 繁體中文
- `zh-hant`: 繁體中文（別名）
- `en`: 英文

**唯一約束**:
```sql
UNIQUE (problem_id, language)
```

### 3.3 TestCase (測試案例)

**表名**: `test_cases`

**用途**: 儲存題目測試資料

| 欄位名稱 | 型別 | 限制 | 說明 |
|---------|------|------|------|
| `id` | BIGINT | PK, AUTO_INCREMENT | 主鍵 |
| `problem_id` | BIGINT | FK → problems.id | 題目 ID |
| `input_data` | TEXT | NOT NULL | 輸入資料 |
| `output_data` | TEXT | NOT NULL | 預期輸出 |
| `is_sample` | BOOLEAN | DEFAULT false | 是否為範例 |
| `is_hidden` | BOOLEAN | DEFAULT false | 是否隱藏 |
| `score` | INTEGER | DEFAULT 0 | 分數 |
| `order` | INTEGER | DEFAULT 0 | 排序 |

**關聯**:
- `problem_id` → `problems.id` (MANY-TO-ONE, CASCADE DELETE)

### 3.4 LanguageConfig (語言設定)

**表名**: `problem_language_configs`

**用途**: 儲存語言特定設定

| 欄位名稱 | 型別 | 限制 | 說明 |
|---------|------|------|------|
| `id` | BIGINT | PK, AUTO_INCREMENT | 主鍵 |
| `problem_id` | BIGINT | FK → problems.id | 題目 ID |
| `language` | VARCHAR(20) | NOT NULL | 程式語言 |
| `template_code` | TEXT | DEFAULT '' | 範本程式碼 |
| `is_enabled` | BOOLEAN | DEFAULT true | 是否啟用 |
| `order` | INTEGER | DEFAULT 0 | 排序 |

**language 值**:
- `cpp`: C++
- `python`: Python
- `java`: Java
- `javascript`: JavaScript

**唯一約束**:
```sql
UNIQUE (problem_id, language)
```

### 3.5 Tag (標籤)

**表名**: `tags`

**用途**: 題目分類標籤

| 欄位名稱 | 型別 | 限制 | 說明 |
|---------|------|------|------|
| `id` | BIGINT | PK, AUTO_INCREMENT | 主鍵 |
| `name` | VARCHAR(50) | UNIQUE, NOT NULL | 標籤名稱 |
| `slug` | VARCHAR(50) | UNIQUE, NOT NULL | URL Slug |
| `description` | TEXT | | 描述 |
| `color` | VARCHAR(7) | DEFAULT '#0f62fe' | 顏色（Hex）|
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 建立時間 |

**多對多關聯**:
```sql
CREATE TABLE problem_tags (
    problem_id BIGINT REFERENCES problems(id) ON DELETE CASCADE,
    tag_id BIGINT REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (problem_id, tag_id)
);
```

---

## 4. 提交系統

### 4.1 Submission (提交記錄)

**表名**: `submissions`

**用途**: 儲存程式碼提交

| 欄位名稱 | 型別 | 限制 | 說明 |
|---------|------|------|------|
| `id` | BIGINT | PK, AUTO_INCREMENT | 主鍵 |
| `user_id` | BIGINT | FK → users.id | 使用者 ID |
| `problem_id` | BIGINT | FK → problems.id | 題目 ID |
| `contest_id` | BIGINT | FK → contests.id, NULLABLE | 競賽 ID |
| **source_type** | VARCHAR(10) | DEFAULT 'practice' | 來源類型 |
| `language` | VARCHAR(20) | NOT NULL | 程式語言 |
| `code` | TEXT | NOT NULL | 程式碼 |
| **is_test** | BOOLEAN | DEFAULT false | 是否為測試提交 |
| **custom_test_cases** | JSONB | DEFAULT '[]' | 自訂測資 |
| `status` | VARCHAR(10) | DEFAULT 'pending' | 評測狀態 |
| `score` | INTEGER | DEFAULT 0 | 分數 |
| `exec_time` | INTEGER | DEFAULT 0 | 執行時間（毫秒）|
| `memory_usage` | INTEGER | DEFAULT 0 | 記憶體使用（KB）|
| `error_message` | TEXT | | 錯誤訊息 |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 提交時間 |
| `updated_at` | TIMESTAMP | AUTO UPDATE | 更新時間 |

**source_type 值**:
- `practice`: 練習
- `contest`: 競賽

**language 值**:
- `cpp`: C++ 20
- `python`: Python 3.11
- `c`: C 11
- `java`: Java 17

**status 值**:
- `pending`: 待評測
- `judging`: 評測中
- `AC`: Accepted（通過）
- `WA`: Wrong Answer（答案錯誤）
- `TLE`: Time Limit Exceeded（超時）
- `MLE`: Memory Limit Exceeded（記憶體超限）
- `RE`: Runtime Error（執行錯誤）
- `CE`: Compilation Error（編譯錯誤）
- `KR`: Keyword Restriction（關鍵字限制）
- `SE`: System Error（系統錯誤）

**索引**:
```sql
CREATE INDEX idx_submissions_user_created ON submissions(user_id, created_at DESC);
CREATE INDEX idx_submissions_problem_created ON submissions(problem_id, created_at DESC);
CREATE INDEX idx_submissions_contest_created ON submissions(contest_id, source_type, created_at DESC);
CREATE INDEX idx_submissions_status_created ON submissions(status, created_at DESC);
CREATE INDEX idx_submissions_source_test_created ON submissions(source_type, is_test, created_at DESC);
```

### 4.2 SubmissionResult (評測結果)

**表名**: `submission_results`

**用途**: 儲存每個測試案例的評測結果

| 欄位名稱 | 型別 | 限制 | 說明 |
|---------|------|------|------|
| `id` | BIGINT | PK, AUTO_INCREMENT | 主鍵 |
| `submission_id` | BIGINT | FK → submissions.id | 提交 ID |
| `test_case_id` | BIGINT | FK → test_cases.id, NULLABLE | 測試案例 ID |
| `status` | VARCHAR(10) | NOT NULL | 狀態 |
| `exec_time` | INTEGER | DEFAULT 0 | 執行時間（毫秒）|
| `memory_usage` | INTEGER | DEFAULT 0 | 記憶體使用（KB）|
| `output` | TEXT | | 實際輸出 |
| `error_message` | TEXT | | 錯誤訊息 |
| **input_data** | TEXT | NULLABLE | 輸入資料快照 |
| **expected_output** | TEXT | NULLABLE | 預期輸出快照 |

**註**: `test_case_id` 可為 NULL，用於自訂測資

**關聯**:
- `submission_id` → `submissions.id` (MANY-TO-ONE, CASCADE DELETE)
- `test_case_id` → `test_cases.id` (MANY-TO-ONE, SET NULL)

### 4.3 ScreenEvent (螢幕事件)

**表名**: `screen_events`

**用途**: 考試模式監控

| 欄位名稱 | 型別 | 限制 | 說明 |
|---------|------|------|------|
| `id` | BIGINT | PK, AUTO_INCREMENT | 主鍵 |
| `submission_id` | BIGINT | FK → submissions.id | 提交 ID |
| `event_type` | VARCHAR(20) | NOT NULL | 事件類型 |
| `timestamp` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 發生時間 |
| `details` | JSONB | DEFAULT '{}' | 詳細資訊 |

**event_type 值**:
- `blur`: 視窗失焦
- `focus`: 視窗聚焦
- `copy`: 複製
- `paste`: 貼上
- `fullscreen_exit`: 退出全螢幕

---

## 5. 競賽系統

### 5.1 Contest (競賽)

**表名**: `contests`

**用途**: 儲存競賽基本資料

| 欄位名稱 | 型別 | 限制 | 說明 |
|---------|------|------|------|
| `id` | BIGINT | PK, AUTO_INCREMENT | 主鍵 |
| `name` | VARCHAR(255) | DEFAULT '' | 競賽名稱 |
| `description` | TEXT | | 描述 |
| `rules` | TEXT | | 規則 |
| `start_time` | TIMESTAMP | NULLABLE | 開始時間 |
| `end_time` | TIMESTAMP | NULLABLE | 結束時間 |
| `owner_id` | BIGINT | FK → users.id, NULLABLE | 主辦者 |
| `visibility` | VARCHAR(20) | DEFAULT 'public' | 可見性 |
| `password` | VARCHAR(255) | NULLABLE | 密碼（可選）|
| **status** | VARCHAR(20) | DEFAULT 'inactive' | 狀態 |
| **exam_mode_enabled** | BOOLEAN | DEFAULT false | 考試模式 |
| **scoreboard_visible_during_contest** | BOOLEAN | DEFAULT false | 競賽中顯示排行榜 |
| **anonymous_mode_enabled** | BOOLEAN | DEFAULT false | 匿名模式 |
| `allow_view_results` | BOOLEAN | DEFAULT true | 允許查看結果 |
| `allow_multiple_joins` | BOOLEAN | DEFAULT false | 允許多次加入 |
| **allow_auto_unlock** | BOOLEAN | DEFAULT false | 允許自動解鎖 |
| **auto_unlock_minutes** | INTEGER | DEFAULT 0 | 自動解鎖時間（分鐘）|
| **max_cheat_warnings** | INTEGER | DEFAULT 3 | 最大違規警告數 |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 建立時間 |
| `updated_at` | TIMESTAMP | AUTO UPDATE | 更新時間 |

**visibility 值**:
- `public`: 公開
- `private`: 私密

**status 值**:
- `active`: 啟用
- `inactive`: 停用
- `archived`: 封存

**索引**:
```sql
CREATE INDEX idx_contests_status ON contests(status);
CREATE INDEX idx_contests_start_time ON contests(start_time);
CREATE INDEX idx_contests_owner ON contests(owner_id);
```

**虛擬欄位**:
```python
@property
def computed_status(self):
    """根據時間計算動態狀態"""
    if self.status == 'inactive':
        return 'inactive'
    if not self.start_time or not self.end_time:
        return 'inactive'
    now = timezone.now()
    if now < self.start_time:
        return 'upcoming'
    elif now <= self.end_time:
        return 'ongoing'
    else:
        return 'finished'
```

**多對多關聯（管理員）**:
```sql
CREATE TABLE contest_admins (
    contest_id BIGINT REFERENCES contests(id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (contest_id, user_id)
);
```

### 5.2 ContestProblem (競賽題目)

**表名**: `contest_problems`

**用途**: 競賽與題目的關聯

| 欄位名稱 | 型別 | 限制 | 說明 |
|---------|------|------|------|
| `id` | BIGINT | PK, AUTO_INCREMENT | 主鍵 |
| `contest_id` | BIGINT | FK → contests.id | 競賽 ID |
| `problem_id` | BIGINT | FK → problems.id | 題目 ID |
| `order` | INTEGER | DEFAULT 0 | 排序 |

**唯一約束**:
```sql
UNIQUE (contest_id, problem_id)
```

**虛擬欄位**:
```python
@property
def label(self):
    """自動生成標籤（A, B, C, ...）"""
    if self.order < 26:
        return chr(65 + self.order)
    return f"P{self.order + 1}"
```

### 5.3 ContestParticipant (參賽者)

**表名**: `contest_participants`

**用途**: 競賽參賽記錄

| 欄位名稱 | 型別 | 限制 | 說明 |
|---------|------|------|------|
| `id` | BIGINT | PK, AUTO_INCREMENT | 主鍵 |
| `contest_id` | BIGINT | FK → contests.id | 競賽 ID |
| `user_id` | BIGINT | FK → users.id | 使用者 ID |
| `score` | INTEGER | DEFAULT 0 | 總分 |
| `rank` | INTEGER | NULLABLE | 排名 |
| **exam_status** | VARCHAR(20) | DEFAULT 'not_started' | 考試狀態 |
| **nickname** | VARCHAR(50) | DEFAULT '' | 暱稱（匿名模式）|
| **violation_count** | INTEGER | DEFAULT 0 | 違規次數 |
| **locked_at** | TIMESTAMP | NULLABLE | 鎖定時間 |
| **lock_reason** | TEXT | | 鎖定原因 |
| `joined_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 加入時間 |
| **started_at** | TIMESTAMP | NULLABLE | 開始時間 |
| `left_at` | TIMESTAMP | NULLABLE | 離開時間 |

**exam_status 值**:
- `not_started`: 未開始
- `in_progress`: 進行中
- `paused`: 暫停
- `locked`: 已鎖定
- `submitted`: 已交卷

**唯一約束**:
```sql
UNIQUE (contest_id, user_id)
```

**虛擬欄位**:
```python
@property
def has_finished_exam(self):
    return self.exam_status == 'submitted'
```

### 5.4 ContestAnnouncement (競賽公告)

**表名**: `contest_announcements`

**用途**: 競賽公告

| 欄位名稱 | 型別 | 限制 | 說明 |
|---------|------|------|------|
| `id` | BIGINT | PK, AUTO_INCREMENT | 主鍵 |
| `contest_id` | BIGINT | FK → contests.id | 競賽 ID |
| `title` | VARCHAR(255) | NOT NULL | 標題 |
| `content` | TEXT | NOT NULL | 內容 |
| `created_by` | BIGINT | FK → users.id, NULLABLE | 發布者 |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 發布時間 |
| `updated_at` | TIMESTAMP | AUTO UPDATE | 更新時間 |

### 5.5 Clarification (Q&A)

**表名**: `contest_clarifications`

**用途**: 競賽 Q&A 系統

| 欄位名稱 | 型別 | 限制 | 說明 |
|---------|------|------|------|
| `id` | BIGINT | PK, AUTO_INCREMENT | 主鍵 |
| `contest_id` | BIGINT | FK → contests.id | 競賽 ID |
| `problem_id` | BIGINT | FK → problems.id, NULLABLE | 題目 ID |
| `author_id` | BIGINT | FK → users.id | 提問者 |
| `question` | TEXT | NOT NULL | 問題 |
| `answer` | TEXT | NULLABLE | 回答 |
| `is_public` | BOOLEAN | DEFAULT false | 是否公開 |
| `status` | VARCHAR(20) | DEFAULT 'pending' | 狀態 |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 提問時間 |
| `answered_at` | TIMESTAMP | NULLABLE | 回答時間 |

**status 值**:
- `pending`: 待回答
- `answered`: 已回答

### 5.6 ExamEvent (考試事件)

**表名**: `exam_events`

**用途**: 考試模式事件記錄

| 欄位名稱 | 型別 | 限制 | 說明 |
|---------|------|------|------|
| `id` | BIGINT | PK, AUTO_INCREMENT | 主鍵 |
| `contest_id` | BIGINT | FK → contests.id | 競賽 ID |
| `user_id` | BIGINT | FK → users.id | 使用者 ID |
| `event_type` | VARCHAR(50) | NOT NULL | 事件類型 |
| `metadata` | JSONB | NULLABLE | 額外資訊 |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 發生時間 |

**event_type 值**:
- `tab_hidden`: Tab 隱藏
- `window_blur`: 視窗失焦
- `exit_fullscreen`: 退出全螢幕
- `forbidden_focus_event`: 禁止的焦點事件

**索引**:
```sql
CREATE INDEX idx_exam_events_contest_user ON exam_events(contest_id, user_id);
CREATE INDEX idx_exam_events_created ON exam_events(created_at);
```

### 5.7 ContestActivity (活動日誌)

**表名**: `contest_activities`

**用途**: 競賽活動記錄

| 欄位名稱 | 型別 | 限制 | 說明 |
|---------|------|------|------|
| `id` | BIGINT | PK, AUTO_INCREMENT | 主鍵 |
| `contest_id` | BIGINT | FK → contests.id | 競賽 ID |
| `user_id` | BIGINT | FK → users.id | 操作者 |
| `action_type` | VARCHAR(50) | NOT NULL | 動作類型 |
| `details` | TEXT | NOT NULL | 詳細內容 |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 發生時間 |

**action_type 值**:
- `register`: 註冊
- `enter_contest`: 進入競賽
- `start_exam`: 開始考試
- `end_exam`: 結束考試
- `lock_user`: 鎖定使用者
- `unlock_user`: 解鎖使用者
- `submit_code`: 提交程式碼
- `ask_question`: 提問
- `reply_question`: 回答問題
- `update_problem`: 更新題目
- `announce`: 發布公告
- `other`: 其他

**索引**:
```sql
CREATE INDEX idx_contest_activities_contest_created ON contest_activities(contest_id, created_at DESC);
```

---

## 6. 通知與公告

### 6.1 Notification (通知)

**表名**: `notifications`

**用途**: 使用者通知

| 欄位名稱 | 型別 | 限制 | 說明 |
|---------|------|------|------|
| `id` | BIGINT | PK, AUTO_INCREMENT | 主鍵 |
| `user_id` | BIGINT | FK → users.id | 使用者 ID |
| `title` | VARCHAR(255) | NOT NULL | 標題 |
| `message` | TEXT | NOT NULL | 訊息 |
| `type` | VARCHAR(50) | NOT NULL | 類型 |
| `is_read` | BOOLEAN | DEFAULT false | 是否已讀 |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 建立時間 |

**type 值**:
- `submission`: 提交通知
- `contest`: 競賽通知
- `announcement`: 公告通知
- `system`: 系統通知

### 6.2 Announcement (系統公告)

**表名**: `announcements`

**用途**: 全域系統公告

| 欄位名稱 | 型別 | 限制 | 說明 |
|---------|------|------|------|
| `id` | BIGINT | PK, AUTO_INCREMENT | 主鍵 |
| `title` | VARCHAR(255) | NOT NULL | 標題 |
| `content` | TEXT | NOT NULL | 內容 |
| `priority` | VARCHAR(20) | DEFAULT 'medium' | 優先級 |
| `is_active` | BOOLEAN | DEFAULT true | 是否啟用 |
| `created_by` | BIGINT | FK → users.id | 發布者 |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 建立時間 |
| `updated_at` | TIMESTAMP | AUTO UPDATE | 更新時間 |

**priority 值**:
- `low`: 低
- `medium`: 中
- `high`: 高

---

## 7. 索引策略

### 7.1 效能關鍵索引

```sql
-- Submissions 高頻查詢
CREATE INDEX idx_sub_user_created ON submissions(user_id, created_at DESC);
CREATE INDEX idx_sub_problem_created ON submissions(problem_id, created_at DESC);
CREATE INDEX idx_sub_contest_src ON submissions(contest_id, source_type, created_at DESC);
CREATE INDEX idx_sub_status_created ON submissions(status, created_at DESC);
CREATE INDEX idx_sub_src_test ON submissions(source_type, is_test, created_at DESC);

-- Problems 列表查詢
CREATE INDEX idx_prob_difficulty ON problems(difficulty);
CREATE INDEX idx_prob_visible ON problems(is_visible);
CREATE INDEX idx_prob_practice ON problems(is_practice_visible);

-- Contests 狀態查詢
CREATE INDEX idx_contest_status ON contests(status);
CREATE INDEX idx_contest_start ON contests(start_time);

-- ExamEvents 監控查詢
CREATE INDEX idx_exam_contest_user ON exam_events(contest_id, user_id);
CREATE INDEX idx_exam_created ON exam_events(created_at);
```

### 7.2 複合索引設計原則

1. **選擇性高的欄位優先**: 將區分度高的欄位放前面
2. **查詢頻率**: 考慮查詢頻率決定是否建立索引
3. **排序欄位**: 包含 `ORDER BY` 的欄位
4. **避免過多索引**: 影響寫入效能

---

## 8. 資料完整性

### 8.1 外鍵約束

所有外鍵都設定適當的 `ON DELETE` 行為：

| 關聯 | ON DELETE |
|------|-----------|
| `Submission.user_id` | CASCADE |
| `Submission.problem_id` | CASCADE |
| `Submission.contest_id` | SET NULL |
| `SubmissionResult.submission_id` | CASCADE |
| `SubmissionResult.test_case_id` | SET NULL |
| `TestCase.problem_id` | CASCADE |
| `ContestProblem.contest_id` | CASCADE |
| `ContestProblem.problem_id` | CASCADE |
| `ContestParticipant.contest_id` | CASCADE |
| `ContestParticipant.user_id` | CASCADE |

### 8.2 資料驗證

**Django Model 層級驗證**:
- Email 格式驗證
- 密碼強度驗證（8 字元以上）
- 角色值驗證
- 狀態值驗證

**資料庫層級約束**:
- UNIQUE 約束
- CHECK 約束
- NOT NULL 約束
- 外鍵約束

### 8.3 交易管理

關鍵操作使用交易：
- 提交評測更新（Submission + SubmissionResult + Problem stats）
- 競賽註冊（ContestParticipant + ContestActivity）
- 使用者統計更新（UserProfile.update_statistics）

---

## 9. 資料遷移

### 9.1 遷移檔案位置

```
backend/apps/
├── users/migrations/
├── problems/migrations/
├── submissions/migrations/
├── contests/migrations/
├── notifications/migrations/
└── announcements/migrations/
```

### 9.2 重要遷移

- **0001_initial.py**: 初始資料庫結構
- **0003_add_is_test_field.py**: 新增測試提交欄位
- **0004_submission_source_type.py**: 新增來源類型
- **0010_add_performance_indexes.py**: 效能索引
- **0021_add_exam_status.py**: 新增考試狀態
- **0023_anonymous_mode.py**: 匿名模式
- **0024_contest_admins.py**: 多管理員支援

### 9.3 遷移指令

```bash
# 建立遷移
python manage.py makemigrations

# 執行遷移
python manage.py migrate

# 查看遷移狀態
python manage.py showmigrations

# 回退遷移
python manage.py migrate app_name migration_name
```

---

## 10. 效能優化建議

### 10.1 查詢優化

```python
# 使用 select_related (ForeignKey)
submissions = Submission.objects.select_related(
    'user', 'problem', 'contest'
).all()

# 使用 prefetch_related (ManyToMany)
problems = Problem.objects.prefetch_related('tags').all()

# 只選取需要的欄位
submissions = Submission.objects.only(
    'id', 'status', 'score', 'created_at'
).all()
```

### 10.2 快取策略

- Redis 快取熱門題目
- Redis 快取排行榜
- TanStack Query 前端快取（1 分鐘）

### 10.3 統計欄位

使用反正規化儲存統計資料：
- `Problem.submission_count`
- `Problem.accepted_count`
- `UserProfile.solved_count`
- `UserProfile.submission_count`

定期更新（Celery Beat）或觸發器更新。

---

## 11. 備份與還原

### 11.1 備份指令

```bash
# 備份整個資料庫
docker exec oj_postgres pg_dump -U postgres online_judge > backup.sql

# 備份特定表
docker exec oj_postgres pg_dump -U postgres -t problems online_judge > problems_backup.sql
```

### 11.2 還原指令

```bash
# 還原資料庫
docker exec -i oj_postgres psql -U postgres online_judge < backup.sql

# 還原特定表
docker exec -i oj_postgres psql -U postgres online_judge < problems_backup.sql
```

### 11.3 自動備份

Celery Beat 定時任務（每 6 小時）:
```python
'backup-cloud-to-local': {
    'task': 'apps.core.tasks.backup_cloud_to_local',
    'schedule': 60 * 60 * 6,
}
```

---

**QJudge Database** - 穩健、高效、可擴展 🚀
