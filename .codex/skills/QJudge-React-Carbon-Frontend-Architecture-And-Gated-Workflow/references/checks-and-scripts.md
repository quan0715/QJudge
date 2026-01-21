# Repo 可執行檢查（示例腳本）

- 目的：阻擋新增 `.cds--`/`.bx--` selector 與 `!important`。
- pre-commit 或 CI bash 片段：
```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)

# 阻擋 Carbon class 覆蓋
if git diff --cached --name-only | grep -E "\\.(css|scss|sass|less|ts|tsx|js|jsx)$" | xargs -r grep -nE "\\.(cds|bx)--" ; then
  echo "禁止直接覆蓋 Carbon 類名 (.cds-- / .bx--). 請移除或放入 allowlist 並說明理由。" >&2
  exit 1
fi

# 阻擋 !important
if git diff --cached --name-only | grep -E "\\.(css|scss|sass|less|ts|tsx|js|jsx)$" | xargs -r grep -n "!important" ; then
  echo "禁止使用 !important。" >&2
  exit 1
fi
```
- 如需允許特例，必須限定在 `src/styles/carbon-overrides.scss` 並在 PR 描述附理由。
