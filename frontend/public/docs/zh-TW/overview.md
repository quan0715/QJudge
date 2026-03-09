> 文件狀態：2026-02-24，對齊 `ta-agent` 分支（Draft PR #51）

QJudge 目前是整合「線上評測 + 競賽管理 + AI 助教 + 考試流程（Exam V2 骨架）」的教學平台。

## 目前專案現況

- 主要開發分支：`ta-agent`
- 進行中 PR：[PR #51](https://github.com/quan0715/QJudge/pull/51)
- 核心服務：`frontend`、`backend`、`ai-service`、`postgres`、`redis`、`celery`
- AI 助教：已改為 DeepAgent（LangGraph）流程，前後端以 SSE 串流整合
- Exam V2：已建立註冊/前檢/作答/評分/結果流程骨架

## 角色與功能

| 角色 | 可用功能 |
| --- | --- |
| Student | 練習題目、提交程式、參加競賽、使用 AI 助教 |
| Teacher | 建立與管理競賽、題目管理、成績/提交檢視、考試流程設定 |
| Admin | 使用者與權限管理、公告管理、系統層設定與監控 |

## 文件導覽

- 新手提交：[/docs/quick-start](/docs/quick-start)
- 提交流程：[/docs/submission](/docs/submission)
- 競賽流程：[/docs/contests](/docs/contests)
- 教師操作：[/docs/teacher-overview](/docs/teacher-overview)
- 管理員操作：[/docs/admin-overview](/docs/admin-overview)
- 開發與貢獻：[/docs/dev-setup](/docs/dev-setup)、[/docs/contributing](/docs/contributing)

## 注意事項

- 若文件描述與畫面不一致，請以 `ta-agent` 分支實際 UI 與 API 行為為準。
- 專案仍在重構與整合中，部分頁面屬於「可用骨架 + 持續收斂」。
