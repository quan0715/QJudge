# 資料庫設計文檔 (Database Design)

## 文檔說明

本文檔定義 OJ 平台的 PostgreSQL 資料庫架構，包括表結構、關係、索引和優化策略。

**資料庫系統**：PostgreSQL 15+

---

## 1. 資料庫設計原則

- **正規化**：3NF
- **命名規範**：snake_case (e.g., `user_id`, `created_at`)
- **主鍵**：`id BIGSERIAL PRIMARY KEY`
- **通用欄位**：`created_at`, `updated_at`

---

## 2. ER 圖 (Entity-Relationship)

(參見 AGENT_GUIDE.md 或使用 Mermaid 渲染)

---

## 3. 詳細表結構

### 3.1 使用者管理 (Users)

#### `users`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PK | |
| username | VARCHAR(50) | UNIQUE, NOT NULL | |
| email | VARCHAR(100) | UNIQUE, NOT NULL | |
| password_hash | VARCHAR(255) | NULL | Null for OAuth users |
| auth_provider | VARCHAR(20) | DEFAULT 'email' | 'nycu-oauth', 'email' |
| oauth_id | VARCHAR(255) | | External ID |
| role | VARCHAR(20) | DEFAULT 'student' | 'student', 'teacher', 'admin' |
| is_active | BOOLEAN | DEFAULT TRUE | |
| created_at | TIMESTAMP | | |

#### `user_profiles`
- 統計資訊：`solved_count`, `submission_count`, `accept_rate`
- 設定：`preferred_language`, `theme`

---

### 3.2 題目管理 (Problems)

#### `problems`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PK | |
| number | VARCHAR(20) | UNIQUE | e.g., 'P001' |
| difficulty | VARCHAR(20) | | 'easy', 'medium', 'hard' |
| translations | JSONB | NOT NULL | `{ "zh-TW": {...}, "en": {...} }` |
| time_limit | DECIMAL | DEFAULT 1.0 | Seconds |
| memory_limit | INT | DEFAULT 256 | MB |
| tags | VARCHAR[] | | Array of tags |
| is_public | BOOLEAN | DEFAULT FALSE | |
| created_by | BIGINT | FK(users) | |

#### `test_cases`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PK | |
| problem_id | BIGINT | FK(problems) | |
| input_data | TEXT | | Or file path for large data |
| output_data | TEXT | | |
| is_sample | BOOLEAN | | Visible in problem description |
| score | INT | | Score for this case |
| order_num | INT | | Execution order |

---

### 3.3 提交與評測 (Submissions)

#### `submissions`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PK | |
| user_id | BIGINT | FK(users) | |
| problem_id | BIGINT | FK(problems) | |
| contest_id | BIGINT | FK(contests), NULL | NULL for practice |
| language | VARCHAR(20) | NOT NULL | |
| code | TEXT | NOT NULL | |
| status | VARCHAR(20) | DEFAULT 'pending' | AC, WA, TLE... |
| score | INT | | Total score |
| exec_time | DECIMAL | | Max execution time |
| memory_usage | INT | | Max memory usage |
| submitted_at | TIMESTAMP | DEFAULT NOW() | |

#### `submission_results`
- 每個測試點的詳細結果 (`test_case_id`, `status`, `exec_time`, `memory`)

---

### 3.4 考試系統 (Contests)

#### `contests`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PK | |
| title | VARCHAR(200) | NOT NULL | |
| start_time | TIMESTAMP | NOT NULL | |
| end_time | TIMESTAMP | NOT NULL | |
| settings | JSONB | | `{ "password": "...", "anti_cheat": true }` |
| creator_id | BIGINT | FK(users) | |

#### `contest_problems`
- 關聯表：`contest_id`, `problem_id`, `order_num`, `score`

#### `contest_participants`
- 關聯表：`contest_id`, `user_id`, `score`, `rank`

#### `screen_events`
- 螢幕監控記錄：`contest_id`, `user_id`, `event_type` ('blur', 'focus'), `timestamp`

---

## 4. 索引策略 (Indexing)

- **Users**: `email`, `username`, `oauth_id`
- **Problems**: `number`, `tags` (GIN index), `translations` (GIN index for search)
- **Submissions**: `user_id`, `problem_id`, `contest_id`, `status`, `submitted_at` (DESC)
- **Contests**: `start_time`, `end_time`

---

## 5. 視圖與函數 (Views & Functions)

- **Trigger**: `update_updated_at_column()` - 自動更新 `updated_at`
- **View**: `contest_rankings` - 即時計算考試排名

---

## 6. 備份策略

- 每日全量備份 (pg_dump)
- 保留 7 天
- 備份檔案加密存儲
