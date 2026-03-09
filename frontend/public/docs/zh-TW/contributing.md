> 文件狀態：2026-02-24

## 開發原則

- 先在本地 Docker dev 環境重現問題，再提交修正。
- 小步提交，避免一次混入多個不相關議題。
- PR 需清楚標註「已驗證範圍」與「已知未解項目」。

## 建議流程

1. 從最新 `main`（或目前協作主分支）切功能分支
2. 實作 + 最小必要測試
3. 更新相關文件（尤其是操作與限制）
4. 提交 PR 並附測試結果

## 目前分支現況（參考）

- `ta-agent` 為活躍整合分支
- Draft PR：`main <- ta-agent`（PR #51）
- 當前重點在 AI 串流穩定化與 Exam V2 骨架收斂

## 提交前最低檢查

- frontend: `npm run lint`
- frontend: `npm run build`
- frontend: `npm run test:e2e`（改由本地 pre-push 執行，不在 GitHub CI 跑）
- backend: 以 `config.settings.test` 跑至少一條 smoke test
- docker dev 服務可正常啟動

## Commit 訊息建議

- `feat:` 新功能
- `fix:` 修正
- `docs:` 文件
- `refactor:` 重構
- `test:` 測試

## Contest 擴充參考

- Contest 前端擴充（tab/panel/module/route）請先看：
  - [Contest 頁面擴充架構指南](/docs/zh-TW/contest-extension-architecture)
