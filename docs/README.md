# QJudge 內部文件

這個目錄只保存維護程式與營運系統需要的技術文件。給部署者、教師、學生與系統管理者閱讀的正式內容位於 `frontend/public/docs`。

## 仍在維護的文件

- [API conventions](api-conventions.md)：前後端共用的 API response 與 query 契約。
- [Exam Integrity 架構](anticheat-architecture.md)：監考模組的責任、資料通道與證據生命週期。
- [語系維護](i18n.md)：前端語系 key 與公開文件翻譯的檢查方式。
- [壓力測試](loadtest.md)：隔離壓測環境的建立、執行與清理。
- [Exam Integrity runbook](operations/exam-integrity-runbook.md)：Integrity Run 的營運檢查與復原。
- `examples/loadtest.env.example`：壓測專用 object storage 設定範本。

## 公開文件

正式部署入口將移至 `frontend/public/docs/zh-TW/deployment.md`。遷移完成前，`docs/deployment.md` 與 `docs/deployment/` 只是本次整理的來源，不再新增內容。

已完成的設計稿與實作計畫不留在這個目錄；需要追溯時請使用 Git history。
