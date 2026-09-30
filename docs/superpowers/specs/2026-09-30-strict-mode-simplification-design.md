# 嚴格考試模式簡化設計

日期：2026-09-30
狀態：設計定案，待審閱

## 1. 目標

### 要解決的問題

- 老師想每週上架程式練習題，但建立競賽要走三步，設定視窗的防作弊區塊有 5 個開關（允許桌機、允許平板、允許桌機多螢幕、啟用螢幕分享、啟用 Webcam），背後是依桌機／平板分開設定的 `anticheat_device_policy` JSON。
- 平板無法分享螢幕，監考只能靠 webcam 加上 PWA、Split View（viewport）偵測，前後端為此維護一整條分支，證據力卻最弱。
- `Contest.admins` 與 `add_admin`／`remove_admin` API 沒有任何前端或 MCP 呼叫；contest 只能從 classroom 建立，管理權已由 classroom 角色決定。

### 決定

| 項目 | 決定 |
|---|---|
| 練習 | 不新增模式欄位。嚴格考試模式關閉即為練習或一般競賽；每週練習的做法是關閉嚴格模式、結束時間設到學期末、每週加題 |
| 發布時間 | 維持開始與結束時間必填 |
| 嚴格考試模式 | 必須能分享螢幕。規則固定：螢幕分享（主要來源）＋全螢幕＋多螢幕偵測＋滑鼠離開偵測 |
| 唯一可調的監考設定 | 是否要求 webcam，以新欄位 `webcam_required` 表示；webcam 一律為次要來源 |
| 平板 | 不支援嚴格考試模式。相關邏輯刪除，以 git tag `archive/tablet-anticheat` 保留 |
| 管理權 | 只看 `owner` 與 classroom 角色；刪除 `Contest.admins` |
| 建立視窗 | 「選類型」→「名稱＋嚴格考試模式（預設關閉）」；允許重新加入、QR 簽到只在設定視窗 |
| 凍結的 policy | 維持 `device_policy.desktop` 形狀，只含 `enabled` 與 `sources`；偵測項目固定在前端 |

### 不做

- 未設時間即可發布（無期限練習）：之後再議。
- 題目個別的開放時間或排程上架。
- 刪除 `rules`、`allow_multiple_joins`、`attendance_photo_policy`、`scoreboard_visible_during_contest`。
- 修改 integrity-service：webcam 保留，來源型別不變。
- 修改簽到流程：`attendance.py` 的 `device_kind` 是簽到拍照的裝置紀錄，與監考無關。
- 舊考試紀錄中 `viewport` 事件的專屬顯示；改以一般事件顯示。

## 2. 資料模型

### `Contest` 欄位

| 變更 | 說明 |
|---|---|
| 新增 `webcam_required`（`BooleanField`，預設 `False`） | 嚴格考試模式是否同時要求 webcam |
| 刪除 `anticheat_device_policy` | 改由固定規則加 `webcam_required` 產生 |
| 刪除 `admins` | 管理權只看 `owner` 與 classroom 角色 |

### Migration `contests/0006`

1. `AddField` `webcam_required`。
2. `RunPython`：`webcam_required = anticheat_device_policy["desktop"]["sources"]["webcam"]["enabled"] is True`，其他形狀一律 `False`。反向為 no-op。
3. `RemoveField` `anticheat_device_policy`。
4. `RemoveField` `admins`。

`0001_baseline.py` 以 `apps.contests.models.default_anticheat_device_policy` 當欄位預設值；改成 `default=dict`（只是 Python 端預設值，不影響資料庫），並刪除 `models/policies.py` 與 `models/__init__.py` 的匯出。

## 3. 防作弊設定

### Policy 形狀

`/api/v1/contests/{id}/anticheat-config/` 與 `ExamIntegrityRun.policy_snapshot` 的 `device_policy` 改為：

```json
{
  "desktop": {
    "enabled": true,
    "sources": {
      "screen_share": { "enabled": true },
      "webcam": { "enabled": false }
    }
  }
}
```

`webcam.enabled` 取自 `webcam_required`。`anticheat-config` 的 `version` 由 3 改為 4，policy snapshot 的 `version` 由 1 改為 2；目前沒有程式比對這兩個值，只用來標示形狀變更。

讀 `device_policy` 的程式有三處。其中兩處逐一走訪各裝置的 `sources`，形狀不變所以不用改，舊考試的 snapshot（含 `tablet` 與 `detectors`）也照常能讀：

- `services/integrity_evidence.py` 的 `_enabled_sources`
- 前端 `useIntegrityRuntime.ts`

第三處 `services/livekit_service.py` 的 `_allowed_sources` 原本依 `device_kind` 挑裝置，改為固定讀 `desktop`（見下表）。

### 後端

