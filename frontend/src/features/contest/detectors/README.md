# Exam Detector Plugin Architecture

考試防作弊的 **瞬時違規攔截器**。每個 detector 封裝一類「發生即結束」的行為（複製、快捷鍵、開新視窗），由 `useExamMonitoring` 統一編排。

> **這裡不放持續狀態型的 sensor。** 全螢幕、螢幕分享、webcam、viewport、滑鼠離開視窗屬於另一類 —— 它們有 `interrupted` / `restored` 兩種狀態、要驅動復原 Modal，`ExamDetector` 介面表達不了。那一類一律寫成 `features/contest/hooks/use*Monitoring.ts`，形狀是 `({ enabled, examSubmitted, emitter }) => { interrupted }`。
>
> `MultiDisplayDetector` 是唯一的例外：偵測邏輯（輪詢、debounce、Screen API 健康度）夠複雜、值得脫離 React 單獨測試，所以保留 class，但恢復與健康度是靠介面外的 `onResolved()` / `onApiHealthChange()` 補的，由 `useMultiDisplayMonitoring` 轉成 `interrupted`。新增 sensor 前先確認自己是哪一類。

## 核心介面

```ts
interface ExamDetector {
  readonly id: ExamDetectorId;          // 唯一識別碼
  readonly severity: ViolationSeverity; // 事件嚴重程度
  start(onViolation: (e: ViolationEvent) => void): void;
  stop(): void;
  runCheck(): Promise<CheckResult>;
}
```

### Severity 路由

`useExamMonitoring` 依 severity 分流：

| Severity | 行為 |
|---|---|
| `"violation"` / `"warning"` | 只送 integrity emitter 記錄 |
| `"info"` | 送 emitter 記錄 + `onBlockedAction()` toast |

## 偵測器一覽

| ID | 類別 | Severity | 說明 |
|---|---|---|---|
| `clipboard` | ClipboardDetector | info | 攔截 copy/paste/cut/contextmenu |
| `keyboard-shortcut` | KeyboardShortcutDetector | info | 攔截危險快捷鍵（Cmd+T/N/W/P、Cmd+Space、F12 等）+ 列印保護 |
| `popup-guard` | PopupGuardDetector | info | 攔截 `window.open`、PiP、Notification |
| `multi-display` | MultiDisplayDetector | violation | 透過 Screen Enumeration API 偵測多螢幕（見上方例外說明） |

前三個由 `useExamMonitoring` 掛載；`multi-display` 由 `useMultiDisplayMonitoring` 單獨掛載。

## 如何新增偵測器

先確認是瞬時違規（往下走）還是持續狀態（改寫 `use*Monitoring.ts`）。

1. **建立檔案** `frontend/src/features/contest/detectors/myDetector.ts`

```ts
import type { ExamDetector, ViolationEvent, CheckResult } from "./types";
import type { TFunction } from "i18next";

export class MyDetector implements ExamDetector {
  readonly id = "my-detector" as const;
  readonly severity = "info" as const;

  private t: TFunction;
  private onViolation: ((e: ViolationEvent) => void) | null = null;

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
    return { passed: true };
  }
}
```

2. **註冊型別** — `types.ts` 的 `ExamDetectorId` 加入新 ID
3. **Barrel export** — `index.ts` 加入 export
4. **掛載到編排器** — `useExamMonitoring.ts` 的 `activeDetectors` 陣列加入實例
5. **i18n** — `zh-TW/contest.json` 和 `en/contest.json` 加入提示訊息
6. **測試** — `useExamMonitoring.test.ts` 加入對應測試案例

## 設計原則

- **獨立性**：偵測器之間無共享狀態，各自管理自己的 listener 生命週期
- **可逆性**：`stop()` 必須完整還原所有副作用（移除 listener、還原 monkey-patch）
- **Severity 決定路由**：偵測器只負責偵測，不決定後續處理
- **constructor 注入 `t`**：所有使用者可見文字透過 i18n

## 已知待清理

`runCheck()` 四個 detector 都實作了，但**沒有任何呼叫端** —— precheck 走的是 `precheckEnvironment.ts` + `DisplayCheckService`，不經過 detector。要嘛讓 precheck 真的改走 `runCheck()`，要嘛把它從介面拿掉；目前是第三種狀態（每個新 detector 都得抄一份空實作）。

## 測試策略

整合測試在 `useExamMonitoring.test.ts`，透過 `renderHook` 掛載完整偵測器堆疊後：
- 模擬瀏覽器事件（keydown、blur、visibilitychange 等）
- 驗證 emitter / `onBlockedAction` 是否被正確呼叫
- 驗證 `event.defaultPrevented` 確認攔截生效
