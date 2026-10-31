# 監考與違規流程：減少過度設計

範圍是 PR #413 與後續本機整理；不是全庫重寫。沿用瀏覽器採集、worker 判斷時序、backend 授權與落庫的分工。

## 已完成

- 判罰函式留在既有 `integrity/registry.py`，由命令寫入與顯示共同使用；刪除新增的 `event_policy.py`。
- 預設 action 留在唯一使用它的 `integrity_commands.py`。省略 action 與顯式 action 驗證共用此函式，刪除例外轉換及單一呼叫點的驗證轉接。
- 移除沒有讀取者的 `command_semantics` 傳遞欄位；產生 fingerprint 的本地 semantics 仍保留。
- 刪除已無呼叫端的 detector `runCheck`（PR #413）。
- 純函式檔 `useIntegrityRuntime.ts` 改名 `integrityRuntimePolicy.ts`；provider 私有配置型別移回 provider。這是修正名稱與歸屬，沒有增加 runtime 層。

## Frozen registry 為何保留

監考 run 建立時，把事件 signal、寬限時間、action、優先級、證據規則存成快照。worker 和 backend 依這份快照處理事件，避免部署新版後，進行中的考試突然換規則，也讓歷史事件可按當時規則解讀。它不是信任瀏覽器的理由，仍需驗證事件來源、run scope 與命令。

快照也不表示錯誤政策永遠不能修正：剪貼簿降級採明確的新處理規則與歷史次數遷移；老師關閉 webcam 則在 backend 命令生效前降為 audit。兩者都保留原始事件及快照。

## 保留的安全機制

- 授權、run／participant／device／attempt 範圍檢查。
- Receipt admission、command fingerprint 與冪等處理，避免偽造及重複計數。
- 原有交易與鎖順序，避免計數與事件寫入不一致。
- 延遲送達、已交卷、平台中斷的 audit 降級，避免誤罰。

## 後續原則

取消上一版「優先拆 bootstrap／archive／evidence」的建議。大型檔案本身不是新增層級的理由；只有確認存在重複、死碼或實際修改成本時才整理。暫不增加通用規則引擎、跨服務共用套件或統一 fallback。命令拒絕、歷史顯示與證據保留的 fallback 語意不同，不硬合併。

## 驗證限制

本機 Docker daemon 尚未啟動，完整 Django／資料庫整合測試仍須在 CI 執行。純政策契約測試使用原始函式的 AST 抽取副本執行，另比對重構前後的 action／判罰結果；這不等同於已完成端到端驗證。本輪不變更 API、資料庫或線上環境。
