# Contest Exam-Only Model Cleanup Design

**Status:** approved scope
**Date:** 2026-07-11

## Goal

將 `Contest` 收斂為 exam-only 聚合，移除沒有實際行為或只服務已下架 classroom lab workflow 的欄位與分支，同時補齊防作弊事件在 frontend、Django、Redis、PostgreSQL 與 object storage 之間的時序文件。

## Scope

本次移除：

- `Contest.max_cheat_warnings`，以及 backend response、anti-cheat config、frontend DTO/entity/mapper/state 與錯誤文案中的對應欄位。
- `Contest.delivery_mode`。所有 Contest 一律走 exam workflow，不再以欄位保存固定值 `exam`。
- `Contest.counts_toward_grade`。這個名稱沒有對應成績簿行為；唯一作用是讓 contest practice submission 只保留最新一筆。
- `ContestParticipant.assignment_state`、`accepted_at`、`submitted_at`。這三欄只服務已移除的 classroom lab accept/submit workflow。
- classroom lab/practice route、projection、filter 與 contest practice cleanup 的剩餘死邏輯。

本次保留：

- `Submission.source_type="practice"`：未綁 Contest 的獨立題目練習提交。
- 封存 Contest 後把題目複製到 public practice library 的功能。
- `ContestParticipant.exam_status`、`started_at`、`left_at`、`submit_reason`：正式考試生命週期。
- `violation_count`：事件統計仍由 backend 維護，但不再搭配不存在的自動鎖定門檻。

## Data Migration

新增一個 Django schema migration，移除：

- `Contest.max_cheat_warnings`
- `Contest.delivery_mode`
- `Contest.counts_toward_grade`
- `ContestParticipant.assignment_state`
- `ContestParticipant.accepted_at`
- `ContestParticipant.submitted_at`

不需要 data migration。這些欄位不是新 exam-only workflow 的資料來源；既有正式考試狀態保存在 `exam_status`、`started_at` 與 `left_at`。

## Runtime Changes

Contest 建立與 classroom participant sync 不再傳遞 delivery mode 或 assignment state。提交流程保留一般 contest submission 的 judge、activity log 與題目鎖定，但移除：

- `_mark_practice_assignment_submitted()`
- `cleanup_practice_submissions()` 對 Contest policy 的依賴
- exam finalization 中的 practice assignment branch
- submission access policy 中的 contest practice acceptance gate

學生考試頁一律要求既有 precheck 規則，不再以 `deliveryMode !== "practice"` 判斷。

## API And Frontend Contract

Contest list/detail/create-update payload 不再輸出或接受：

- `delivery_mode`
- `counts_toward_grade`
- `max_cheat_warnings`
- `assignment_state`
- `accepted_at`
- `submitted_at`

Frontend 同步移除 `ContestDeliveryMode`、`AssignmentState` 與相關欄位。`ExamModeState.maxWarnings` 及 event response 的 `max_cheat_warnings` 一併移除。

## Event Documentation

在 `docs/anticheat-event-recording-handover.md` 新增三張 Mermaid sequence diagram：

1. 一般事件：detector、frontend arbitration、event API、Redis idempotency/incident family、PostgreSQL event/participant transaction、response。
2. 心跳逾時：frontend heartbeat、Redis liveness、Celery Beat timeout、event persistence、participant pause。
3. Evidence：event response、local ring buffer、upload intent、manifest、presigned object upload、HEAD confirm、TA screenshot query。

同步修正 `docs/anticheat-architecture.md` 中已移除 legacy endpoint、固定欄位與舊 forced-capture 順序的描述。

## Testing

Backend contract tests 必須先證明舊欄位仍存在或舊 branch 仍可達，再於實作後轉綠。至少涵蓋：

- Django model 不再包含六個移除欄位。
- Contest serializers 不再輸出或接受三個 Contest 欄位及三個 participant assignment 欄位。
- classroom contest 建立與 participant sync 不依賴 delivery mode。
- contest submission 不再執行 keep-latest cleanup；standalone practice submission 行為維持。
- exam event 與 lifecycle response 不再回傳 `max_cheat_warnings`。

Frontend tests 涵蓋 mapper/entity contract、exam precheck，以及 classroom/contest route 不再依賴 delivery mode。

最後執行 migration check、後端 focused tests、前端 focused tests、frontend build、architecture lint 與 schema generation。

## Non-Goals

- 不重構整個 `ContestDetailSerializer` response shape。
- 不移除一般題目練習模式。
- 不新增自動鎖定門檻或替代 `max_cheat_warnings` 的新設定。
- 不引入 OneToOne policy tables 或 plugin framework。
