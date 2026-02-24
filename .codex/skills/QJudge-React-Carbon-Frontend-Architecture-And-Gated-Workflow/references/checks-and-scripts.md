# Repo 檢查（建議腳本）

## 1) Carbon override / !important 檢查（跨平台）
- 目的：阻擋新增 `.cds--` / `.bx--` selector 與 `!important`。
- 建議 pre-commit / CI 片段（使用 `rg`，macOS/Linux 都可）：

```bash
#!/usr/bin/env bash
set -euo pipefail

CHANGED_FILES=$(git diff --cached --name-only --diff-filter=ACMR | rg '\\.(css|scss|sass|less|ts|tsx|js|jsx)$' || true)
if [[ -z "$CHANGED_FILES" ]]; then
  exit 0
fi

if rg -n --no-heading '\\.(cds|bx)--' $CHANGED_FILES; then
  echo "禁止直接覆蓋 Carbon 類名 (.cds-- / .bx--)。" >&2
  exit 1
fi

if rg -n --no-heading '!important' $CHANGED_FILES; then
  echo "禁止使用 !important。" >&2
  exit 1
fi
```

- 允許特例：僅限 `src/styles/carbon-overrides.scss`，且 PR 需附理由與回收計畫。

## 2) 架構邊界檢查
```bash
node .codex/skills/qjudge-clean-arch-workflow/scripts/lint-naming.js --root frontend/src
node .codex/skills/qjudge-clean-arch-workflow/scripts/lint-architecture.js --root frontend/src
```
