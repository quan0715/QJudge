# 防作弊模組架構盤整

**Status:** active  
**Last reviewed:** 2026-06-25  
**Scope:** `backend/apps/contests` 的防作弊模型、service、view、Redis/cache、object storage、SFU，以及 `frontend/src/features/contest` 的考試端與監考端防作弊 runtime。

本文件是維護者用的架構盤點，不是教師或學生操作手冊。操作說明請看 `frontend/public/docs/zh-TW/exam-proctoring.md` 與 `frontend/public/docs/zh-TW/exam-precheck-anticheat.md`。

---

## 1. 模組定位

防作弊不是獨立 Django app，而是嵌在 contest/exam workflow 裡的完整性層。它同時涵蓋：

- 監控政策：哪些裝置可以進入、哪些來源要擷取、哪些 detector 要啟用。
- 考試狀態：違規、暫停、鎖定、重新預檢、接管與送出。
- 事件 taxonomy：前端 runtime 送出的事件如何分類、去重、扣點與呈現。
- 證據鏈：事件前後 frame 的 manifest、object storage 上傳、監考端查閱。
- 即時監看：Cloudflare Realtime SFU broker 與 per-source publisher registry。
- 裝置完整性：active session、heartbeat、JTI pinning、concurrent login/takeover。

`Contest.cheat_detection_enabled` 是監控 runtime 的開關，但裝置 session integrity 不能直接等同這個開關。active session、heartbeat、JTI pinning 與 conflict/takeover 屬於考試完整性底層，會影響所有 exam contest 的進入與續考行為。

---

## 2. Canonical Ownership

| 責任 | Canonical owner | 主要 consumer | 維護規則 |
| --- | --- | --- | --- |
| 防作弊政策 normalization | `backend/apps/contests/services/anticheat_config.py` | `ContestViewSet.anticheat_config`、前端 mapper | 後端是 source of truth。前端只能驗證、映射與執行，不應自行補新的 policy rule。 |
| 預設 device policy | `backend/apps/contests/models.py::default_anticheat_device_policy` | `normalize_anticheat_device_policy`、admin settings | 預設值變更要同步測 `test_anticheat_config_api.py` 與前端 policy tests。 |
| 事件 taxonomy 與扣點 | `backend/apps/contests/constants.py` | `exam_events.py`、admin event feed、前端 orchestrator mirror | 新事件必須同時更新 backend constants、model choices、frontend entity/route/orchestrator/tests。 |
| participant 狀態轉換 | `backend/apps/contests/views/exam_events.py`、`services/participant_state.py`、`services/exam_takeover.py` | 學生考試頁、TA dashboard、admin actions | 狀態轉換只放 backend。前端只能依 API 回應更新 UI。 |
| exam session/cache | `backend/apps/contests/services/anti_cheat_session.py` | exam events、takeover、auth/JTI pinning | Redis/cache 是 session state，不是永久證據來源。 |
| 證據 manifest | `backend/apps/contests/models.py::ExamEvidenceFrame` | `exam_evidence.py`、TA screenshot APIs | DB row 是證據索引與狀態 source of truth。object storage 只存 frame bytes。 |
| 證據 object storage | `backend/apps/contests/services/anticheat_storage.py` | upload intents/confirm、screenshots | Browser 不直接組 storage path，必須經 backend presigned URL。 |
| SFU broker/registry | `backend/apps/contests/views/exam_sfu.py`、`services/realtime_sfu.py`、`services/realtime_sfu_registry.py` | 前端 publisher/subscriber | Browser 不能取得 app secret；backend broker 負責 session/track negotiation。 |
| 前端 runtime plan | `frontend/src/features/contest/domain/anticheatModulePolicy.ts` | precheck、exam mode wrapper、capture hooks | 只依 backend effective config 與 client capability 產生 runtime plan。 |
| 前端 violation lifecycle | `frontend/src/features/contest/domain/violationRoutes.ts`、`features/contest/anticheat/orchestrator.ts` | `useViolationPipeline`、capture hooks | route registry 管 detector lifecycle；orchestrator 管 phase、priority、dedupe、idempotency。 |
| Admin policy projection | `frontend/src/features/contest/components/admin/settings/anticheatPolicyModel.ts` | contest settings UI | UI projection 可以轉換語意，但不能繞過 backend normalization。 |

