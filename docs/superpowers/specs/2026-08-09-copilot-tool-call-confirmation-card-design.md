# Copilot Tool Call Confirmation Card Design

## Goal

Make every AI tool-call approval readable and safe to act on without exposing a raw JSON payload as the primary interface.

## Scope

- Update the QJudge `HITLCard` slot used by the reusable Copilot UI.
- Keep the existing approval contract unchanged: tool name, optional action, argument object, allowed decisions, pending state, and submission error.
- Apply the same presentation to every tool. Do not add per-tool renderers or change MCP/tool behaviour.

## User-facing design

The card is a compact decision surface with four layers:

1. **Purpose header** — icon, `需要確認` eyebrow, and a plain-language title: `確認執行工具操作`.
2. **Operation identity** — tool name in code typography and an optional action tag.
3. **Argument summary** — a short, deterministic list of key/value rows. Scalar values display directly; arrays show their item count; nested objects show their field count. Long scalar values are truncated visually but remain available in the technical detail.
4. **Technical detail** — a collapsed Carbon `Accordion` item named `檢視技術明細`, containing the formatted JSON for auditing and debugging.

Multiple actions remain a vertical list inside one card. The header includes the action count.

The footer uses normal Carbon button hierarchy:

- Secondary: `取消`
- Primary: `確認執行`

It is right-aligned, uses standard button sizes, and does not split the card into full-width red/blue halves. Pending state disables both decisions and changes the primary label to `執行中`.

An approval-submission error remains immediately above the footer as a Carbon error notification.

## Accessibility and layout

- Continue using semantic `button` controls and Carbon focus states.
- Preserve `role="alert"` for submission errors.
- Keep a single scroll owner: the card itself never becomes a vertically scrolling panel. Only the expanded JSON detail has a bounded, horizontal-safe code area.
- Use Carbon tokens only; no component-internal selector overrides and no `!important`.

## Implementation shape

- `HITLCard.tsx` owns generic argument summarisation and composition with Carbon `Accordion`, `Button`, `InlineNotification`, `Tag`, and an icon.
- `HITLCard.module.scss` owns token-based spacing, summary rows, and the bounded code detail surface.
- Existing fallback renderer registration remains supported; a registered renderer replaces the generic summary body for that action, while the card header, detail, and footer stay consistent.
- Update the unit test and Storybook story to cover scalar, array, nested-object, collapsed-detail, allowed-decision, and pending cases.

## Out of scope

- Tool-specific human-readable copy or preview components.
- Changes to MCP approval policy, payload schemas, tool execution, or retry behaviour.
- Persisting expanded/collapsed card state.
