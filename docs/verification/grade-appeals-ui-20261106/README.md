# 申訴介面驗證

以下截圖取自本次分支的實際 Carbon 元件與申訴資料流程。Playwright 使用合成的 API 資料；姓名、作答與頭像均為測試內容，沒有真實學生資料。

- [桌面：展開對話並回覆後，顯示等待考生回覆](desktop-expanded-replied.png)
- [桌面：結案列表與原有 Reset](desktop-closed-list.png)
- [手機深色：展開題目、原始作答、留言與回覆欄](mobile-dark-expanded.png)

## 驗證結果

- 前端 Vitest：22 tests passed（申訴列表、既有申訴 dialog、Avatar、AdminOverview）。
- 後端不使用資料庫的 pytest：22 passed（summary 與 route）。
- Playwright：8 passed（desktop、tablet，以及 390px 手機深色畫面）。
- Typecheck、ESLint、naming、architecture、repository exports、Carbon strict `--all` 均通過。
- 需資料庫的後端申訴整合測試依專案規範留給 CI，未宣稱已在本機通過。
- 本機全量 Vitest：1987 passed、1 failed；未修改的 `shared/utils/format.test.ts` 午夜日期斷言受本機時區影響，UTC 單檔測試通過。
- 新增延遲讀寫回歸測試：Reset 不會以舊結果覆蓋回覆或結案；儲存期間的詳情刷新會在 POST 結束後執行，列表仍納入其他新增申訴。

瀏覽器重現命令：

```bash
cd frontend
npm run test:workbench-browser -- grade-appeals.spec.ts --reporter=line
```

此測試涵蓋列表展開／收合、鍵盤操作、草稿保留、多筆同時展開、唯一輸入框 ID、頭像與 fallback、重複送出保護、回覆後狀態、結案、Reset，以及手機水平溢位檢查。
