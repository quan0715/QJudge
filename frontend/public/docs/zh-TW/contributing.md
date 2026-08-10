# 參與 QJudge 開發

QJudge 涵蓋課程管理、評測、考試、AI 與身分認證。第一次貢獻時，最有效的做法不是一次理解整個系統，而是選一個範圍清楚、可以驗證的問題，沿著現有結構完成它。

## 開始之前

先完成[本機開發環境](#/docs/dev-setup)，確認 QJudge 能啟動。接著閱讀儲存庫根目錄與目標資料夾附近的維護指示；不同模組可能有自己的架構、測試或 UI 規則。

若你準備修 issue，先確認目前行為、預期行為與重現方式。只有描述「不能用」通常不足以判斷修正是否完成；一個小型重現案例或失敗測試會更有幫助。

## 一次完成一件事

從目前團隊使用的整合分支建立功能分支。專案目前以 `dev` 作為主要協作分支，`main` 用於正式版本；若維護者在 issue 或 PR 中指定其他基底，以該指示為準。

```bash
git switch dev
git pull --ff-only
git switch -c YOUR_FEATURE_BRANCH
```

修改前先找出同類功能放在哪裡，再沿用現有邊界。例如前端功能放在對應 feature，登入 provider 放在 `backend/apps/users/auth/`，不要因為方便就把新邏輯塞進無關的共用檔案。

保持提交小而完整：程式、必要測試與直接相關的文件放在同一個變更中，格式整理或其他問題另開提交。

## 在相同環境驗證

QJudge 的依賴與測試以 Compose 管理。前端測試在 dev frontend container 中執行，後端測試使用 test Compose 的 `backend-test`，詳細指令見[本機開發環境](#/docs/dev-setup)。

至少驗證你改到的範圍；若變更會跨服務傳遞資料，再補上相鄰服務的 contract 或整合測試。不要只因為完整測試耗時，就完全省略可直接證明行為的最小測試。

常見的 commit 前綴如下：

- `feat:` 新功能
- `fix:` 錯誤修正
- `docs:` 文件調整
- `refactor:` 不改變對外行為的重構
- `test:` 測試補強

## 文件也屬於功能的一部分

使用者可閱讀的內容以 `frontend/public/docs` 為正式來源；`docs` 只保存維護與營運所需的內部技術文件。若畫面、操作流程、部署需求或限制改變，請在同一個 PR 更新相對應的公開文件。

新增登入來源前先看[身分登入擴充](#/docs/identity-auth-extension)；調整 Contest 頁面的 tab、panel、module 或 route 時，先看[Contest 頁面擴充架構指南](#/docs/contest-extension-architecture)。

## 提交 Pull Request

PR 說明至少回答四件事：

1. 使用者原本遇到什麼問題？
2. 這個變更做了什麼？
3. 你實際執行了哪些測試或檢查？
4. 有哪些刻意不在這次處理的限制？

附上能幫助審查的畫面、API 範例或失敗／成功測試即可，不需要貼大量無關日誌。收到 review 意見後，先確認問題是否能重現及是否符合現有邊界，再修改並重新執行受影響的檢查。