---

## 3. Backend Inventory

### 3.1 Data model

| Model | 欄位/概念 | 說明 |
| --- | --- | --- |
| `Contest` | `cheat_detection_enabled` | 是否啟用防作弊 runtime。 |
| `Contest` | `anticheat_device_policy` | desktop/tablet 的 source 與 detector policy。 |
| `Contest` | `warning_timeout_seconds` | 舊警告流程保留欄位，仍會進 payload，但不是新 detector lifecycle 的主要來源。 |
| `Contest` | `screen_share_recovery_grace_ms` | screen-share recovery grace 的 per-contest 欄位。 |
| `Contest` | `max_cheat_warnings` | 違規門檻設定。 |
| `ContestParticipant` | `exam_status` | `not_started`、`in_progress`、`paused`、`locked`、`submitted`。 |
| `ContestParticipant` | `violation_count`、`locked_at`、`lock_reason`、`submit_reason` | penalty 與終端狀態紀錄。 |
| `ExamEvent` | `event_type`、`metadata`、`occurred_at` | 防作弊與考試生命週期事件。 |
| `ExamEvidenceFrame` | `source_module`、`evidence_mode`、`status`、`object_key` | 事件證據 frame manifest。 |

`ExamEvidenceFrame` 是目前證據鏈的主要資料模型。舊的 video evidence model 已移除，migration history 保留在 `backend/apps/contests/migrations/0072_drop_exam_evidence_video_models.py` 與 `0074_exam_evidence_frame.py`。

### 3.2 Service/view boundary

| 檔案 | 責任 |
| --- | --- |
| `services/anticheat_config.py` | 正規化 device policy，建立 `anticheat-config` payload。 |
| `views/contest.py` | 暴露 `GET /api/v1/contests/{id}/anticheat-config/`，並在 contest update 後清 config cache。 |
| `services/anti_cheat_session.py` | active session、conflict token、event idempotency、incident-family dedupe、heartbeat、exam JTI pinning。 |
| `views/exam_events.py` | 接收 exam event、處理 heartbeat、event idempotency、evidence metadata normalization、penalty/state transition。 |
| `views/exam_anticheat.py` | 舊背景 capture presigned URL 與 active session admin API。 |
| `views/exam_evidence.py` | manifest-backed evidence upload intents、upload confirm、TA screenshots。 |
| `services/anticheat_storage.py` | S3-compatible client、object key、presigned PUT/GET、object head validation。 |
| `views/exam_sfu.py` | SFU broker API，替 browser 建立 session、add tracks、renegotiate。 |
| `services/realtime_sfu.py` | Cloudflare Realtime SFU API client。 |
| `services/realtime_sfu_registry.py` | per-source publisher registry，cache-backed，含 legacy publisher key fallback。 |
| `services/exam_takeover.py` | 裝置接管、participant pause、heartbeat/session/JTI 處理。 |
| `services/participant_state.py` | admin reset/unlock/update、contest access reconciliation、active-state cleanup。 |

### 3.3 Cache and storage state

