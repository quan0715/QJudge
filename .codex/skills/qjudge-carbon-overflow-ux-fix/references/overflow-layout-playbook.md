# Overflow Layout Playbook (QJudge + Carbon)

## Pattern A: Full-bleed Admin Shell（避免 page + panel 雙捲動）

適用：
- `/contests/:contestId/admin` 類型頁面
- 有固定 header / rail sidenav

```scss
.layout {
  position: fixed;
  inset: 0;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
}

.content {
  position: absolute;
  top: 3rem;   // header
  left: 3rem;  // rail
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
}

.contentViewport {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
```

要點：
- `body` 不捲，panel 自己決定是否捲。
- 內容區用幾何定位鎖住可視範圍。

## Pattern B: Split Pane（左側清單 + 右側內容）

```scss
.root {
  display: flex;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.leftPane {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.rightPane {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto; // 唯一 scroll owner
}
```

要點：
- 左右 pane 都先 `min-height: 0`。
- 只有一邊 `overflow-y: auto`。

## Pattern C: Header + Body + Footer（中段獨立捲動）

```scss
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.panelHeader,
.panelFooter {
  flex-shrink: 0;
}

.panelBody {
  flex: 1;
  min-height: 0;
  overflow-y: auto; // 唯一 scroll owner
}
```

## 常見反模式（避免）

1. 父層 `overflow-y: auto` + 子層 `overflow-y: auto`
2. 只寫 `height: 100%`，但祖先沒有明確高度
3. flex 子元素漏掉 `min-height: 0`，導致內容把父層撐爆
4. 用 `margin/padding` 模擬 header 高度，卻沒鎖定內容區邊界
5. 在 `.cds--*` 內部 class 硬改 overflow，造成 Carbon 行為不可預期

## DevTools 快速定位

1. 先找哪個元素在滾：
- Console:
```js
[...document.querySelectorAll('*')].filter((el) => {
  const s = getComputedStyle(el);
  return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight;
});
```
2. 看主視窗是否也在捲：
- `document.documentElement.scrollHeight > window.innerHeight`
3. 用 Elements 面板沿 DOM 往上檢查是否缺 `min-height: 0`。

## 驗收標準
- 僅保留預期的一條垂直捲軸。
- 內容切換時，捲動行為穩定不跳動。
- Light/Dark 下沒有層次錯位或裁切。
