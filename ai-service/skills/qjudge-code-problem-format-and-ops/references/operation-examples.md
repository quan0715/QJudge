# 操作範例（最小可行）

## 欄位命名對照（先看這段）

- CRUD `/api/v1/problems/` 的 `test_cases[]`：`input_data` / `output_data`
- DeepAgent patch（`/sample_test_cases`、`/test_cases`）：`input` / `output`
- 常見錯誤：在 patch 用 `input_data` / `output_data`

## 範例 1：建立新題目（CRUD）

輸出重點：完整 payload，可直接送 `/api/v1/problems/`。

```json
{
  "title": "Grid Path Count",
  "difficulty": "medium",
  "time_limit": 2000,
  "memory_limit": 256,
  "visibility": "private",
  "translations": [
    {
      "language": "zh-TW",
      "title": "網格路徑計數",
      "description": "給定 N x M 網格，請計算路徑數...",
      "input_description": "輸入 N 與 M",
      "output_description": "輸出路徑數"
    }
  ],
  "test_cases": [
    {
      "input_data": "2 2\\n",
      "output_data": "2\\n",
      "is_sample": true,
      "score": 0,
      "order": 0,
      "is_hidden": false
    }
  ]
}
```

## 範例 2：更新翻譯與 sample（DeepAgent patch）

```json
{
  "target_problem_id": 123,
  "json_patch_ops": [
    {
      "op": "replace",
      "path": "/translations/0/description",
      "value": "更新後的繁中描述..."
    },
    {
      "op": "replace",
      "path": "/sample_test_cases",
      "value": [
        {
          "input": "1 2\\n",
          "output": "3\\n",
          "order": 0
        }
      ]
    }
  ]
}
```

## 範例 3：整包更新測資（含 hidden，DeepAgent patch）

```json
{
  "target_problem_id": 123,
  "json_patch_ops": [
    {
      "op": "replace",
      "path": "/test_cases",
      "value": [
        {
          "input": "2 2\\n",
          "output": "4\\n",
          "is_sample": true,
          "is_hidden": false,
          "score": 0,
          "order": 0
        },
        {
          "input": "100000 99999\\n",
          "output": "99999\\n",
          "is_sample": false,
          "is_hidden": true,
          "score": 20,
          "order": 1
        }
      ]
    }
  ]
}
```

## 範例 4：風險提示模板

- `required_keywords` 目前不能用 DeepAgent patch 直接更新。
- `forbidden_keywords` 目前不能用 DeepAgent patch 直接更新。
- `language_configs` 目前不能用 DeepAgent patch 直接更新。
- `/test_cases` 會整包覆蓋（sample + hidden）；若只送部分案例，舊資料會被刪除。
- patch 測資請使用 `input` / `output`，不是 `input_data` / `output_data`。