| 類型 | Owner | 用途 |
| --- | --- | --- |
| `contest_anticheat_config:{contest_id}` | `views/contest.py` | config payload short TTL cache。 |
| active session keys | `anti_cheat_session.py` | contest/user/device 的目前考試 session。 |
| conflict token keys | `anti_cheat_session.py` | concurrent login 與 takeover flow。 |
| event idempotency keys | `anti_cheat_session.py` | 避免同一事件重送造成重複扣點。 |
| incident-family keys | `anti_cheat_session.py` | 後端語意層 dedupe，避免同一 family 在 TTL 內重複 penalty。 |
| heartbeat keys | `anti_cheat_session.py` | runtime liveness。`heartbeat` event 不落 DB。 |
| exam JTI pin keys | `anti_cheat_session.py` | 考試期間 token pinning 與 blacklist cleanup。 |
| SFU publisher registry | `realtime_sfu_registry.py` | active WebRTC publisher lookup。不是永久證據。 |
| object storage key | `anticheat_storage.py` | `contest_{contest_id}/user_{user_id}/session_{upload_session_id}/{module}/ts_{ts_ms}_seq_{seq}.webp`。 |

---

## 4. Frontend Inventory

### 4.1 Layer placement

| Layer | 防作弊相關檔案 | 規則 |
| --- | --- | --- |
| `core/entities` | `contest.entity.ts` | 型別與純 domain shape。不可 fetch、不可碰 DOM、不可放 UI side effect。 |
| `infrastructure/mappers` | `contest.anticheat.mapper.ts` | DTO 驗證與 snake/camel mapping。不得新增 runtime policy。 |
| `features/contest/domain` | `anticheatModulePolicy.ts`、`violationRoutes.ts` | contest feature 的純規則與 route registry。 |
| `features/contest/anticheat` | `orchestrator.ts`、`forcedCapture.ts`、handoff/SFU/media helpers | runtime coordination、phase、dedupe、capture lifecycle。 |
| `features/contest/screens/paperExam/hooks` | `useAnticheatScreenCapture.ts`、`useAnticheatWebcamCapture.ts`、`anticheat/*` | Browser API、frame ring buffer、upload pipeline、SFU publisher。 |
| `features/contest/components/admin` | incident/evidence/settings components | TA/admin 顯示與設定投影。 |

Import direction 要維持既有規則：`features -> shared/core/infrastructure`、`infrastructure -> core`、`core -> core`。不要讓 `core` import `features` 或 `infrastructure`。

### 4.2 Runtime pieces

| 檔案 | 責任 |
| --- | --- |
| `hooks/useContestAnticheatConfig.ts` | 讀取 `anticheat-config`，並在 visibility change 後 refresh。 |
| `domain/anticheatModulePolicy.ts` | 依 client capability 與 device policy 產生 precheck/runtime monitoring plan。 |
| `domain/violationRoutes.ts` | 定義 detector lifecycle：triggered、grace、escalated、restored、continued event。 |
| `anticheat/orchestrator.ts` | 管理 PRECHECK/ACTIVE/DEGRADED/TERMINATING/TERMINAL phase、priority、dedupe、idempotency key。 |
| `anticheat/forcedCapture.ts` | 事件寫入前後觸發 source-specific forced capture handler。 |
| `screens/paperExam/hooks/anticheat/evidenceRingBuffer.ts` | 本地保留事件前後 frame window。 |
| `screens/paperExam/hooks/anticheat/useEventEvidenceCapture.ts` | `anchor_window`、`pre_loss`、`audit` evidence upload orchestration。 |
| `screens/paperExam/hooks/anticheat/useAnticheatUploader.ts` | evidence upload intent/confirm client。 |
| `screens/paperExam/hooks/useAnticheatScreenCapture.ts` | screen-share capture、forced capture registration、SFU publisher。 |
| `screens/paperExam/hooks/useAnticheatWebcamCapture.ts` | webcam capture、forced capture registration、SFU publisher。 |
| `anticheat/sfuRealtimeClient.ts`、`sfuLiveSubscriber.ts` | browser-side SFU negotiation/subscription。 |

---

## 5. Main Flows

### 5.1 Policy save to runtime

