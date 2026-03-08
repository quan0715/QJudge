#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: commit-changes.sh \"commit message\" [--all]" >&2
}

message="${1:-}"
include_untracked="${2:-}"

if [[ -z "$message" ]]; then
  usage
  exit 1
fi

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$current_branch" == "main" ]]; then
  echo "Refusing to commit on main. Switch to dev or a feature branch." >&2
  exit 1
fi

if [[ "$include_untracked" == "--all" ]]; then
  git add -A
else
  git add -u
fi

if git diff --cached --quiet; then
  echo "No staged changes to commit." >&2
  exit 1
fi

git commit -m "$message"
