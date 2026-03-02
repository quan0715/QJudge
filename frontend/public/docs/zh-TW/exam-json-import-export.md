# Exam 題目 JSON 匯入/匯出教學

> 文件狀態：2026-03-02

本教學說明如何在競賽 Admin 後台匯入/匯出 Exam 題目 JSON。

## 功能入口

1. 進入 `/contests/:contestId/admin`
2. 切到 `Exam Management` 面板
3. 右上角 Navbar：
   - `匯入 JSON`
   - `匯出檔案`

## 匯出 JSON

1. 點擊 `匯出檔案`
2. 在匯出內容選擇 `Exam JSON`
3. 點擊 `匯出`
4. 下載檔名格式：`{contest_name}_exam_questions.json`

## 匯入 JSON（覆蓋模式）

1. 點擊 `匯入 JSON`
2. 選擇匯入類型（目前為 `Exam 題目 JSON`）
3. 上傳 `.json` 檔
4. 系統會先進行：
   - 嚴格格式檢查
   - 題目預覽（題數、總分、題型分布）
5. 確認無誤後按 `確認覆蓋`

> 匯入是「整份覆蓋」：會以 JSON 內容取代目前題目。

## 匯入失敗與回滾

- 若覆蓋過程中任一步驟失敗，系統會自動回滾到匯入前題目。
- 若回滾也失敗，請立即重新整理頁面並檢查題目資料。

## JSON 格式（QJudge v1）

```json
{
  "version": "qjudge.exam.v1",
  "meta": {
    "exported_at": "2026-03-02T12:34:56.000Z",
    "contest_name": "Operating Systems Exam"
  },
  "questions": [
    {
      "question_type": "single_choice",
      "prompt": "Which statement is correct?",
      "score": 5,
      "options": ["A", "B", "C", "D"],
      "correct_answer": 1,
      "order": 0
    },
    {
      "question_type": "true_false",
      "prompt": "Linux is a kernel.",
      "score": 2,
      "correct_answer": true,
      "order": 1
    },
    {
      "question_type": "multiple_choice",
      "prompt": "Select all valid IPC methods.",
      "score": 6,
      "options": ["Pipe", "Signal", "Socket", "Mutex"],
      "correct_answer": [0, 2],
      "order": 2
    },
    {
      "question_type": "short_answer",
      "prompt": "Define race condition.",
      "score": 4,
      "correct_answer": "A situation where result depends on timing.",
      "order": 3
    },
    {
      "question_type": "essay",
      "prompt": "Explain deadlock prevention strategies.",
      "score": 10,
      "correct_answer": "Break one of Coffman conditions...",
      "order": 4
    }
  ]
}
```

## 嚴格格式檢查規則

- `version` 必須是 `qjudge.exam.v1`
- `questions` 必須為非空陣列
- 不允許未知欄位（root 與 question 層）
- `prompt` 不可空字串
- `score` 必須是數字且大於 0
- `single_choice/multiple_choice` 必須有 `options`
- `single_choice` 的 `correct_answer` 必須是有效索引
- `multiple_choice` 的 `correct_answer` 必須是非空整數陣列且索引有效
- `true_false` 的 `correct_answer` 只接受 `0/1/true/false/"true"/"false"`

## 常見錯誤

- `questions[2].correct_answer`: 索引超出選項範圍
- `root.unknown_field`: 出現未允許欄位
- `version`: 非 `qjudge.exam.v1`