1. Admin settings UI 編輯 device/source/detector policy。
2. Backend persist 到 `Contest.anticheat_device_policy` 與相關 contest 欄位。
3. `ContestViewSet.perform_update` 清掉 `contest_anticheat_config:{contest_id}`。
4. `GET /api/v1/contests/{id}/anticheat-config/` 回傳 `global_defaults`、`contest_settings`、`effective`、`device_policy`。
5. `contest.anticheat.mapper.ts` 驗證 DTO 並轉成 frontend entity。
6. `anticheatModulePolicy.ts` 依裝置能力產生 precheck/runtime plan。

### 5.2 Student entry and precheck

1. 前端偵測 device capability：desktop/tablet、PWA、pointer、screen share、webcam。
2. `anticheatModulePolicy.ts` 決定允許進入的 device kind 與需要啟用的 source/detector。
3. screen-share/webcam handoff store 保存 precheck 階段拿到的 stream。
4. 進入考試時送 `exam_entered`，metadata 會帶 device id、user agent、device kind、supported/active sources。
5. backend 設 active session、heartbeat/JTI pinning，並讓考試進入可監控狀態。

### 5.3 Runtime event and evidence

1. detector 產生 triggered/restored/escalated signal。
2. `useViolationPipeline` 依 `violationRoutes.ts` 管 grace countdown 與 escalation。
3. `orchestrator.ts` 依 phase、priority、incident family 做前端 dedupe/arbitration。
4. `recordExamEventWithForcedCapture` 先協調 forced capture，再送 exam event。
5. `ExamEventsMixin` 做 idempotency、metadata normalization、incident-family backend dedupe。
6. 若事件屬 `PENALIZED_EVENT_TYPES` 且未 dedupe，backend 更新 `violation_count`，必要時把 participant 轉 `paused` 或 `locked`。
7. frontend evidence pipeline 用 upload intents 拿 presigned PUT，傳 frame，再用 upload confirm 驗證 object 並標記 `ExamEvidenceFrame.status=uploaded`。
8. TA dashboard 用 screenshots API 依 incident/time/source 查證據。

### 5.4 Device conflict and takeover

1. 新裝置進入時，backend 透過 active session 判斷是否衝突。
2. 衝突 flow 建立 conflict token，或由 teacher/admin 允許 takeover。
3. `exam_takeover.py` 將 participant 暫停到 recovery 狀態，清 heartbeat，設定新 active session，處理 JTI pin/blacklist。
4. 前端依 active exam context 重新進入 precheck 或 resume flow。

### 5.5 Live proctoring through SFU

1. browser 呼叫 backend SFU broker API，不直接接觸 Cloudflare app secret。
2. backend 用 `realtime_sfu.py` 建立 session/add tracks/renegotiate。
3. publisher registry 記錄 contest/user/source module 的 active publisher。
4. TA subscriber 依 registry 找 publisher，再透過 broker 訂閱。
5. SFU registry 是 live session lookup，不是證據保存。需要回放或稽核時仍看 `ExamEvidenceFrame` 與 object storage。

---

## 6. Event Taxonomy and State Rules

後端 `backend/apps/contests/constants.py` 是事件分類 source of truth。

| Priority | 類型 | 例子 | backend 行為 |
| --- | --- | --- | --- |
| P0 critical | 重大監控失效 | `screen_share_stopped`、`heartbeat_timeout`、`listener_tampered` | 記 penalty，通常進入 environment recheck/pause。 |
| P1 violation | 一般違規 | `exit_fullscreen`、`multiple_displays`、`mouse_leave`、`webcam_stopped`、`viewport_stopped` | 記 penalty，依事件與狀態轉 participant。 |
| P2 info | 資訊事件 | `*_interrupted`、`*_restored`、`capture_upload_degraded`、legacy focus events | 落 event feed，不扣點。 |
| P3 system | 生命週期/管理 | `exam_entered`、`exam_submit_initiated`、`heartbeat`、`manual_proctor_note` | 管理或 session event。`heartbeat` 只更新 Redis，不落 DB。 |

