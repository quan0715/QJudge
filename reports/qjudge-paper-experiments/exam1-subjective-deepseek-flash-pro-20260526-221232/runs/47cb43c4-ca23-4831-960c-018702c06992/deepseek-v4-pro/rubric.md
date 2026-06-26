# Rubric: Preemptive vs Non-preemptive Scheduler

**滿分**: 3 分

**評分方向**: 本題含兩個子問題

## 子題一：兩者差異 (2 分)

- **Preemptive scheduler**：可中斷正在執行的 process/thread，強制切換至另一個執行。running → ready 是關鍵特徵。(1 分)
- **Non-preemptive scheduler**：process/thread 一旦開始執行，就持續到完成或因 I/O 等自願讓出 CPU 為止，不可被強制中斷。不會發生 running → ready。(1 分)

*部分給分*：
- 兩者都正確描述 → 2 分
- 只正確描述其中一個，另一個未提或有誤 → 1 分
- 兩者描述皆有重大錯誤或未作答 → 0 分

## 子題二：舉例情境說明 preemptive 的好處 (1 分)

- 須提出一個**具體情境**並說明為何 preemptive 有幫助。可接受的情境例如：
  - 時間分享系統（time-sharing）：公平分配 CPU 給多個互動使用者
  - 防止長時間任務獨佔 CPU（避免 starvation / convoy effect）
  - 即時系統（RTOS）：高優先權任務需立即處理，不能等待
  - 降低平均等待時間（用 SJF vs SRTF 舉例）
  - 互動式體驗：滑鼠/鍵盤回應不因背景程式卡住
  - 避免無窮迴圈或 deadlock 導致系統停擺

- 若僅提及 preemptive 可中斷但無具體情境 → 0.5 分
- 若回答情境與 preemptive 無關或完全錯誤 → 0 分

## 總分計算

| 差異說明 | 舉例 | 總分 |
|---------|------|------|
| 2 | 1 | 3 |
| 2 | 0.5 | 2.5 |
| 2 | 0 | 2 |
| 1 | 1 | 2 |
| 1 | 0.5 | 1.5 |
| 1 | 0 | 1 |
| 0 | 1 | 1 |
| 0 | 0.5 | 0.5 |
| 0 | 0 | 0 |

## 注意事項

- answer_text 為空白或無效 JSON 者 → 0 分
- 若兩者完全搞反（把 preemptive 描述成 non-preemptive）→ 差異部分至多 0.5 分
- reason 以英文簡述扣分/給分依據，滿分者 reason 留空
