---
name: contest-problem-authoring-guide
description: 只在「設計題目內容」階段使用：需求澄清、題意草案、I/O 與限制、測資策略、品質檢核。禁止輸出 QJudge API payload、JSON Patch、prepare/commit 操作。
---

# 程式競賽出題指南（內容設計階段）

把需求轉成可評測、可維護、可翻譯的「題目規格草案」。

## 何時使用

- 使用者在談題目主題、難度、能力目標、故事包裝、測資規劃。
- 使用者要先得到題意草案與品質檢核清單。

## 何時不要用

- 使用者要求可直接提交的 payload / JSON Patch。
- 使用者要執行 prepare/commit 或 API 寫入。

上面情境請切換到：
[qjudge-code-problem-format-and-ops](../qjudge-code-problem-format-and-ops/SKILL.md)

## 輸入不足時的行為

先問最少必要澄清（最多 3 題），只問會影響題目正確性的欄位：

- 難度與目標能力
- I/O 契約是否已固定
- 需不需要英文翻譯與支援語言

## 標準流程（固定順序）

1. 需求整理：主題、難度、目標能力、預期解法複雜度。
2. 題目契約：輸入、輸出、限制、保證條件。
3. 題目草案：可讀敘述 + sample 說明。
4. 測資策略：sample/hidden 覆蓋矩陣與配分邏輯。
5. 品質 Gate：歧義、複雜度一致性、可維護性、翻譯一致性。

## 回覆契約

固定輸出四段，不輸出任何 API 寫入資料：

1. 題目核心目標
2. 題目規格草案（敘述、I/O、限制、保證）
3. 測資設計（sample + hidden 覆蓋目的）
4. 風險與待確認（最多 5 點）

## 完成定義

- 使用者已確認題目草案。
- 可明確轉交格式化技能執行 payload/patch。

參考資料：
- [references/workflow-and-checklist.md](references/workflow-and-checklist.md)
- [references/testcase-matrix-template.md](references/testcase-matrix-template.md)
- [references/problem-constraints.md](references/problem-constraints.md)
- [references/story-writing.md](references/story-writing.md)
- [references/options.md](references/options.md)