| 檔案 | 變更 |
|---|---|
| `services/anticheat_config.py` | 刪除 `DEVICE_KINDS`、`DETECTOR_KINDS`、`normalize_anticheat_device_policy`；改由 `webcam_required` 直接產生上面的形狀 |
| `services/livekit_service.py` | `_allowed_sources` 不再看 `device_kind`，讀 snapshot 的 `desktop`；沒有 snapshot 時由 contest 產生 |
| `services/anti_cheat_session.py` | 刪除 `classify_active_session_device_kind`，active session 不再寫 `device_kind` |
| `integrity/registry.py` | 刪除 `viewport` 定義，`REGISTRY_VERSION` 改為 `2026-09-30.1`；舊考試使用各自凍結的 `registry_snapshot`，不受影響 |
| `services/precheck_record.py` | 允許記錄的欄位移除 `device_kind`、`pointer_profile`、`primary_source_module`、`is_tablet`、`is_ipad_like`、`is_pwa_mode`、`supports_fine_pointer`、`pwa_mode` |
| `serializers.py` | `anticheat_device_policy` 換成 `webcam_required` |
| `mcp-server/server.py` | contest manager 工具參數 `anticheat_device_policy` 換成 `webcam_required`，同步更新 `tests/test_server.py` |
| `backend/schema.yml` | 重新產生 |

### 前端

**資料層**

- `core/entities/contest.entity.ts`、`infrastructure/api/dto/contest.dto.ts`、`infrastructure/mappers/contest.mapper.ts`、`core/ports/contest.repository.ts`：`anticheatDevicePolicy` 換成 `webcamRequired`，刪除 `DEFAULT_DEVICE_POLICY`、`AnticheatDeviceKind` 等型別。
- `infrastructure/mappers/contestAnticheat.mapper.ts`：從 `device_policy.desktop.sources.webcam.enabled` 讀出 `webcamRequired`，`anticheat-config` 與 `integrity_run.policy_snapshot` 都用同一個轉換。

**監考規則**（`features/contest/domain/anticheatModulePolicy.ts`）

- capability 只剩 `screenShareSupported`、`webcamSupported`，由 `mediaDevices.getDisplayMedia`／`getUserMedia` 是否存在判斷。
- `resolveDeviceMonitoringPlan(capability, webcamRequired)`：
  - `allowed = screenShareSupported && (!webcamRequired || webcamSupported)`
  - 螢幕分享固定為主要來源；`webcamRequired` 時 webcam 為次要來源
  - 偵測固定為 `fullscreen`、`multiDisplay`、`mouseLeave`
  - 刪除 `deviceKind`、`primarySourceModule`、`pwaMode`、`viewportIntegrity`、`requirePwaMode`、`enableViewportIntegrity`
- `buildExamEntryDeviceMetadata` 只送 `screen_share_supported`、`webcam_supported`、`active_sources`。

**考前檢查**（`ExamPrecheckScreen.tsx`、`precheckEnvironment.ts`）

- 刪除平板、PWA 分支與「作答裝置：平板（iPad）」標示。
- `screenShareSupported` 為 false 時顯示「嚴格考試模式需使用電腦瀏覽器（必須能分享螢幕）」，不能開始作答。

**作答中**

- `ExamModeWrapper.tsx`：刪除 PWA guard 與 viewport 監控。
- `examSensorStatus.ts`、`ExamModals.tsx`：刪除 `pwa_required`、`viewport`、`split_view` 與視窗大小／Split View 恢復視窗。
- `frontendIntegritySignals.ts`：刪除 `viewport_interrupted`、`viewport_restored`；`useIntegrityRuntime.ts` 的來源清單移除 `useViewportMonitoring.ts`。
- `useExamSessionFlow.ts`、`useContestExamActions.ts`、`screens/paperExam/hooks/useAnticheatWebcamCapture.ts`：webcam 固定為次要來源，刪除「webcam 當主要來源」分支。
- `constants/eventTaxonomy.ts`：刪除 `viewport` 分支。

**設定視窗**（`components/admin/settings/CheatDetectionPanel.tsx`）

- 只剩兩個開關：嚴格考試模式、要求 Webcam。嚴格模式關閉時「要求 Webcam」不可切換。
- `AdminContestSettingsScreen.tsx`、`examEditor/hooks/useExamAutoSave.ts`：表單與自動儲存欄位 `anticheatDevicePolicy` 換成 `webcamRequired`。

**建立視窗**（`features/classroom/components/CreateContestModal.tsx`）

- 兩步：「選類型」→「名稱＋嚴格考試模式」。嚴格模式兩種類型都預設關閉。
- 送出 `cheat_detection_enabled` 依開關；`allow_multiple_joins`、`attendance_check_enabled` 用預設值 `False`。

**清理**：刪除不再使用的 i18n 文字、stories（`ContestSettingsModal.stories.tsx`）與 mocks（`shared/mocks/contest.mock.ts`）中的舊欄位。

## 4. 移除 `Contest.admins`

