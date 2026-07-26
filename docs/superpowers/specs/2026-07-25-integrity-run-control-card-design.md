# Integrity Run 控制卡精簡設計

日期：2026-07-25

狀態：已核准，待實作

## 目標

在競賽設定 Modal 中管理 Integrity Worker 時，不再開啟第二層 Carbon Modal，並讓管理員在任何時間只看到目前 lifecycle 狀態、必要異常，以及唯一可採取的下一步。

## 根因

`SettingsModal` 已是 Carbon Modal；`IntegrityRunControlCard` 內再渲染 Carbon Modal 會產生第二個 backdrop 與 focus scope。外層的 `selectorsFloatingMenus` 可避免 focus trap 搶回焦點，但不會消除巢狀 Modal 的視覺遮罩與操作負擔。

## 呈現模型

`IntegrityRunControlCard` 保持在 `features/contest/components/admin`，不改動 lifecycle API、entity 或 repository。它依 `computeState`、`dataState` 與 `health` 選出一個 state presentation：

| 狀態 | 卡片內容 | 主要操作 |
| --- | --- | --- |
| 無 run | 尚未建立 | 建立 Run |
| stopped / open | 已準備 | 啟動 Integrity Worker |
| running | 執行中；僅在 unhealthy 時顯示錯誤或 warnings | 停止並封存 |
| stopped / archived | 已封存 | 銷毀運算資源 |
| destroyed / archived | 運算資源已銷毀、資料仍保留 | 清除保留資料 |
| destroyed / purged | 已完成清除 | 建立新的 Run |

每張卡只顯示一個狀態 Tag、一段對應說明，以及一個主要按鈕。移除重複 lifecycle Tag、啟動建議、零值 metrics、版本、失效按鈕、固定 lifecycle 說明與 tooltip。

## 確認行為

- 建立、啟動、停止與銷毀直接執行，結果以既有 Toast 顯示。
- Purge 仍須避免誤刪，但改為卡片內的確認區：點擊「清除保留資料」後展開考試名稱輸入框，輸入正確名稱才顯示可用的確認清除按鈕。取消會折疊確認區。
- 不使用巢狀 `Modal`，因此不存在 double-confirm Modal。

## 測試

1. 斷言 running 卡只顯示停止操作，沒有其餘 lifecycle 按鈕與 metrics。
2. 斷言 destroyed / archived 的 purge 確認在卡片內展開，不渲染 `dialog`。
3. 斷言輸入正確競賽名稱後才呼叫 `purgeRun`。
4. 保留既有 destroyed / purged 建立 replacement run 測試。
5. 以既有 `SettingsModal` nesting regression test 確認 child content 不再持有 Carbon Modal。