目前 `IMMEDIATE_LOCK_EVENT_TYPES` 是空集合。也就是說，防作弊事件的主要自動處理是 pause/recheck 與 violation count，而不是直接 hard lock。若要新增直接鎖定事件，必須先明確定義 UX、TA 解鎖流程與測試。

`ENVIRONMENT_RECHECK_EVENT_TYPES` 目前包含 capture loss、viewport/display loss、heartbeat timeout、listener tamper。這類事件應導向重新預檢或暫停恢復，而不是只顯示一般警告。

---

## 7. Device Policy Rules

`normalize_anticheat_device_policy()` 是 policy constraint source of truth。

| 裝置 | 預設來源/Detector | 強制規則 |
| --- | --- | --- |
| desktop | screen share、可選 webcam、fullscreen、multi-display、mouse-leave | focus 與 tab-visibility legacy detector 永遠關閉。 |
| tablet | webcam、PWA、mouse-leave、viewport-integrity | screen-share、fullscreen、multi-display 強制關閉；focus/tab-visibility 永遠關閉。 |

Admin UI 可以把政策呈現成「允許桌機/平板」、「是否允許多螢幕」、「是否啟用證據追蹤」等語意，但送回 backend 後仍由 normalization 收斂成 canonical policy。

---

## 8. Extension Rules

### 8.1 新增或修改 policy knob

必做順序：

1. `Contest` model/default 或 settings constant。
2. migration。
3. `services/anticheat_config.py` normalization/build payload。
4. backend serializer/view tests。
5. `frontend/src/core/entities/contest.entity.ts` 型別。
6. `frontend/src/infrastructure/mappers/contest.anticheat.mapper.ts` DTO mapping。
7. `features/contest/domain/anticheatModulePolicy.ts` 或 settings projection。
8. admin UI tests 與 runtime tests。

不要只改前端預設值。前端預設只能是顯示或防爆 fallback，不能成為政策來源。

### 8.2 新增 event type

必做順序：

1. `ExamEvent.EVENT_TYPE_CHOICES`。
2. `constants.py` 的 `EVENT_PRIORITY`、`EVENT_CATEGORY` 相關分類。
3. 若會扣點，加入 `PENALIZED_EVENT_TYPES`。
4. 若會要求重新預檢，加入 `ENVIRONMENT_RECHECK_EVENT_TYPES`。
5. 若會與既有事件互斥或去重，加入 `INCIDENT_FAMILY` 與 restore mapping。
6. `frontend/src/core/entities/contest.entity.ts` 的 `ExamViolationType` 或相關 union。
7. `violationRoutes.ts` 或具體 detector。
8. `orchestrator.ts` priority/family mirror。
9. admin event feed/incident evidence 顯示。
10. backend/frontend tests。

### 8.3 新增 evidence source module

必做順序：

1. `ExamEvidenceFrame.SOURCE_MODULE_CHOICES`。
2. `exam_evidence.py` request validation。
3. `anticheat_storage.py` object key/module allow-list。
4. frontend forced capture handler registration。
5. uploader/evidence ring buffer source metadata。
6. TA screenshot filter 與 incident display。
7. storage permission、content-type、size validation tests。

### 8.4 新增 live source

必做順序：

1. backend SFU source module validation。
2. publisher registry key schema。
3. frontend publisher hook。
4. TA subscriber UI。
5. fallback behavior：source unavailable 時要落 info event 還是 blocking event。

---

## 9. Known Drift and Debt

