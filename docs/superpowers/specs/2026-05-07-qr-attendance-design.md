# QJudge QR Attendance Design

- 日期：2026-05-07
- 分支：dev
- 狀態：Approved for implementation planning

## 目標

建立一套不依賴考試密碼的現場 QR 簽到 / 簽退流程。教師端提供投屏 QR 畫面，學生必須先進入 QJudge 競賽主頁，再用 app 內建 scanner 掃描投屏 token。掃描成功後拍攝現場環境照片，作為到場或離場佐證。所有簽到、簽退、照片與異常都寫入 exam events / evidence，考後產生 Attendance Evidence Report。

## 決策

- 不改 `ExamStatus`。簽到狀態是 attendance domain 的 derived state，不新增 `attendance_open_not_started` 等 exam status。
- QR content 只放 opaque token，不放 URL。一般手機相機掃到只是一串文字；只有 QJudge app 內 scanner 會處理。
- 學生必須先登入並進入競賽主頁。若考試要求簽到，簽到完成等同取得參賽資格。
- Check-in 以學生個人狀態判定：只要該學生尚未開始作答，即使已超過全局 `start_time`，仍可簽到。晚到學生可先簽到再開始。
- Check-out 只在學生已交卷後有效。考試中不提供掃描入口，也拒絕 scan API，避免手機登入造成 active device takeover 或 concurrent login 問題。
- 原本競賽密碼功能全面下架，不保留 fallback、不保留學生端密碼加入流程。
- 教師是否開啟投屏是現場操作，不新增「投屏已開」DB 狀態。投屏頁能取得短效 QR token 即代表現場可以掃描。
- 手機不可用時的 fallback 是教師協助簽到 / 簽退，仍需留下事件與照片，不允許未登入填學號或密碼 fallback。

## 使用者流程

### 教師端投屏

教師進入 attendance projection page，頁面適合投影全螢幕使用。畫面顯示考試名稱、課程或標籤、目前時間、考試倒數或進行中狀態、開始時間、截止時間、總時長，以及兩張 QR card：

- Check-in QR：供尚未開始作答的學生簽到。
- Check-out QR：供已交卷的學生簽退。

兩張 QR 都使用短效 token。投屏頁每 30 秒重新取得 token，token 有效期限 45 秒。每張 QR card 都要顯示剩餘有效秒數、刷新中、過期、錯誤狀態。

### 學生端簽到

學生先登入 QJudge，進入競賽主頁。若 `attendance_check_enabled=true` 且學生尚未完成 check-in photo，主頁顯示「開啟簽到掃描器」，開始作答按鈕 disabled。

學生用 app 內 scanner 掃描投屏 QR。Scanner 只接受 `qj-att:v1:check_in:<token>` 格式，掃到其他 QR 顯示「不是 QJudge 簽到碼」。Token 驗證通過後，頁面要求拍攝現場環境照片。照片應能呈現教室環境與學生考試裝置畫面。提交照片並完成 upload confirm 後，學生取得參賽資格。

若已到 `contest.start_time`，學生可立即開始作答。若尚未到 `contest.start_time`，主頁顯示已簽到與開考倒數。

### 學生端簽退

學生交卷後，競賽主頁顯示簽退狀態與「開啟簽退掃描器」。學生掃描 `qj-att:v1:check_out:<token>` 後拍攝離場照片並提交。缺簽退不阻擋交卷完成，只在 Attendance Evidence Report 標示異常。

### Fallback

若學生手機、camera、browser capability 不可用，教師可在 attendance 管理 UI 選擇學生並執行協助簽到 / 協助簽退。教師端仍必須拍照或上傳照片。事件 metadata 記錄：

- `attendance_mode: "teacher_assisted"`
- `assisted_by_user_id`
- `assisted_by_username`
- `reason`

Report 顯示為教師協助，不視為缺席，但保留特殊來源標籤。

## Backend 設計

### Data model

