# Exam Detector Plugin Architecture

考試防作弊偵測器的 Plugin 架構文檔。每個偵測器獨立封裝一類作弊行為的偵測與攔截邏輯，由 `useExamMonitoring` hook 統一編排。

## 核心介面

```ts
interface ExamDetector {
  readonly id: ExamDetectorId;       // 唯一識別碼
  readonly severity: ViolationSeverity; // 事件嚴重程度
  start(onViolation: (e: ViolationEvent) => void): void;
  stop(): void;
  runCheck(): Promise<CheckResult>;  // precheck 階段主動檢查
}
```

### Severity 路由

| Severity | 行為 | 說明 |
|---|---|---|
| `"violation"` | `onViolation()` → 送後端記錄 + 警告彈窗 | 真正離開考試環境 |
| `"warning"` | `onViolation()` → 送後端記錄 + 警告彈窗 | 可疑但非確定性行為 |
| `"info"` | `onBlockedAction()` → toast 通知 | 攔截成功、不計罰 |

## 偵測器一覽

| ID | 類別 | Severity | 說明 |
|---|---|---|---|
| `fullscreen` | FullscreenDetector | violation | 偵測退出全螢幕，提供 5 秒回復寬限期 |
| `focus` | FocusDetector | violation | 偵測 `visibilitychange` (tab hidden) 及 `blur` (視窗失焦) |
| `multi-display` | MultiDisplayDetector | violation | 透過 Screen Enumeration API 偵測多螢幕 |
| `mouse-leave` | MouseLeaveDetector | warning | 偵測滑鼠離開視窗邊界，提供 3 秒回復寬限期 |
| `clipboard` | ClipboardDetector | info | 攔截 copy/paste/cut/contextmenu |
| `keyboard-shortcut` | KeyboardShortcutDetector | info | 攔截危險快捷鍵（Cmd+T/N/W/P、Cmd+Space、F12 等）+ 列印保護 |
| `popup-guard` | PopupGuardDetector | info | 攔截 `window.open`、PiP、Notification |

## 編排方式（Orchestrator）

`useExamMonitoring` hook 負責：

1. 建立所有偵測器實例
2. 註冊統一的 `handleViolation` callback，依 severity 分流
3. 連接 FocusDetector 與 MultiDisplayDetector 的互動觸發檢查
4. 管理 FullscreenDetector 的回復倒數 callback
5. `enabled` 為 false 時不掛載任何偵測器

```
useExamMonitoring({ enabled, onViolation, onBlockedAction })
  └─ detectors.forEach(d => d.start(handleViolation))
       ├─ severity === "info"      → onBlockedAction(msg)  // toast only
       ├─ severity === "warning"   → onViolation(type, msg) // 記錄
       └─ severity === "violation" → onViolation(type, msg) // 記錄 + 可能鎖定
```

## 如何新增偵測器

1. **建立偵測器檔案** `frontend/src/features/contest/detectors/myDetector.ts`

```ts
import type { ExamDetector, ViolationEvent, CheckResult } from "./types";
import type { TFunction } from "i18next";

export class MyDetector implements ExamDetector {
  readonly id = "my-detector" as const;
  readonly severity = "info" as const; // 選擇適當的 severity

  private t: TFunction;
  private onViolation: ((e: ViolationEvent) => void) | null = null;
  // ... 需要清理的 listener/patch 引用

  constructor(t: TFunction) {
    this.t = t;
  }

  start(onViolation: (e: ViolationEvent) => void): void {
    this.onViolation = onViolation;
    // 掛載 listener 或 monkey-patch
  }

  stop(): void {
    // 還原所有 listener 和 monkey-patch
    this.onViolation = null;
  }

  async runCheck(): Promise<CheckResult> {
    return { passed: true }; // 若無 precheck 需求
  }
}
```

2. **註冊型別** — `types.ts` 的 `ExamDetectorId` 加入新 ID
3. **Barrel export** — `index.ts` 加入 export
4. **掛載到編排器** — `useExamMonitoring.ts` 的 `detectors` 陣列加入實例
5. **i18n** — `zh-TW/contest.json` 和 `en/contest.json` 加入提示訊息
6. **測試** — `useExamMonitoring.test.ts` 加入對應測試案例

### 擴充成本估算

- 新增一個偵測器：1 新檔 + 4 處 1-line 修改（types、index、orchestrator、i18n×2）
- 擴充既有偵測器：僅修改該偵測器檔案 + 可能的 i18n

## 設計原則

- **獨立性**：偵測器之間無共享狀態，各自管理自己的 listener 生命週期
- **可逆性**：`stop()` 必須完整還原所有副作用（移除 listener、還原 monkey-patch）
- **Severity 決定路由**：偵測器只負責偵測，不決定後續處理（記錄/toast/鎖定由上層根據 severity 決定）
- **constructor 注入 `t`**：所有使用者可見文字透過 i18n，方便多語系

## 測試策略

整合測試在 `useExamMonitoring.test.ts`，透過 `renderHook` 掛載完整偵測器堆疊後：
- 模擬瀏覽器事件（keydown、blur、visibilitychange 等）
- 驗證 `onViolation` / `onBlockedAction` 是否被正確呼叫
- 驗證 `event.defaultPrevented` 確認攔截生效
