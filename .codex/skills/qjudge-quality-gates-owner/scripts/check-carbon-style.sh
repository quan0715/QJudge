#!/usr/bin/env bash
set -euo pipefail

ALLOWLIST="frontend/src/styles/carbon-overrides.scss"

CHANGED_FILES=$(git diff --cached --name-only --diff-filter=ACMR | rg '\.(css|scss|sass|less|ts|tsx|js|jsx)$' || true)
if [[ -z "$CHANGED_FILES" ]]; then
  exit 0
fi

# Exclude allowlist from hard fail checks.
TARGET_FILES=$(echo "$CHANGED_FILES" | rg -v "^${ALLOWLIST}$" || true)
if [[ -z "$TARGET_FILES" ]]; then
  exit 0
fi

if rg -n --no-heading '\.(cds|bx)--' $TARGET_FILES; then
  echo "Blocked: direct Carbon class override (.cds-- / .bx--) is not allowed outside ${ALLOWLIST}." >&2
  exit 1
fi

if rg -n --no-heading '!important' $TARGET_FILES; then
  echo "Blocked: !important is not allowed outside ${ALLOWLIST}." >&2
  exit 1
fi