- `Contest.attendance_check_enabled: boolean`，預設 `false`。
- 移除 `Contest.password` 欄位、`requires_password` API 欄位，以及 contest password helper methods。考試加入不再有密碼 gate。
- `ExamEvent.EVENT_TYPE_CHOICES` 新增：
  - `attendance_check_in`
  - `attendance_check_out`
- `ExamEvidenceFrame.SourceModule` 新增：
  - `attendance`

Attendance state 不進 `ContestParticipant.exam_status`。Backend 以 exam events 與 confirmed evidence frames 計算：

- `attendanceRequired`
- `checkInStatus: "missing" | "event_created" | "photo_confirmed" | "teacher_assisted"`
- `checkOutStatus: "unavailable" | "missing" | "event_created" | "photo_confirmed" | "teacher_assisted"`
- `canCheckIn`
- `canStartExam`
- `canCheckOut`

`canCheckIn = attendanceRequired && participant.exam_status === "not_started"`。

`canStartExam = !attendanceRequired || (checkInStatus is photo_confirmed or teacher_assisted) && now >= contest.start_time`。

`canCheckOut = attendanceRequired && participant.exam_status === "submitted"`。

### Token

QR payload format:

```text
qj-att:v1:<purpose>:<token>
```

`purpose` is `check_in` or `check_out`.

The token is opaque to the frontend. Backend generates a random URL-safe token, stores the contest id and purpose in cache, and validates the token against the short cache TTL.

QR token lifetime is 45 seconds. Projection refresh interval is 30 seconds. The backend does not accept contest ids or user ids from the QR payload.

### API

New attendance endpoints:

- `GET /api/v1/contests/{id}/attendance/qr-token/?purpose=check_in|check_out`
- `POST /api/v1/contests/{id}/attendance/events/`

`POST /attendance/events/` dispatches by `mode`.

Student self-scan:

```json
{
  "mode": "student_self_scan",
  "purpose": "check_in",
  "token": "<opaque-token>",
  "client_observed_at_ms": 1778100750000,
  "device_kind": "mobile"
}
```

Teacher-assisted fallback:

```json
{
  "mode": "teacher_assisted",
  "purpose": "check_in",
  "user_id": 123,
  "reason": "student camera unavailable"
}
```

Mode rules:

- `student_self_scan`: authenticated student, token required, `user_id` forbidden.
- `teacher_assisted`: teacher/admin only, `user_id` and `reason` required, token forbidden.

Admin review uses the existing participant management entry point. The existing participant dashboard payload is extended with:

```json
{
  "attendance": {
    "status": {
      "attendanceRequired": true,
      "checkInStatus": "photo_confirmed",
      "checkOutStatus": "missing",
      "canCheckIn": false,
      "canStartExam": false,
      "canCheckOut": true
    },
    "events": [
      {
        "event_id": 123,
        "purpose": "check_in",
        "recorded_at": "2026-05-07T10:12:30Z",
        "mode": "student_self_scan",
        "evidence_count": 1,
        "metadata": {}
      }
    ],
    "anomalies": ["missing_check_out"]
  }
}
```

Student event payload:

```json
{
  "mode": "student_self_scan",
  "purpose": "check_in",
  "token": "<opaque-token>",
  "client_observed_at_ms": 1778100750000,
  "device_kind": "mobile"
}
```

Response:

```json
{
  "event_id": 123,
  "purpose": "check_in",
  "source_module": "attendance",
  "evidence_cluster_id": "abc123",
  "recorded_at": "2026-05-07T10:12:30Z",
  "attendance_status": {
    "attendanceRequired": true,
    "checkInStatus": "event_created",
    "checkOutStatus": "unavailable",
    "canCheckIn": true,
    "canStartExam": false,
    "canCheckOut": false
  }
}
```

Evidence upload validation changes:

- Attendance event evidence can upload while participant is `not_started`.
- This exception is allowed only when `event.event_type` is `attendance_check_in` or `attendance_check_out` and `source_module=attendance`.
- Non-attendance evidence keeps the existing monitored/submitted restriction.
- `normalize_source_module()` must not convert `attendance` to `screen_share`.

`start_exam` behavior:

