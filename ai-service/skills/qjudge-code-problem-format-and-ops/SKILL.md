---
name: qjudge-code-problem-format-and-ops
description: 只在「資料落地」階段使用：把已確認的題目規格轉成 QJudge payload、JSON Patch、prepare/commit 流程。禁止做題意發想與測資策略教學。
---

# QJudge Code Problem 格式與操作（落地階段）

將「已確認」題目規格轉成可執行的資料格式與操作步驟。

## 何時使用

- 使用者要求產生 JSON payload。
- 使用者要求產生 JSON Patch。
- 使用者要求 prepare/commit 或 API 寫入流程建議。

## 何時不要用

- 使用者尚未確認題意、I/O、限制與測資策略。
- 使用者在做需求探索、故事化出題、品質 gate。

上面情境請切換到：
[contest-problem-authoring-guide](../contest-problem-authoring-guide/SKILL.md)

## 前置檢查

若規格未定稿，先要求使用者確認這三項：

- 題目最終敘述與 I/O
- 需要支援的語言與翻譯
- 測資與關鍵字限制是否已定稿

## 標準流程

1. 選操作模式（CRUD / DeepAgent patch / YAML import）。
2. 產生最小可行 payload 或 patch。
3. 檢查欄位支援性與寫入限制。
4. 提示風險與需人工確認點。

## 回覆契約

固定輸出三段：

1. 建議操作模式
2. 可直接用的 payload（JSON 或 JSON Patch）
3. 風險提示（不支援欄位、patch 限制、需人工確認）

## 真相來源（衝突時以程式碼為準）

- `backend/apps/problems/models.py`
- `backend/apps/problems/serializers.py`
- `backend/apps/ai/views.py`
- `ai-service/services/tool_registry.py`

參考資料：
- [references/qjudge-problem-format.md](references/qjudge-problem-format.md)
- [references/operation-examples.md](references/operation-examples.md)
