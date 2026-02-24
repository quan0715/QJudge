---
name: qjudge-pr-workflow
description: Dev-based PR workflow with lightweight scripts for committing changes and creating PRs to dev or main.
---

# QJudge PR Workflow (dev-based)

## Quick start
- 同步 `dev`：
  `git switch dev && git fetch origin main && git merge --ff-only origin/main`
- 從 `dev` 開工作分支（統一前綴）：
  `git switch -c codex/<name>`
- 提交：
  `bash .codex/skills/qjudge-pr-workflow/scripts/commit-changes.sh "type: message"`
- 開 PR 到 `dev`：
  `bash .codex/skills/qjudge-pr-workflow/scripts/create-pr.sh --base dev --title "title"`
- 發版時，從 `dev` 開 PR 到 `main`：
  `bash .codex/skills/qjudge-pr-workflow/scripts/create-pr.sh --base main --title "title"`

## Scripts
- `commit-changes.sh`
  - 預設只 stage tracked files（`git add -u`）
  - `--all` 會含 untracked
  - 拒絕在 `main` 提交
- `create-pr.sh`
  - 驗證工作樹乾淨
  - 需要時自動 push
  - 透過 `gh pr create` 建 PR
  - 預設 base=`dev`
  - 只允許：`codex/* -> dev` 或 `dev -> main`

## Guardrails
- PR 必須符合 active Gate 與 size limit（參考對應 skill 的 PR policy）。
- 不允許從 `main` 開 PR。
- 提交前建議至少跑：
  - `node .codex/skills/qjudge-clean-arch-workflow/scripts/lint-naming.js --root frontend/src`
  - `node .codex/skills/qjudge-clean-arch-workflow/scripts/lint-architecture.js --root frontend/src`
