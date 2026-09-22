# 部署地端 LiveKit 即時監看

QJudge 的即時監看使用自架 LiveKit Server。每個 Exam Integrity Run 對應一個 Room；考生在同一個 session 發布螢幕分享與 Webcam，助教選擇對象後才訂閱最多兩路影像。LiveKit 只拿到 capture stream 的 clone，原始 stream 仍由考生端採證與 MediaRecorder 管理。

這項功能不是 150 格影像牆，也不會取代作答、交卷、Integrity checkpoint 或 S3-compatible evidence storage。SFU 無法使用時，畫面顯示「即時監看暫不可用」，考題、作答、原始採證與待傳資料仍應繼續。

## 啟用前提

正式啟用前請準備：

- 可由 QJudge backend 連到的 LiveKit HTTP API 位址。
- 瀏覽器可連到的 `wss://` LiveKit signaling 位址。
- LiveKit API key／secret、可達的 `LIVEKIT_NODE_IP`，以及地端 STUN／TURN host。
- 獨立於 judge 工作負載的媒體主機資源。單一 Room 上限 160 人是配置值，不是容量驗收結果。
- TLS、ICE UDP、ICE TCP 與必要 TURN/TLS 的實際防火牆規則。不要把未加密的 7880 直接公開給使用者。

LiveKit image 必須使用已查核的 digest；目前 Compose 預設值是 `livekit/livekit-server:v1.13.7@sha256:6fd3b7088874c4d119160dd688798dfec852bc014786d392caad15f6f63912a3`。更新 image 時，先對照該版本的 config schema，再重新執行 smoke 與容量驗收。

## 建立設定

先依一般部署指南準備 `.env` 與 object storage，再設定下列值。credential 只放在 secret manager 或權限為 `0600` 的 `.env`，不要提交、截圖或貼到 logs：

```text
LIVE_MONITORING_ENABLED=true
LIVEKIT_ENVIRONMENT=main
LIVEKIT_PUBLIC_URL=wss://livekit.example.edu
LIVEKIT_INTERNAL_URL=http://livekit:7880
LIVEKIT_API_KEY=<secret-managed-key>
LIVEKIT_API_SECRET=<secret-managed-secret>
LIVEKIT_NODE_IP=<reachable-private-or-public-ip>
LIVEKIT_STUN_HOST=turn.example.edu:3478
LIVEKIT_ADVERTISE_INTERNAL_IP=false
LIVEKIT_IMAGE=livekit/livekit-server:v1.13.7@sha256:6fd3b7088874c4d119160dd688798dfec852bc014786d392caad15f6f63912a3
LIVEKIT_CONFIG_FILE=./.tmp/livekit/main.json
LIVEKIT_TURN_ENABLED=true
LIVEKIT_TURN_HOST=turn.example.edu
LIVEKIT_TURN_PORT=3478
LIVEKIT_TURN_LOCAL_IP=<optional-local-bind-ip>
LIVEKIT_TURN_PROTOCOLS=udp,tcp
LIVEKIT_TURN_SECRET=<secret-managed-turn-secret>
LIVEKIT_TURN_TTL_SECONDS=300
LIVEKIT_TURN_RELAY_PORT_START=50300
LIVEKIT_TURN_RELAY_PORT_END=50399
COTURN_CONFIG_FILE=./.tmp/livekit/coturn.conf
```

由 renderer 產生該環境的 server config：

```bash
python3 scripts/livekit/render-config.py \
  --output ./.tmp/livekit/main.json \
  --coturn-output ./.tmp/livekit/coturn.conf
```

產出會包含 `room.auto_create=false`、`room.max_participants=160`、明確的 RTC port range、`use_external_ip=false`、指定 `node_ip`／STUN host、TURN server 與 API key mapping。`coturn.conf` 使用同一個 TURN shared secret，並以 host network 提供 UDP／TCP 3478 與 relay port range。TURN hostname 必須是 DNS-only A/AAAA 記錄，直接指向 `LIVEKIT_NODE_IP`；不能套 Cloudflare Proxy。若主機在 NAT 後方且 `LIVEKIT_NODE_IP` 是對外公告位址，請額外設定 `LIVEKIT_TURN_LOCAL_IP` 為 coturn 實際綁定的本機介面 IP。若同一服務需要同時服務內網與公網客戶端，將 `LIVEKIT_ADVERTISE_INTERNAL_IP=true`，並把 `LIVEKIT_NODE_IP` 設為外部可達的 IP；這不會取代 NAT／防火牆轉發。停用時 renderer 只產生最小設定，不要求 LiveKit credentials。

## 啟動與檢查

LiveKit 位於 `live-monitoring` profile；停用 flag 不應讓 QJudge backend、作答或 Integrity 依賴 LiveKit health。啟用後：

```bash
docker compose --profile live-monitoring --profile live-turn up -d livekit coturn backend
docker compose --profile live-monitoring --profile live-turn ps livekit coturn backend
docker compose --profile live-monitoring --profile live-turn logs --tail=200 livekit coturn backend
```

Production 必須讓主機／上游防火牆放行 LiveKit 的 TCP `7881`、UDP `50000-50099`，以及 coturn 的 TCP／UDP `3478` 與 UDP relay `50300-50399`。`7880` 只給 backend 與 Cloudflare Tunnel 使用，不直接提供給考生。

先確認 `/api/v1/contests/{contest_id}/exam/live/config/` 回傳 `enabled`、`configured` 與 `provider=livekit`，再用專用考試驗證 publisher／subscriber token、雙來源、切換對象與交卷清理。Browser token 只存在記憶體，API 回應使用 `Cache-Control: no-store`；不能從 localStorage、URL 或一般分析事件恢復 token。

後端以一個共享 Redis presence snapshot 提供 roster 狀態：成功快取 10 秒、抓取鎖 5 秒、LiveKit RoomService request timeout 3 秒。`stale=true` 或 `status=unknown` 不代表已確認 live；助教看到舊畫面時會保留畫面並標示來源狀態暫時無法確認。

## 故障應變

LiveKit 故障不應觸發攝影機關閉、螢幕分享停止、違規或自動交卷。需要整體停用時，在沒有進行中考試的維護窗口執行：

```bash
docker compose --profile live-monitoring stop livekit
```

並在 backend 重新載入 `LIVE_MONITORING_ENABLED=false`。這不是 Cloudflare fallback；本遷移不保留外部 SFU 自動回退。受影響 Run 依 contest／run scope 執行清理命令，無法連線時保留 retry marker：

```bash
python manage.py close_live_monitoring_room \
  --contest-id <contest-id> \
  --run-id <run-id>

python manage.py close_live_monitoring_room \
  --contest-id <contest-id> \
  --run-id <run-id> \
  --confirm
```

沒有 `--confirm` 只會列出 contest、Run 與 room scope，不會呼叫刪除 API。確認後命令只刪除該 Run 的 LiveKit Room，不刪考生資料、事件、物件或 Integrity Run。Run archive／data commit 成功後的自動清理失敗也只會記錄 `live_cleanup_pending`，不回滾已提交資料。

## 放行界線

目前通過的單元／整合測試只能支持 Gate A 的程式契約。沒有實際 host、TLS、TURN、真實瀏覽器媒體與容量報告前，不得描述為地端端到端可用，也不得安排 150 名正式考生。Gate B 必須完成少量真媒體與外連封鎖驗證；Gate C 還要完成 150 名 publisher、5 位助教、300 次切換與最長考試時長 soak。