| 項目 | 現況 | 建議收斂 |
| --- | --- | --- |
| screen-share recovery grace | runtime 已收斂到 backend `constants.py::SCREEN_SHARE_RECOVERY_GRACE_MS = 30_000`。舊 `Contest.screen_share_recovery_grace_ms` 欄位仍保留作為相容欄位，但不再主導 `anticheat-config` runtime。 | 後續若要刪欄位，需先確認 serializers、舊資料與 admin form 不再依賴。 |
| frontend event union | `ExamViolationType` 可能落後 backend `ExamEvent.EVENT_TYPE_CHOICES`，尤其 triggered/restored/display degraded 類事件。 | 加 contract test 或產生式 schema check。 |
| frontend orchestrator mirror | `orchestrator.ts` 鏡像 backend incident family/priority，但 `HARD_SECURITY_EVENTS` 與 `WARNING_EVENTS` 可能與 backend `EVENT_PRIORITY` drift。 | 把事件 taxonomy 下發到 config，或建立 shared generated fixture。 |
| `max_cheat_warnings` enforcement | model/payload 暴露違規門檻，但 `_process_penalized_event` 目前主要遞增 `violation_count`，狀態轉換依 immediate-lock/recheck 集合處理。 | 暫不處理；維持既有 display/config 語意，不在本輪加入自動鎖定規則。 |
| legacy focus/tab events | backend 保留歷史事件顯示，normalization 強制 `focus`、`tab_visibility` 關閉。 | 新功能不要依賴 tab hidden/window blur 當 penalty detector。 |
| `warning_timeout_seconds` | 欄位仍存在並進 payload，但新 violation lifecycle 主要由 `violationRoutes.ts` 的 grace/continued 設定驅動。 | 若無 UI 依賴，規劃 migration 或明確標為 legacy display setting。 |
| SFU registry legacy key | `realtime_sfu_registry.py` 保留 legacy publisher key fallback。 | 等所有 client 都 per-source publisher 後移除 fallback。 |
| 舊背景 capture URL | `views/exam_anticheat.py` 還有 presigned URL API。新證據鏈以 `ExamEvidenceFrame` intent/confirm 為主。 | 收斂 caller 後將舊 API 標註 deprecated 或移除。 |

---

## 10. Verification Map

後端重點測試：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend pytest \
  apps/contests/tests/test_anticheat_config_api.py \
  apps/contests/tests/test_exam_anticheat.py \
  apps/contests/tests/test_evidence_windows.py \
  apps/contests/tests/test_exam_sfu.py \
  apps/contests/tests/services/test_anti_cheat_session.py \
  apps/contests/tests/services/test_participant_state.py \
  -q
```

前端重點測試：

```bash
cd frontend
npm run test -- --run \
  src/core/entities/contest.entity.test.ts \
  src/infrastructure/mappers/contest.mapper.test.ts \
  src/features/contest/domain/anticheatModulePolicy.test.ts \
  src/features/contest/domain/violationRoutes.test.ts \
  src/features/contest/hooks/useViolationPipeline.test.ts \
  src/features/contest/anticheat/orchestrator.test.ts \
  src/features/contest/anticheat/forcedCapture.test.ts \
  src/features/contest/screens/paperExam/hooks/anticheat/evidenceRingBuffer.test.ts \
  src/features/contest/screens/paperExam/hooks/anticheat/useEventEvidenceCapture.test.ts \
  src/features/contest/screens/paperExam/hooks/useAnticheatScreenCapture.test.ts \
  src/features/contest/screens/paperExam/hooks/useAnticheatWebcamCapture.test.ts \
  src/features/contest/components/admin/settings/anticheatPolicyModel.test.ts
```

文件檢查：

```bash
cd frontend
npm run check:docs
```

---

## 11. Maintenance Checklist

改防作弊模組前先確認：

- 這次變更是 policy、event、state、evidence、SFU、admin display，還是多個邊界一起動。
- backend source of truth 是否已更新，frontend 是否只是 consuming。
- event 是否有完整 priority、family、penalty、restore mapping。
- participant status transition 是否只在 backend 發生。
- forced capture 是否會產生 `ExamEvidenceFrame` manifest，失敗時是否有 `unavailable` 或可診斷 event。
- Redis/cache state 是否可以重建或自然過期，不會被當成永久審計資料。
- TA dashboard 是否能看懂新事件與新證據 source。
- 是否補了 backend 與 frontend 的 drift-prevention tests。
