# Quality Profiles

## compat (default)
- 目標：不讓新違規進入，容許已知歷史債先存在。
- 適用：正在重構中、需保持交付速度。

## strict
- 目標：完全符合既定邊界與命名策略。
- 適用：模組已完成收斂、準備硬阻擋。

## Recommended rollout
1. PR gate 先強制 `compat`。
2. CI 另外跑 `strict` 並輸出報告（不阻擋）。
3. 連續 N 週 strict 無新增違規後，改為阻擋。
