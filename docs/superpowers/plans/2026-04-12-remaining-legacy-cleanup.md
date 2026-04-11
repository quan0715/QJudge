# Remaining Legacy Cleanup Plan

> 本文件記錄 ContestProblem 清理完成後，剩餘的 legacy 架構和建議清理順序。

---

## 已完成 ✅

- [x] ContestProblem model 移除（雙寫、reader 遷移、model 刪除）
- [x] add_problem / reorder_problems 從 ContestViewSet 移除
- [x] orphan-queue / resolve-orphan 端點移除
- [x] Problem discussion endpoints + models 移除
- [x] OpenAPI schema 重新生成

---

## 剩餘 Legacy 架構

### Phase A: ExamQuestion 雙寫清理（中等）

**現況：** ExamQuestion + ContestQuestionBinding 同時寫，跟我們剛清完的 ContestProblem 是同一套模式。

**涉及：**
- `ContestQuestionBinding.legacy_exam_question` OneToOneField
- `ensure_contest_binding_for_exam_question()` 同步函數
- `ContestExamQuestionViewSet` 每次 create/update/delete 都同時操作兩邊
- `sync_exam_question_question_asset()` 同步到 QuestionAsset

**步驟（對照 coding 清理的做法）：**
1. 確認所有 reader 已走 ContestQuestionBinding（大部分已是）
2. 移除 ExamQuestion → ContestQuestionBinding 的雙寫
3. 移除 `legacy_exam_question` FK
4. 評估 ExamQuestion model 本身是否可退役（它可能還有 Contest 內部直接讀取）

**大小估計：** 跟 ContestProblem 清理類似，但 ExamQuestion 比 CodingProblem 更複雜（有 question_type、options、correct_answer 等結構化資料）

**風險：** 中等 — exam 功能較多互動（批改、匯出、統計），需要更完整的測試覆蓋

---

### Phase B: Question model 退役（大）

**現況：** `Question` model 是舊的題庫 adapter，已標記 DEPRECATED 但有 170+ 引用。每次建題庫題目時建 `Question` + `QuestionAsset` 兩個。

**涉及：**
- `Question` model（apps/question_bank/models.py）
- `QuestionCodingExt` model（coding 題目的測資/語言配置快取）
- `QuestionBankMembership.legacy_question` FK
- `write_workflows.py` — 建立/更新 Question + QuestionAsset
- `read_models.py` — 讀取時走 legacy_question
- `bank_workflows.py` — upsert 邏輯
- 所有 bank import 流程（exam 和 coding 都有）

**步驟：**
1. 將 `read_models.py` 的讀取從 `legacy_question` 遷移到 QuestionAsset projection
2. 將 `write_workflows.py` 停止建立 Question records
3. 移除 `QuestionCodingExt`（資料改存在 QuestionAsset.payload）
4. 移除 `legacy_question` FK
5. 移除 Question model

**大小估計：** 大 — 170+ 引用，涉及整個題庫讀寫層

**風險：** 高 — 題庫是核心功能，前端 API response shape 可能會變

---

## 建議順序

```
Phase A（ExamQuestion 雙寫）→ Phase B（Question model）
```

Phase A 跟我們剛做的 ContestProblem 清理模式完全相同，可以直接複製流程。
Phase B 是更大的重構，建議在 Phase A 完成後單獨規劃。

---

## 非 legacy 但可改善的項目

| 項目 | 位置 | 說明 |
|------|------|------|
| `sync_problem_question_asset` 標記 DEPRECATED | question_assets.py:515 | 仍有 15+ caller，不能刪，但 DEPRECATED 標記誤導 — 應改為正常函數 |
| Schema warnings (271) | `manage.py spectacular` | 大量 `unable to resolve type hint` 警告，可加 `@extend_schema_field` |
| `_skip_binding_sync` flag | ContestProblem 已刪，但 ExamQuestion model 可能還有 | Phase A 時一起清 |
