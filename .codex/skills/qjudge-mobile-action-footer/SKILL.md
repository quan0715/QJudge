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

## Quick start
- 先確認是否是「頁面主要操作」：進入、交卷、儲存、送出、掃描、下載等 CTA 才放進 mobile footer。
- 優先使用 `frontend/src/shared/ui/MobileActionFooter.tsx`；若畫面已有自己的 shell footer，使用 `frontend/src/shared/ui/MobileButtonSet.tsx`。不要在 feature 內重做 ButtonSet layout。
- Mobile breakpoint 對齊既有實作：`useMediaQuery("(max-width: 672px)")`。
- Desktop 保留原本內容區 / header actions；mobile 把主要 action 移到 `<MobileActionFooter>`，避免同一個 action 同時出現兩次。
- 單一 action 時按鈕佔右半邊、左半邊留空；兩個 actions 時左右各半。不要讓單一按鈕填滿整個底部列，除非該 flow 明確要求全寬 CTA。

## Core Pattern

```tsx
const showMobileActionFooter = useMediaQuery("(max-width: 672px)");

const buildActionSetItems = (): Array<{ key: string; node: ReactNode }> => {
  const candidates = [
    { key: "primary", node: renderPrimaryAction() },
    { key: "secondary", node: renderSecondaryAction() },
  ];

  return candidates.filter((item) => item.node !== null).slice(0, 2);
};

{!showMobileActionFooter ? (
  <DashboardBlock>
    <div className={styles.actionStack}>
      {buildActionSetItems().map((item) => (
        <div key={item.key} className={styles.actionStackItem}>
          {item.node}
        </div>
      ))}
    </div>
  </DashboardBlock>
) : null}

<MobileActionFooter>
  {buildActionSetItems().map((item) => (
    <div key={item.key} className={styles.actionStackItem}>
      {item.node}
    </div>
  ))}
</MobileActionFooter>
```

## Rules
- Limit mobile footer to 1-2 actions. If there are more, pick the highest-value actions or move overflow into a menu/sheet.
- Render action nodes from one builder function so desktop and mobile stay behaviorally identical.
- Use stable keys based on action identity, not array index.
- Do not show mobile footer and desktop action block at the same breakpoint.
- Do not put low-frequency links, status-only content, or navigation breadcrumbs in the mobile footer.
- Keep button sizing controlled by shared `MobileButtonSet` + Carbon `ButtonSet`; do not add per-button margins or gaps in feature styles.
- If single-action right-half placement is not supported by the shared component, update `MobileButtonSet` once instead of adding invisible placeholder buttons in each page.
- Bottom button sets must not use Carbon tertiary styles (`tertiary` or `danger--tertiary`). Use `secondary` for low-emphasis actions and `danger` for destructive submit actions.
- Add bottom spacer through `MobileActionFooter`; do not add ad hoc page padding unless a screen has a known fixed overlay.
- Shared footer 必須集中處理 `padding-bottom: env(safe-area-inset-bottom)`；feature 不得各自複製 safe-area padding。
- Prefer Carbon button kinds:
  - Primary progress action: `kind="primary"`
  - Secondary safe action: `kind="secondary"` or `kind="ghost"`
  - Utility / document action: `kind="ghost"`
  - Destructive / irreversible action: `kind="danger"` or project-approved danger style
- Icon-only buttons belong in navbar/toolbars, not the mobile action footer. 若例外保留，必須有 Carbon `label` / `iconDescription` 或等價 **accessible name**，並驗證 hover、focus 與 screen reader 名稱。

## Layout Checklist
- One visible source of truth for each action.
- Footer does not cover the last content row on iOS/Android viewport sizes.
- 至少驗證 `390x844`、`393x852` 與 `412x915`，包含瀏覽器 chrome 收合與螢幕旋轉。
- Long button labels wrap or truncate acceptably; no text overflow inside Carbon buttons.
- 200% zoom 與鍵盤 focus 下仍能看到完整主要動作，不被 safe area 或虛擬鍵盤遮住。
- No nested cards just to host actions.
- No `.cds--*` overrides and no `!important`.
- Run `bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh --staged` after style changes.

## When Not To Use
- Repeated row actions inside tables/lists.
- Passive status summaries.
- Desktop-only admin toolbars.
- Exam runtime controls that must remain visible in a locked navbar unless the user explicitly wants them moved.

## Related Skills
- Use `qjudge-ui-carbon-owner` for broader Carbon/layout/stories decisions.
- Use `qjudge-carbon-overflow-ux-fix` if the footer creates double-scroll or clipped content.
