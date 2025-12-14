# i18n Translation Usage Analyzer

A Python script to analyze translation key usage across the QJudge codebase.

## Purpose

This script helps maintain a healthy i18n translation system by:

1. **Identifying frequently reused keys** - Keys used in multiple files that should be in `common.json`
2. **Finding unused translations** - Keys that exist but aren't referenced in the code (may be for future features)
3. **Detecting single-use common keys** - Keys in `common.json` that are only used once (might belong in namespace-specific files)
4. **Providing usage statistics** - Per-namespace statistics on translation usage

## Usage

```bash
# From the project root
python3 scripts/analyze-i18n-usage.py
```

## Output

The script generates a comprehensive report including:

- **Summary**: Total keys, used keys, unused keys
- **Multi-file usage**: Keys used across multiple files (candidates for `common.json`)
- **Common.json analysis**: How well `common.json` keys are reused
- **Unused keys**: Translations that exist but aren't used in code
- **Per-namespace statistics**: Usage percentages for each translation namespace
- **Recommendations**: Actionable suggestions for improving translation organization

## Example Output

```
================================================================================
i18n Translation Usage Analysis Report
================================================================================

📊 Summary
  Total translation keys: 872
  Used keys: 130 (14%)
  Unused keys: 742

🔄 Keys Used in Multiple Files
  contest.logs.pagination.backwardText - used in 2 files:
    • domains/contest/pages/settings/ContestLogsPage.tsx
    • domains/contest/pages/settings/ContestParticipantsPage.tsx

💡 Recommendations
  ✅ Move 4 keys to common.json (keys used in multiple files)
  ⚠️  Review 742 unused translation keys (may be for future features)
```

## What the Analysis Means

### High Unused Percentage
If a namespace has many unused keys (e.g., 70-100%), it could mean:
- Translations prepared for features not yet implemented
- Translations from removed features that should be cleaned up
- False negatives (the script may not detect all usage patterns)

### Multi-file Usage
Keys used in multiple files are candidates for `common.json` to avoid duplication.

### Single-use Common Keys
Keys in `common.json` used only once might be better placed in their specific namespace file.

## Limitations

The script uses regex pattern matching to find translation usage. It may not detect:
- Dynamically constructed key names
- Keys used in complex template literals
- Keys passed as variables

This means unused keys might actually be in use, so review carefully before removing.

## Maintenance

Run this script periodically (e.g., before major releases) to:
1. Keep `common.json` well-organized
2. Identify translation debt
3. Ensure consistent translation organization
