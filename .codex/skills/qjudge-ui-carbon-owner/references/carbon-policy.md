# Carbon Policy (QJudge)

## Carbon MCP verification snapshot

- Verified: 2026-08-12 via IBM Carbon MCP `docs_search` and `code_search`.
- React examples: Carbon v11, repository tag `v11.113.0`, MCP index updated 2026-08-07.
- QJudge lockfile at verification time: `@carbon/react` `1.97.0`; `package.json` range `^1.96.0`.
- When MCP returns a newer source tag or changed API, follow the new public API and update this snapshot plus skill metadata in the same change.

## Public API boundary

- Use Carbon components, documented props, theme tokens, layout tokens, and app-owned wrapper classes first.
- Never select, emit, test against, or style `.cds--*` / `.bx--*` internal class names in production code.
- Never use `!important`; repair ownership, composition, or specificity.
- Do not copy Carbon DOM structure into app components. Internal markup can change between releases.
- A compatibility exception needs a named app-owned boundary, a reason, an owner, and a removal condition. It must not become a generic override file.

## Theme and tokens

- Keep app-level `<Theme theme="white|g10|g90|g100">` and `data-carbon-theme` aligned.
- Use Carbon color, spacing, typography, layer, border, and focus tokens. A numeric fallback inside `var(--cds-..., fallback)` is acceptable only when runtime support requires it.
- Hard-coded colors are limited to media overlays, syntax highlighting, editors, charts, and imported brand artwork; document why a semantic Carbon token cannot represent the value.
- Preserve Carbon focus, hover, active, disabled, and high-contrast states. Do not paint over them with custom skins.

## Component decisions

| Need | Carbon-first choice | Required review |
| --- | --- | --- |
| Action | `Button`; `IconButton` or `Button hasIconOnly` for icon-only actions | Icon-only actions need `label`, `iconDescription`, or equivalent accessible name. Button labels use concise sentence case and hierarchy follows primary/secondary/ghost/danger intent. |
| Text/form input | `TextInput`, `TextArea`, `NumberInput`, `Checkbox`, `Toggle`, `RadioButton` | Give controls a stable `id` and programmatic label. Associate helper/error text. Use read-only when users must still perceive the value; disabled controls are not focusable. |
| Single submitted choice | `Select` | Use inside a form when one value is submitted. Provide `id` and `labelText`. |
| Filter, sort, or action choice | `Dropdown`, `ComboBox`, `MultiSelect` | Provide `id` plus `titleText` or an equivalent label. `Dropdown` is not a drop-in replacement for form `Select`. |
| Dialog | `Modal` | Provide concise `modalHeading` or an equivalent accessible label, predictable initial focus, close behavior, and focus return. Avoid stacking dialogs when an in-modal step can work. |
| Status message | `InlineNotification`, `ToastNotification`, or `ActionableNotification` | Inline is contextual task-flow state; toast is transient global feedback; actionable is only for an interactive recovery path. QJudge operation success/failure normally goes through `useToast`. |
| Loading | `Loading`, `InlineLoading`, skeleton variants | Localize `description`/`iconDescription`; use `InlineLoading` next to an in-progress action and a skeleton for initial content loading. Keep `aria-live` proportional to urgency. |
| Tabular data | `DataTable` with Carbon table subcomponents | Preserve `TableContainer`, header/row prop helpers, toolbar semantics, and an `aria-label` or visible title. Do not restyle internal table selectors. |
| Page layout | `Grid` and `Column` | Follow the Carbon 2x Grid, responsive column spans, and token spacing before custom fixed gutters. |
| Clickable surface | `ClickableTile`, `Button`, or semantic link | A custom `div`/`span` click target must supply role, tab stop, keyboard activation, visible focus, and accessible name. Prefer the native/Carbon element. |

## Raw HTML exceptions

- `shared/copilot` cannot import Carbon because of its package boundary. Native controls there are an architectural exception, not a waiver from HTML accessibility.
- Hidden file inputs, Monaco/editor surfaces, canvas/media controls, and third-party widgets may require native elements.
- Each exception still needs a programmatic label, keyboard behavior, visible focus where applicable, and a documented reason during review.

## Nested Modal focus trap

When a portal rendered from an outer `Modal` opens another focusable floating surface, use `selectorsFloatingMenus` with an **app-owned selector** applied to that child surface. Never pass `.cds--modal`.

```tsx
<Modal selectorsFloatingMenus={[".qjudge-child-dialog"]} {...outerProps}>
  {children}
</Modal>

<Modal className="qjudge-child-dialog" {...childProps} />
```

Verify that the selector matches the actual child portal root, that Tab stays in the active dialog, Escape closes only the intended layer, and focus returns to the opener. Prefer one modal with internal steps when practical.

## Fixed shell focus and scroll

Carbon controls may focus themselves after pointer interaction, which can cause browser scrolling. A full-screen fixed shell must lock body scrolling while mounted, and every flex/grid node above the intended scroll owner must be shrinkable.

```scss
.panelRoot {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}
```

Use the overflow playbook for full-height and split-pane layouts; do not patch Carbon internals to hide the symptom.

## Verification

```bash
node .codex/skills/qjudge-quality-gates-owner/scripts/audit-carbon-practices.js --root frontend/src
bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh --staged
```

For changed interactive components, also run focused tests, typecheck/build, Storybook coverage, keyboard checks, and light/dark visual checks.