- If `attendance_check_enabled=false`, existing behavior stays unchanged.
- If enabled, backend requires check-in event with confirmed attendance evidence or teacher-assisted event before starting.
- Missing check-in returns `403` with code `attendance_check_in_required`.
- Check-in eligibility is independent of global contest start time; start is still blocked until `now >= contest.start_time`.

## Frontend 設計

### Admin settings

Access settings removes contest password UI. For exam contests, it shows QR attendance setting:

- Toggle: `要求現場 QR 簽到`
- Description: `啟用後，學生必須在競賽主頁使用 QJudge 掃描器完成簽到與照片上傳，才可開始作答。`

No password fallback is rendered.

### Projection page

Route:

```text
/classrooms/:classroomId/contest/:contestId/admin/attendance/projection
```

The page is full-screen and Carbon token based. It has a single scroll owner and is suitable for browser fullscreen / projector.

Components:

- `AttendanceProjectionScreen`
- `AttendanceQrCard`
- `useAttendanceQrToken`

QR generation uses `@rc-component/qrcode`. The QR value is exactly the `qj-att:` token string returned by backend.

### Student dashboard

Student dashboard displays attendance state before action CTAs:

- Missing check-in: scanner CTA visible, start disabled.
- Check-in photo confirmed before `start_time`: signed-in state and start countdown.
- Check-in photo confirmed after `start_time`: start enabled.
- Submitted without checkout: checkout scanner CTA visible.
- Submitted with checkout: checkout complete state.

No scan CTA is shown when `exam_status` is `in_progress`, `paused`, or `locked`.

### Scanner / capture

Student scanner is app-internal. It uses `getUserMedia` with the browser `BarcodeDetector` API. Unsupported browsers show the teacher-assisted fallback message.

Route:

```text
/classrooms/:classroomId/contest/:contestId/attendance/scan
```

The scanner reads QR text, validates prefix, extracts purpose and token, then calls attendance event API. After event creation, the capture step opens live camera preview and submits one image as `attendance` evidence via existing evidence upload APIs.

UI states:

- camera unsupported
- permission denied
- scanning
- invalid QR
- token expired
- event created
- capture preview
- retake
- uploading
- success
- retryable upload failure

## Attendance Evidence In Participant Management

There is no separate admin attendance report page in v1. Attendance review is embedded into the existing Overview participant management flow:

- `AdminOverviewCommandCenter` keeps participant list as the main entry point.
- Selecting a participant opens the existing `ParticipantDashboardPane`.
- `ParticipantDashboardPane` gets an `Attendance` detail tab or section.
- `ParticipantOperationsPane` gets teacher-assisted check-in/check-out actions.
- Overview-level anomaly cues can be added to participant rows or summary widgets, but they navigate to the selected participant detail instead of a new page.

Within participant management, anomaly order is:

1. Missing check-in
2. Check-in photo missing
3. Submitted but missing check-out
4. Check-out photo missing
5. Time anomaly
6. Teacher-assisted
7. Normal

The attendance section includes student identity, exam status, check-in time, check-out time, evidence counts, anomaly tags, and expandable attendance photos. Photos use the existing evidence frame presign / screenshot fetch path filtered by `source_module=attendance`.

## Non-goals

- No native app implementation in this phase.
- No URL-based scan fallback.
- No password fallback.
- No standalone admin attendance report route or admin sidebar item.
- No changes to `/solve`, exam answer renderer, autosave, grading, or anti-cheat runtime beyond attendance gate checks.
- No new `ExamStatus` values.

## Acceptance Criteria

- Teacher can project short-lived check-in/check-out QR tokens.
- Student can only submit QR tokens through QJudge scanner after entering contest homepage.
- Late students can check in after global `start_time` if their personal `exam_status` is still `not_started`.
- Students cannot scan during `in_progress`, `paused`, or `locked`.
- Start exam requires confirmed check-in evidence when attendance is enabled.
- Submitted students can check out; missing checkout appears in report but does not block submission.
- Password join is removed from backend and frontend.
- Attendance evidence works in `not_started` only for attendance events.
