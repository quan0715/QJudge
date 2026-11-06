# 申訴介面驗證

以下截圖取自本次分支的實際 Carbon 元件與申訴資料流程。Playwright 使用合成的 API 資料；姓名、作答與頭像均為測試內容，沒有真實學生資料。

- [桌面：展開對話並回覆後，顯示等待考生回覆](desktop-expanded-replied.png)
- [桌面：結案列表與原有 Reset](desktop-closed-list.png)
- [手機深色：展開題目、原始作答、留言與回覆欄](mobile-dark-expanded.png)

## 驗證結果

- 前端 Vitest：27 tests passed（申訴列表、既有申訴 dialog、Avatar、UserMenu、AdminOverview）。
- 後端不使用資料庫的 pytest：22 passed（summary 與 route）。
- Playwright：8 passed（desktop、tablet，以及 390px 手機深色畫面）。
- Typecheck、ESLint、naming、architecture、repository exports、Carbon strict `--all` 均通過。
- 需資料庫的後端申訴整合測試依專案規範留給 CI，未宣稱已在本機通過。
- 前端全量 Vitest：`TZ=UTC npm run test`，303 files／1990 tests passed。使用與 CI 一致的 UTC；未修改既有日期格式化測試。
- 新增延遲讀寫回歸測試：Reset 不會以舊結果覆蓋回覆或結案；儲存期間的詳情刷新會在 POST 結束後執行，列表仍納入其他新增申訴。

瀏覽器重現命令：

```bash
cd frontend
npm run test:workbench-browser -- grade-appeals.spec.ts --reporter=line
```

此測試涵蓋列表展開／收合、鍵盤操作、草稿保留、多筆同時展開、唯一輸入框 ID、頭像與 fallback、重複送出保護、回覆後狀態、結案、Reset，以及手機水平溢位檢查。

## 介面調整

已移除「重新整理留言」與列表申訴流水號（#1／#2／#3），保留題號與頁面 Reset。無自訂圖片或圖片載入失敗時，以使用者 ID 產生本機 SVG 對稱圖樣與穩定配色；改名不會改變圖樣，實際頭像仍優先。截圖已依此版本重新擷取。
