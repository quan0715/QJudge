#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF' >&2
Usage: create-pr.sh --title "PR title" [--base dev|main] [--body "PR body"] [--draft] [--no-push]

Examples:
  create-pr.sh --base dev --title "feat: add contest export"   # from codex/<name>
  create-pr.sh --base main --title "release: dev to main"
EOF
}

base="dev"
title=""
body=""
is_draft="false"
push="true"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)
      base="${2:-}"
      shift 2
      ;;
    --title)
      title="${2:-}"
      shift 2
      ;;
    --body)
      body="${2:-}"
      shift 2
      ;;
    --draft)
      is_draft="true"
      shift
      ;;
    --no-push)
      push="false"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$title" ]]; then
  echo "Missing --title" >&2
  usage
  exit 1
fi

if [[ "$base" != "dev" && "$base" != "main" ]]; then
  echo "Invalid --base: $base (allowed: dev|main)" >&2
  exit 1
fi

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$current_branch" == "main" ]]; then
  echo "Refusing to create a PR from main." >&2
  exit 1
fi

if [[ "$base" == "dev" ]]; then
  if [[ "$current_branch" != codex/* ]]; then
    echo "For --base dev, current branch must start with codex/ (got: $current_branch)." >&2
    exit 1
  fi
fi

if [[ "$base" == "main" && "$current_branch" != "dev" ]]; then
  echo "For --base main, current branch must be dev (got: $current_branch)." >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree is not clean. Commit or stash changes before creating a PR." >&2
  exit 1
fi

if [[ "$push" == "true" ]]; then
  if ! git rev-parse --abbrev-ref --symbolic-full-name @{u} >/dev/null 2>&1; then
    git push -u origin HEAD
  else
    git push
  fi
fi

if [[ -z "$body" ]]; then
  body=$(cat <<'EOF'
## Summary
- 

## Testing
- Not run (not requested)
EOF
)
fi

args=(--base "$base" --title "$title" --body "$body")
if [[ "$is_draft" == "true" ]]; then
  args+=(--draft)
fi

gh pr create "${args[@]}"
