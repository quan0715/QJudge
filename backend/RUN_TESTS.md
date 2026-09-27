# Backend 測試執行指南

## 在哪裡跑

| 測試 | 位置 |
|---|---|
| 不需要資料庫的測試（設定、service 單元、序列化） | 本機 dev 容器 |
| 需要資料庫的測試（`django_db`、`APITestCase`、`TestCase`） | CI 的 Backend Unit Tests job |
| 整合測試與 E2E | CI，以 `ci/e2e-stack.sh` 全新安裝後執行 |

dev 的資料庫帳號沒有 `CREATEDB`，無法建立測試資料庫，需要資料庫的測試請推到 CI 執行。

## 本機執行

`pytest.ini` 預設使用 `config.settings.test`，在 dev 的 backend 容器內執行：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend \
  python -m pytest -q -p no:cacheprovider <test-path>
```

例如：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend \
  python -m pytest -q -p no:cacheprovider apps/ai/tests/test_bff_contract.py apps/core/tests/test_deploy_settings.py
```

測試若因無法建立 `test_*` 資料庫而失敗，代表它需要資料庫，交給 CI 驗證即可。

## 其他檢查

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py check
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python -m compileall -q apps config
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py spectacular --file /tmp/schema.yml
```
