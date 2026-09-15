---
name: qjudge-mobile-action-footer
description: Use when implementing or reviewing QJudge mobile sticky action footers, Carbon ButtonSet composition, responsive CTA placement, or desktop/mobile action deduplication.
---

# QJudge Mobile Action Footer

## Current shared contract

- Use `frontend/src/shared/ui/MobileActionFooter.tsx` for a fixed mobile footer and its matching content spacer.
- Use `MobileButtonSet.tsx` when an existing shell already owns footer positioning.
- The breakpoint is `max-width: 672px`.
- `MobileButtonSet` wraps Carbon `ButtonSet`; every child flexes equally across the row. A single action is full width; two actions split the row evenly.
- The current shared footer does not implement `safe-area-inset-bottom`. Do not claim that it does.

If the requested flow needs different placement or safe-area padding, update the shared component within the current task. Avoid invisible placeholder buttons or feature-specific copies.

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
- Check a representative narrow viewport and the affected interaction. Add landscape, zoom, virtual keyboard, or safe-area checks when the change involves those behaviors.
- Explicitly verify safe-area devices because the current shared component has no safe-area padding.
- Do not override `.cds--*` internals or use `!important`.

Use the staged Carbon check during style changes; CI runs the strict gate:

```bash
bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh --staged
bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh --all
```

Use `qjudge-ui-carbon-owner` for broader Carbon decisions and `qjudge-carbon-overflow-ux-fix` for scroll/viewport failures.
