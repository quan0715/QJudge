---
name: qjudge-mobile-action-footer
description: Use when implementing or reviewing QJudge mobile sticky action footers, Carbon ButtonSet composition, responsive CTA placement, or desktop/mobile action deduplication.
metadata:
  version: "2026.08.12"
  carbon_mcp_verified: "2026-08-12"
  carbon_framework: "v11"
  carbon_reference_tag: "v11.113.0"
---

# QJudge Mobile Action Footer

## Current shared contract

- Use `frontend/src/shared/ui/MobileActionFooter.tsx` for a fixed mobile footer and its matching content spacer.
- Use `MobileButtonSet.tsx` when an existing shell already owns footer positioning.
- The breakpoint is `max-width: 672px`.
- `MobileButtonSet` wraps Carbon `ButtonSet`; every child flexes equally across the row. A single action is full width; two actions split the row evenly.
- The current shared footer does not implement `safe-area-inset-bottom`. Do not claim that it does.

If a flow requires half-width single-action placement or safe-area padding, change the shared component and its tests in a separately scoped implementation. Do not add invisible placeholder buttons or feature-specific copies.

## Composition rules

- Put only one or two high-value page actions in the footer.
- Build action nodes once and render that same behavior in the desktop and mobile locations.
- Hide the desktop action block when the mobile footer is active.
- Use stable action keys, not array indexes.
- Do not put breadcrumbs, status-only content, or repeated row actions in the footer.
- Keep sizing and flush layout in the shared `MobileButtonSet`; feature styles must not add per-button gaps.
- Use Carbon `primary` for the main action, `secondary` or `ghost` for lower emphasis, and `danger` for destructive submission. Bottom button sets do not use tertiary variants.
- Prefer text labels. An exceptional icon-only action needs a programmatic accessible name and keyboard/focus verification.

## Layout verification

- The footer and spacer appear only at the mobile breakpoint.
- Last-page content remains reachable and is not covered.
- Long localized labels do not overflow.
- Test `390x844`, `393x852`, `412x915`, landscape, 200% zoom, keyboard focus, browser chrome changes, and virtual-keyboard behavior.
- Explicitly verify safe-area devices because the current shared component has no safe-area padding.
- Do not override `.cds--*` internals or use `!important`.

Run the staged Carbon check while iterating and the strict gate before completion:

```bash
bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh --staged
bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh --all
```

Use `qjudge-ui-carbon-owner` for broader Carbon decisions and `qjudge-carbon-overflow-ux-fix` for scroll/viewport failures.
