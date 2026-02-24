# E2E 測試指南（前端）

> 文件狀態：2026-02-24

本專案使用 Playwright 做端到端測試，建議搭配 `docker-compose.test.yml`。

## 1. 啟動測試環境

```bash
docker compose -f docker-compose.test.yml up -d --build
docker compose -f docker-compose.test.yml ps
```

## 2. 執行測試

```bash
cd frontend
npm run test:e2e
```

可選：

```bash
npm run test:e2e:ui
npm run test:e2e:debug
```

## 3. 失敗排查

- 確認測試容器都已 `Up`
- 確認測試帳號與種子資料已建立
- 檢查前端是否指向正確 API host
- 查看 Playwright report 與 backend test logs

## 4. 現況說明

- E2E 可作為回歸工具，但仍受測試資料與環境初始化一致性影響。
- 建議將關鍵流程（登入、提交、競賽加入）列為最低必跑案例。
