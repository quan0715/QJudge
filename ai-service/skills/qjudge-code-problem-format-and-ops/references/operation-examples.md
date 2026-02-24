# 操作範例（最小可行）

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

## 範例 3：風險提示模板

- `required_keywords` 目前不能用 DeepAgent patch 直接更新。
- `language_configs` 目前不能用 DeepAgent patch 直接更新。
- 若要更新完整 hidden `test_cases`，請改走 CRUD 或 YAML import。
