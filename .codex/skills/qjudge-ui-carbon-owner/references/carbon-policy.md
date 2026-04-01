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

---

## ⚠️ 已知陷阱 & 修復模式

### 1. 巢狀 Carbon Modal — focus trap 互搶輸入

**現象**：外層 `Modal`（如 `SettingsModal`）開著時，從其子元件再開一個內層 `Modal`（如 `AddMembersModal`），內層的 `<input>` / `<textarea>` 無法獲得焦點、無法輸入。

**根本原因**：Carbon Modal 使用 sentinel + `onBlur` 的 `wrapFocus()` 機制。每次焦點離開外層 modal 的 `bodyNode`，`wrapFocus()` 就把焦點強制拉回。內層 modal 的 DOM 是透過 `createPortal` 放在 `modal-portal-root`，不在 `bodyNode` 裡，因此焦點一進入內層就被劫持。

```js
// wrapFocus 內部邏輯（@carbon/react/es/internal/wrapFocus.js）
if (!bodyNode.contains(currentActiveNode) &&
    !elementOrParentIsFloatingMenu(currentActiveNode, selectorsFloatingMenus)) {
  // 強制 focus 回 outer modal ← 這行殺死 inner modal 的輸入
}
```

**修復方式**：在 **外層** `SettingsModal` 的 Carbon `<Modal>` 加上：

```tsx
<Modal
  selectorsFloatingMenus={['.cds--modal']}
  ...
>
```

`elementOrParentIsFloatingMenu` 用 `node.closest(selector)` 判斷。只要新的焦點目標的祖先包含 `.cds--modal`（即在任何 Carbon Modal 裡），外層就不搶焦點。Carbon 自己也用同一機制豁免 overflow-menu-options / tooltip。

**實作位置**：`src/shared/ui/modal/SettingsModal.tsx`

> 規則：任何包裝 Carbon `Modal` 的 wrapper（如 `SettingsModal`），若子元件可能再開 child modal，**必須加** `selectorsFloatingMenus={['.cds--modal']}`。

---

### 2. Carbon Toggle / 其他互動元件 — `scrollIntoView` 導致版面跳動

**現象**：在 Admin Shell（`position: fixed; inset: 0`）的設定頁中切換 `<Toggle>`，整頁內容消失或位移。

**根本原因**：Carbon `Toggle` 在 `onClick` 時呼叫 `buttonElement.current.focus()`，觸發瀏覽器原生 `scrollIntoView()`。如果 `body` 沒有被鎖定捲動，瀏覽器會往上找到 `document` 並移動 `window.scrollY`。同時，面板根元素（`SettingsPanel.module.scss .root`）是 flex item 但缺少 `min-height: 0`，導致內容可以把父層撐爆並被 `overflow: clip` 截斷。

**修復方式**（雙管齊下）：

1. **flex scroll container**（`SettingsPanel.module.scss`）：
```css
.root {
  flex: 1 1 auto;
  min-height: 0;   /* ← 關鍵：允許縮小到低於內容高度，overflow-y: auto 才能生效 */
  overflow-y: auto;
  overflow-x: hidden;
}
```

2. **Admin Shell 鎖定 body scroll**（`AdminShellLayout.tsx`）：
```tsx
useEffect(() => {
  const prev = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  return () => { document.body.style.overflow = prev; };
}, []);
```

> 規則：凡是 `position: fixed / absolute; inset: 0` 的全屏 shell，**mount 時就鎖 body scroll**。flex 子元素若作為 scroll container，**必須加 `min-height: 0`**（flex item 預設 `min-height: auto` 會無視 overflow scroll）。
