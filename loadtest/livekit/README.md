# LiveKit 150＋5 媒體容量驗收

這份 runbook 是瀏覽器 WebRTC 驗收的入口，不是 Locust HTTP 壓測。每位考生必須在同一個 Run 以真實或持續變化的 synthetic video 發布 `screen_share` 與 `webcam`；五位助教各自使用一個 subscriber transport，按需選擇對象，每次最多訂閱兩路。

目前沒有可用的地端 host、TLS／TURN 路徑或專用 browser runner，因此本工作區只提交 guarded Playwright spec，容量測試狀態為 `NOT_RUN`。沒有報告前，不得把 HTTP 200、container healthy 或 mock Room 當成媒體容量證據。

## 執行前提

使用專用 LOADTEST contest／帳號／Run，不得借用進行中的正式考試。先完成 2 位考生、2 位助教 smoke，再依序執行 10＋1、50＋2、150＋5。部署資料需包含：LiveKit image digest、codec、解析度、fps、bitrate、simulcast／Dynacast、host CPU／RSS／網卡、QJudge API p95、selected candidate pair 與 storage evidence 結果。

```bash
QJUDGE_LIVEKIT_CAPACITY_ENABLED=1 \
QJUDGE_LIVEKIT_STUDENTS=150 \
QJUDGE_LIVEKIT_PROCTORS=5 \
QJUDGE_LIVEKIT_DURATION_SECONDS=1800 \
QJUDGE_LIVEKIT_RUN_ID=LOADTEST_LIVEKIT_20260916 \
QJUDGE_LIVEKIT_SHARD_INDEX=0 \
QJUDGE_LIVEKIT_SHARD_COUNT=1 \
npm run test:e2e -- tests/e2e/livekit-capacity.e2e.spec.ts
```

Capacity runner 必須真正記錄 publish／subscribe 成功率、首幀 p50／p95、reconnect、bytes sent／received、SFU CPU／RSS／網卡、QJudge API p95、checkpoint／evidence 成功率，以及 300 次切換是否串錯身份、殘留舊畫面或永久黑屏。分片時使用同一 Run ID；只有所有 runner 都 ready 且報告完整，才能判定該階段結果。

任何 Gate B／C 缺少真實 host、外連封鎖、TLS／TURN、動態媒體、最長考試時長 soak 或實際採證上傳，都應維持 `NOT_RUN`，不降低門檻代替驗收。
