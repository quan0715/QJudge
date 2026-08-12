#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
AUDIT_SCRIPT="${SCRIPT_DIR}/audit-carbon-practices.js"
SCOPE="staged"
ROOT="frontend/src"
FORMAT="text"

usage() {
  printf '%s\n' \
    'Usage: check-carbon-style.sh [--staged | --all] [--root <path>] [--format text|json|markdown]' \
    '' \
    '  --staged         Block new .cds/.bx selectors and !important in staged files (default).' \
    '  --all            Audit the complete root and fail on blocking findings.' \
    '  --root <path>    Source root for --all (default: frontend/src).' \
    '  --format <type>  Output format for --all (default: text).' \
    '  --help           Show this help.'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --staged)
      SCOPE="staged"
      shift
      ;;
    --all)
      SCOPE="all"
      shift
      ;;
    --root)
      ROOT="${2:?--root requires a path}"
      shift 2
      ;;
    --format)
      FORMAT="${2:?--format requires text, json, or markdown}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$SCOPE" == "all" ]]; then
  exec node "$AUDIT_SCRIPT" --root "$ROOT" --format "$FORMAT" --profile strict
fi

TARGET_FILES=()
while IFS= read -r -d '' file; do
  [[ "$file" =~ \.(css|scss|sass|less|ts|tsx|js|jsx)$ ]] && TARGET_FILES+=("$file")
done < <(git diff --cached --name-only --diff-filter=ACMR -z)

if [[ ${#TARGET_FILES[@]} -eq 0 ]]; then
  exit 0
fi

FAILED=0
for file in "${TARGET_FILES[@]}"; do
  if MATCHES=$(git show ":${file}" | rg -n --no-heading '\b(cds|bx)--'); then
    printf '%s\n' "$MATCHES" | sed "s#^#${file}:#"
    printf '%s\n' 'Blocked: direct Carbon internal selectors (.cds-- / .bx--) are not allowed.' >&2
    FAILED=1
  fi

  if MATCHES=$(git show ":${file}" | rg -n --no-heading '!important'); then
    printf '%s\n' "$MATCHES" | sed "s#^#${file}:#"
    printf '%s\n' 'Blocked: !important is not allowed; fix specificity or component composition.' >&2
    FAILED=1
  fi
done

exit "$FAILED"
