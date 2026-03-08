# Carbon Policy (QJudge)

## Must
- Use Carbon components/tokens first.
- Keep global overrides in a single allowlist file.
- Use token-based spacing/typography/colors.

## Must not
- Override `.cds--*` / `.bx--*` internals directly.
- Use `!important`.
- Hard-code theme colors that fight Carbon tokens.

## Theme baseline
- App-level `<Theme theme="white|g10|g90|g100">`.
- Keep `data-carbon-theme` aligned for CSS token behavior.

## Component style guidance
- Prefer adjusting composition and spacing before custom visual skins.
- Keep focus/hover/active states accessible and token-driven.