| 檔案 | 變更 |
|---|---|
| `permissions.py` | `_native_contest_scope` 刪除 admins 判斷；`IsContestOwnerOrAdmin` 與 lifecycle 權限類的 `hasattr(obj, 'admins')` 改為 `isinstance(obj, Contest)` |
| `managers.py` | 刪除 3 處 `Q(admins=user)` |
| `views/contest.py` | 刪除 `admins`、`add_admin`、`remove_admin` action 與 `prefetch_related("admins")` |
| `access_policy.py` | 刪除 `'admins'` action 對應 |
| `serializers.py` | 刪除 `admins` 欄位與 `get_admins` |
| `services/export_service.py` | `_get_admin_user_ids` 改為 owner 加上 classroom 教學人員（沿用 `participation._classroom_staff_ids`） |
| 前端 entity／DTO／mapper | 刪除 `admins` |

classroom 的 `admins`（`Classroom.admins`）不受影響。

## 5. 保留平板邏輯

刪除前在當下 commit 打 `archive/tablet-anticheat` tag 並推到 origin。之後要恢復時以 `git show archive/tablet-anticheat:<path>` 取回，依當時架構改寫。

整檔刪除：

- `backend/apps/contests/models/policies.py`
- `frontend/src/features/contest/domain/deviceClassification.ts`
- `frontend/src/features/contest/hooks/useViewportMonitoring.ts`、`useViewportMonitoring.test.ts`
- `frontend/src/features/contest/components/admin/settings/anticheatPolicyModel.ts`、`anticheatPolicyModel.test.ts`、`anticheatPolicyUtils.ts`

部分刪除（平板、PWA、viewport 分支）：

- 後端：`anticheat_config.py`、`livekit_service.py`、`anti_cheat_session.py`、`integrity/registry.py`、`precheck_record.py`
- 前端：`anticheatModulePolicy.ts`、`precheckEnvironment.ts`、`ExamPrecheckScreen.tsx`、`ExamModeWrapper.tsx`、`examSensorStatus.ts`、`ExamModals.tsx`、`frontendIntegritySignals.ts`、`useIntegrityRuntime.ts`、`useExamSessionFlow.ts`、`useContestExamActions.ts`、`useAnticheatWebcamCapture.ts`、`eventTaxonomy.ts`、`CheatDetectionPanel.tsx`

## 6. 部署

部署前在 production backend 容器以 `python manage.py shell` 查出會失去管理權的 contest 共同管理者：

```python
from apps.classrooms.permissions import get_user_role_in_classroom
from apps.contests.models import Contest

at_risk = []
for contest in Contest.objects.prefetch_related("admins"):
    binding = contest.classroom_bindings.order_by("bound_at").first()
    for user in contest.admins.all():
        role = get_user_role_in_classroom(user, binding.classroom) if binding else None
        if user.id != contest.owner_id and role not in {"platform_admin", "owner", "manager"}:
            at_risk.append((str(contest.id), contest.name, user.username))
print(at_risk)
```

- 結果為空：直接部署。
- 有結果：先把這些人加為對應 classroom 的 manager，再部署。

其他：

- 避開正在進行的嚴格考試；部署會讓作答中的學生重新載入前端。
- 依 `deploy/qjudge` 一般流程執行 migrate。`0006` 只有加欄位、搬 webcam 設定、刪欄位。
- MCP server 與 backend 同時部署。
- `anticheat-config` 快取在 TTL 內仍可能回傳舊形狀，前端 mapper 讀 `desktop` 即可相容。

## 7. 測試

**後端**（需資料庫，於 CI 執行）

- migration：`desktop.sources.webcam.enabled` 為 true／false／缺值時的 `webcam_required`。
- `anticheat_config`：`webcam_required` 開關下 config 與 snapshot 的形狀。
- `_allowed_sources`：只有螢幕分享；螢幕分享加 webcam；舊 snapshot（含 `tablet`）。
- 權限：classroom manager 為 co_owner；原本只在 `admins` 的使用者變成 outsider；傳入 Contest 物件的權限類判斷正確。
- `managers.py` 的可見範圍、`export_service` 排除的教學人員。
- `precheck_record` 白名單；新的 registry snapshot 不含 `viewport`。
- MCP server 測試。

**前端**（host 可執行）

- `resolveDeviceMonitoringPlan`：螢幕分享支援／不支援 × 要求／不要求 webcam。
- 考前檢查：不支援螢幕分享時擋下並顯示說明。
- `CheatDetectionPanel`：兩個開關；嚴格模式關閉時「要求 Webcam」不可切換。
- `CreateContestModal`：兩步流程、嚴格模式預設關閉、送出內容。
- `contestAnticheat.mapper`：新形狀與含 `tablet` 的舊 snapshot 都得到正確的 `webcamRequired`。

**E2E**：`frontend/tests/e2e/resident-integrity.e2e.spec.ts` 建立 contest 時改送 `webcam_required: false`，於 CI 以 `ci/e2e-stack.sh` 執行。

**Quality gates**：naming、architecture、repository exports lint 與 `check-carbon-style.sh --all`。

**dev 實際操作**

1. 老師建立練習 contest（嚴格模式關閉、結束時間設到學期末），學生進入寫題並提交。
2. 桌機 Chrome 走嚴格考試：不要求 webcam、要求 webcam 各一次，完成考前檢查、作答，並在監考面板確認串流。
3. 模擬不支援 `getDisplayMedia` 的瀏覽器，確認考前檢查擋下並顯示說明。
