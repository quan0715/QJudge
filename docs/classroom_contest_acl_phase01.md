# Classroom x Contest ACL（Phase 0-1 定義）

本文定義兩件事：
1. ACL Action Matrix（角色與行為權限矩陣）
2. ContestAccessPolicy 的 classroom-priority 規則

---

## 1) ACL Action Matrix（Canonical）

### 1.1 角色詞彙（Canonical Scope Roles）

- `platform_admin`：系統管理員（`is_staff` / `is_superuser`）
- `owner`：教室擁有者（Classroom owner）
- `manager`：教室管理者（TA + classroom admins）
- `student`：教室學生
- `outsider`：已登入但非該教室成員
- `anonymous`：未登入

在 contest 權限引擎中，對應為：
- `platform_admin -> platform_admin`
- `owner -> owner`
- `manager -> manager`（相容 alias：`co_owner`）
- `student -> participant`
- `outsider -> outsider`
- `anonymous -> anonymous`

### 1.2 行為矩陣（Permission Set）

| Permission | platform_admin | owner | manager | student | outsider | anonymous |
|---|---|---|---|---|---|---|
| `manage_contest_lifecycle` | Y | Y | N | N | N | N |
| `manage_contest_settings` | Y | Y | Y | N | N | N |
| `manage_participants` | Y | Y | Y | N | N | N |
| `manage_problems` | Y | Y | Y | N | N | N |
| `view_scoreboard_full` | Y | Y | Y | N | N | N |
| `view_scoreboard_limited` | N | N | N | Y | N | N |
| `view_report` / `export_report` | Y | Y | Y | N | N | N |
| `view_all_submissions` | Y | Y | Y | N | N | N |
| `submit` | Y | Y | Y | Y | N | N |
| `manage_clarifications` | Y | Y | Y | N | N | N |
| `create_clarification` | N | N | N | Y | N | N |
| `view_draft` / `view_archived` | Y | Y | Y | N | N | N |
| `view_own_report` | Y | Y | Y | Y* | Y* | N |
| `view_public_contest` | N | N | N | N | Y | Y |

註：
- `view_own_report` 對 `student/outsider` 僅代表「通過角色層」，仍需 context check（必須是 participant 且已 submitted）。

---

## 2) ContestAccessPolicy：classroom-priority

### 2.1 決策規則

在 `CONTEST_ACL_CLASSROOM_SOURCE_ENABLED=true` 且 contest 已綁定 classroom 時：

1. 先取綁定 classroom（目前採 deterministic first：`order_by(bound_at).first()`）。
2. 由 classroom 計算 scope role：`platform_admin|owner|manager|student|outsider|anonymous`。
3. 映射為 contest scope role（見上表）後進入既有 `ContestAccessPolicy` 檢查。

在以下情況回退舊邏輯（`get_contest_scope_role`）：
- feature flag 關閉
- contest 無 classroom 綁定

### 2.2 相容期策略

- 保留 `co_owner` 與 `manager` alias（同權限集合），避免舊資料/舊檢查器斷裂。
- 既有 API 契約不變；僅調整角色來源解析。
- 多 classroom 綁定目前以第一個 binding 決定權限來源；後續若改為單一權限來源，需在 model 與資料約束層補強。

### 2.3 風險與後續（不在本階段）

- contest owner/co-owner 權限與 classroom 權限的最終收斂（資料遷移）。
- classroom-bound contest 的唯一綁定約束。
- 前後端角色欄位名稱全面 canonical 化（owner/manager/student）。

