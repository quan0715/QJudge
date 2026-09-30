# 設定即時監看

考試的即時監看使用 LiveKit：考生發布螢幕分享與 Webcam，助教選擇對象後才觀看。這是選用功能；LiveKit 無法使用時，畫面會顯示即時監看暫不可用，作答、交卷與監考採證照常進行。

## 選擇模式

| `MEDIA_MODE` | 說明 |
| --- | --- |
| `disabled` 或留空 | 不使用即時監看 |
| `bundled` | QJudge 以 addon 執行 LiveKit，使用 LiveKit 內建的 TURN |
| `external` | 連接既有的 LiveKit |

啟用時的設定：

| 設定 | 用途 |
| --- | --- |
| `LIVEKIT_PUBLIC_URL` | bundled 可省略，預設 `wss://主站/livekit`（HTTP 主站使用 `ws://`）；external 必填，例如 `wss://live.example.edu` |
| `LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET` | LiveKit API credential |
| `LIVEKIT_NODE_IP` | bundled 限定：LiveKit 對瀏覽器公布的 media IP，通常是主機的公開 IP |
| `LIVEKIT_TURN_HOST` | bundled 限定：TURN 網域，DNS 直接解析到主機，不經過 CDN proxy |

Bundled 模式由 frontend 將 `/livekit` 的 HTTP／WebSocket 請求轉發到 LiveKit，移除這一層路徑前綴。Backend 直接使用內網 `http://livekit:7880` 呼叫 API。External 模式的 API 網址由 `LIVEKIT_PUBLIC_URL` 推導（`wss://` 換成 `https://`），backend container 必須能連到該網址。

## Bundled

在 `deploy/.env` 設定 `MEDIA_MODE=bundled`、`LIVEKIT_NODE_IP` 與 `LIVEKIT_TURN_HOST`（`init` 時選擇 bundled 會逐項詢問）。`LIVEKIT_PUBLIC_URL` 留空即可共用主站網域，接著：

```bash
deploy/qjudge addon media init
deploy/qjudge addon media up
deploy/qjudge ingress
```

- `addon media init` 在 `LIVEKIT_API_KEY`／`LIVEKIT_API_SECRET` 空白時產生並寫入 `.env`；已有值時不變更。`init` 當時就選擇 bundled 的話已經產生過。
- `addon media up` 依 `.env` 產生 `deploy/secrets/livekit.json`，只有內容改變時才重建 LiveKit。LiveKit 在獨立的 Compose project `<project>-media` 中執行，`upgrade` 不會重啟它。
- 最後以目前版本重新執行 `upgrade`，讓 backend 與 frontend 讀到新的 `MEDIA_MODE`（見[部署指南](deployment.md)第 8 節）。

主站代理需轉發 WebSocket `Upgrade`／`Connection` header，關閉 buffering，並允許長連線；`ingress --nginx` 已包含設定。開發環境的 Vite 也會轉發 `/livekit`。

`ingress` 會列出 LiveKit 需要的入口：

| 入口 | 設定方式 |
| --- | --- |
| 主站 `/livekit` | 預設由 frontend 自動轉發，沿用主站的反向代理或 `http://frontend:80` Tunnel route，不需新增 signaling 網域 |
| 明確指定的另一個 LiveKit 網域 | 反向代理到 `FRONTEND_BIND_ADDRESS:7880`，需支援 WebSocket；使用 Tunnel 時 route 到 `http://livekit:7880` |
| Media 與 TURN | 在 `LIVEKIT_NODE_IP` 直接開放 TCP `7881`、UDP `50000-50099`、UDP `3478` 與 UDP `50300-50399`，或由路由器轉發到主機 |
| TURN/TLS | LiveKit 固定公布 `turns:<LIVEKIT_TURN_HOST>:443`。主機的反向代理在 443 以 TURN 網域的憑證終止 TLS，再以純 TCP 轉到 `FRONTEND_BIND_ADDRESS:5349` |

`ingress --nginx` 附有 TURN 的 nginx `stream` 範例。範例假設 TURN 網域解析到一個只給 TURN 使用的位址，網站的 `server` 則綁在主機的另一個位址，兩者才能同時使用 443。TURN 憑證由主機管理，續期後要 reload 反向代理。TURN 帳密由 LiveKit API key 推導，不需要另外設定。

更新 LiveKit 版本時，image 寫在 `deploy/addons/media/compose.yml`；升級 QJudge 後執行 `deploy/qjudge addon media up` 套用。

## External

設定 `MEDIA_MODE=external`、`LIVEKIT_PUBLIC_URL`、`LIVEKIT_API_KEY` 與 `LIVEKIT_API_SECRET` 後以目前版本重新 `upgrade`。不需要 `addon media` 指令；TURN、port 與憑證由既有的 LiveKit 負責。

## 驗收

1. 以考生或考試管理者身分開啟 `/api/v1/contests/<contest_id>/exam/live/config/`，應回傳 `enabled: true`、`configured: true` 與 `provider: "livekit"`。
2. 用一場測試考試與少量裝置確認考生可以發布畫面、助教可以切換觀看對象，交卷後停止發布。
3. 至少用一台位於受限網路（只允許 443）的裝置測試，確認 TURN/TLS 路徑可用。

## 停用與清理

在沒有進行中考試時，把 `MEDIA_MODE` 改為 `disabled` 並以目前版本重新 `upgrade`。需要關閉某場考試殘留的 LiveKit room 時：

```bash
docker compose -p qjudge exec backend python manage.py close_live_monitoring_room \
  --contest-id <contest_id> --run-id <run_id>
```

不加 `--confirm` 只列出會影響的範圍；加上後才刪除該 room，不會刪除考生資料或已上傳的檔案。
