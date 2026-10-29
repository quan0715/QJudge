# 競賽與申訴 email 通知

通知使用既有 Django email 設定與 Celery `default` queue。只有 `EMAIL_MODE=external` 或 `bundled` 時啟用；`disabled` 不排入新通知，已排入任務也不寄送。部署時須一併更新 backend 與 Celery worker；不需新增 migration。`FRONTEND_URL` 必須指向使用者可登入的前端網址。

| 事件 | 收件人 |
| --- | --- |
| 學生第一次提出申訴或新增說明 | 競賽主辦者、課程擁有者、TA，排除發訊者 |
| 教師回覆或結案 | 該申訴的學生，排除操作者 |
| 競賽從草稿發布 | 全體課程學生（含尚未進入競賽者），以及曾作答的參與者 |
| 成績從未發布改為發布 | 同上 |

同一使用者只會在每次事件中收到一份通知。重複開啟同一題申訴、重複結案、重複儲存已發布狀態不重寄；撤回後重新發布會再次通知。批改分數本身不逐筆寄信，教師在申訴回覆或結案時通知學生。

email 僅包含競賽名稱、事件、申訴編號與系統連結，不附作答、留言、評語或分數。請學生回到申訴系統處理，不要私訊或寄 email；系統紀錄為準。

## 寄送與故障

- 資料交易提交後才排入背景任務，回滾不寄送。
- 每位收件人獨立任務，寄送前檢查帳號仍啟用且有 email；不暴露其他收件人。
- SMTP／網路錯誤採退避重試，最多重試 5 次。SMTP 在接收後斷線仍可能造成重複信件，不能保證 exactly-once。
- broker 無法排入任務時，保留已完成的系統操作並記錄 `contest_email_enqueue_failed user_id=...`。目前沒有持久化 outbox；broker 中斷期間未排入的通知不會自動補寄。不要為重寄信件重複發布成績或新增申訴留言。
- 寄信失敗不改變成績、申訴或發布狀態。系統內的紀錄仍可正常查看。

## 驗證

無資料庫的政策、收件人隔離、公開網址及 SMTP 重試測試：

```sh
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend \
  python -m pytest -q --ds=config.settings.test \
  apps/contests/tests/notifications/test_email_notifications.py
```

CI backend suite 另執行 `test_notification_actions.py`，涵蓋發布的 PATCH／toggle 入口、未進入競賽的學生、申訴對話收件人、重複操作與交易回滾。測試 mock 背景任務或使用 locmem email backend，不寄送真實信件。
