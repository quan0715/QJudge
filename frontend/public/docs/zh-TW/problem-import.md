# 題目匯入（YAML）

> 文件狀態：2026-02-24

本頁說明如何以 YAML 匯入題目，適合教師批次建立題庫。

## 基本欄位

```yaml
---
title: "A + B Problem"
difficulty: easy
time_limit: 1000
memory_limit: 256
is_visible: true
is_practice_visible: true
```

## 內容欄位建議

- `translations`：至少提供一種語言（建議 `zh-TW` + `en`）
- `test_cases`：包含 sample 與 hidden cases
- 語言模板（可選）：提供 C++/Python/Java 起始碼

## 匯入前檢查清單

- 題目敘述、輸入、輸出是否完整
- 邊界測資是否覆蓋（最小值、最大值、特例）
- 範例是否可直接驗證

## 與 AI 工具搭配

在目前分支中，可用 AI 助教流程輔助產生題目草稿，但上線前請由教師人工審核敘述、測資與評分規則。
