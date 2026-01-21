---
name: qjudge-pr-workflow
description: Dev-based PR workflow with lightweight scripts for committing changes and creating PRs to dev or main.
---

# QJudge PR Workflow (dev-based)

## Quick start
- Keep `dev` synced with `main` before starting work:
  `git checkout dev && git fetch origin main && git merge origin/main`
- Create feature branches from `dev`:
  `git checkout -b feature/<name>`
- Commit changes with the helper script:
  `bash .codex/skills/qjudge-pr-workflow/scripts/commit-changes.sh "type: message"`
- Open a PR from the feature branch to `dev`:
  `bash .codex/skills/qjudge-pr-workflow/scripts/create-pr.sh --base dev --title "title"`
- When ready, open a PR from `dev` to `main`:
  `bash .codex/skills/qjudge-pr-workflow/scripts/create-pr.sh --base main --title "title"`

## Scripts
- `commit-changes.sh`: stages tracked files (`git add -u`) and creates a commit.
  - Use `--all` to include untracked files.
  - Refuses to commit on `main`.
- `create-pr.sh`: verifies a clean working tree, pushes the branch if needed, and runs `gh pr create`.
  - Defaults `--base dev`.
  - Use `--draft` for draft PRs.

## Guardrails
- PRs must follow the Gate rules and size limits (see `references/pr-and-registry.md`).
- Do not open PRs from `main`.
- Keep PRs focused and aligned with the active Gate.
