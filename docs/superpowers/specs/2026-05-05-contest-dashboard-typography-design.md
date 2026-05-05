# 競賽儀表板版面與排版整頓設計

- Date: 2026-05-05
- Scope: `frontend/src/features/contest/`（學生競賽儀表板 + 競賽管理儀表板 + 對應的 tab 區）
- Goal: 消除兩端各自實作的 title / subtitle / time / divider / tab+toolbar 樣式重複，建立可長期沿用的儀表板版面元件。

## 目前問題

目前學生端與管理端各自寫一套 SCSS：

- 頁面標題 size 不一（學生 1.75rem `heading-04`、管理寫死 `1.25rem`）。
- 區塊標題、metric label/value 各自命名（`.title` / `.sectionTitle` / `.recordTitle` / `.panelHeader h3` / `.examScheduleItem strong` …），且管理端多處直接寫 `1.25rem`、`1.5rem` 等 hardcoded 值。
- `border-right` / `border-bottom` + `:last-child { border: 0 }` 這類 divider 樣板在 `detailRow` / `examStatusMatrix` / `panelGrid` / 學生端 `.layout` 等多處重寫。
- Tab + toolbar 模式（`.tabRow / .tabRowToolbar / .tabRowSearch / .tabRowFilterMenu`）以及 mobile 換行 media query 在 participants / clarifications / proctoring 等 admin tab 各寫一份。
- 同一個 className（例如 `.title`、`.subtitle`）在多個 module 各自定義不同字型，閱讀程式碼時無從預期實際長相。

## 設計方向

採三層元件架構，由 Container 處理結構（佈局 + divider + 邊框），Block 處理內容外殼（padding + header slot），Typography primitives 處理字型細節。Tab + toolbar 不另立層級，而是 `DashboardBlock` 的一種頭部選擇。

兩端視覺對齊原則：

- 頁面標題使用學生端尺寸（`heading-04` 1.75rem）但採細體字（weight 400）。
- 其餘標題、metric、副標、時間，全部對齊管理端較緊湊的尺寸；移除所有 hardcode，全部走 Carbon token。

### Type Scale

| 角色 | Token | 計算值 | weight | 字型 |
| --- | --- | --- | --- | --- |
| PageTitle | `--cds-heading-04-font-size` | 1.75rem | 400（細體）| sans |
| PageSubtitle | `--cds-body-01-font-size` | 0.875rem | 400 | sans |
| SectionTitle | `--cds-heading-compact-02-font-size` | 1rem | 600 | sans |
| SectionDescription | `--cds-body-compact-01-font-size` | 0.875rem | 400 | sans |
| MetricLabel | `--cds-label-01-font-size` | 0.75rem | 400 | sans |
| MetricValue（預設）| `--cds-heading-compact-02-font-size` | 1rem | 600 | sans |
| MetricValue（大）| `--cds-heading-03-font-size` | 1.25rem | 600 | sans |
| TimeDisplay（大）| `--cds-heading-03-font-size` | 1.25rem | 600 | `--cds-code-font-family` |
| TimeDisplay（header 內聯）| `--cds-body-compact-01-font-size` | 0.875rem | 400 | `--cds-code-font-family` |

實作端規定：所有 typography 樣式必須來自 Carbon token；新增 stylelint 規則 `declaration-property-value-disallowed-list` 在 `font-size` / `font-weight` 上禁止寫死的 rem / 數字 weight。

## 元件規格

統一前綴 `Dashboard*`。所有元件放置於 `frontend/src/shared/components/dashboard/`（新建）。各元件一個 `.tsx` + 對應 `.module.scss`，禁止呼叫端透過 `className` / `style` 覆寫核心樣式。

### Layer 1：結構容器

#### `DashboardPage`

最外層 wrapper。處理 max-width clamp 與整體 padding，提供 scroll 區。對應目前學生端 `.root` + `.dashboard`、admin 的 `.page` + `.content`。

```tsx
<DashboardPage>
  {/* children: DashboardContainer 或多個區塊 */}
</DashboardPage>
```

#### `DashboardContainer`

```tsx
<DashboardContainer
  layout="stack" | "split" | "grid"
  columns={number | "auto"}        // 僅 layout="grid" 有效
  dividers="auto" | "none"          // 預設 "none"
  bordered                          // 是否畫外圍邊框
>
  {children}
</DashboardContainer>
```

行為：

- `stack`：垂直排列 children；`dividers="auto"` 時於每對相鄰 children 之間補水平分隔線（最後一個不補）。
- `split`：水平排列；`dividers="auto"` 時於相鄰 children 之間補垂直分隔線。
- `grid`：依 `columns` 排列；`dividers="auto"` 時水平與垂直分隔線都補，多列換行時兩個方向都處理（matrix 風格）。
- 可任意 nest。`bordered` 由外層控制，內層不重複畫框。
- 不接收 `padding` / `gap` / `style` / `className`，避免逃生口導致呼叫端再開分支。

對應目前 SCSS 中要刪除的：

- 學生端 `.layout`（split + bordered + 中間分隔線）。
- 學生端 `.detailRow` + `.detailCell` 的 grid + border-right + last-child 樣板。
- 管理端 `.examStatusMatrix` / `.examStatusMetric`、`.examScheduleGrid` / `.examScheduleItem` 的 grid + border-right。
- `.panelGrid`、`.entryGrid` 的外框 + 內部 divider。
- 上述伴隨的 mobile 拆欄 media query（由 Container 內部處理）。

#### `DashboardBlock`

```tsx
<DashboardBlock padding="default" | "compact" | "flush">
  {/* children 可以是 BlockHeader + 任意內容，或 DashboardTabs */}
</DashboardBlock>
```

行為：

- `padding`：`default`（一般 panel）/ `compact`（密度高的清單）/ `flush`（內部子組件自帶 padding，不再外加）。
- 不畫 border、不管自己跟兄弟之間的分隔線；那是父層 Container 的事。
- Block 是 leaf 級的內容外殼；children 可自由組合（shadcn 風）。

### Layer 2：Block 頭部

#### `BlockHeader`

```tsx
<BlockHeader
  title="參賽進度"
  titleAs="h2" | "h3"               // 預設 h2
  titleSize="page" | "section"      // 預設 section
  description="可選副標"
  actions={<IconButton ... />}
/>
```

`titleSize="page"` → 使用 `PageTitle` 樣式；`titleSize="section"` → `SectionTitle` 樣式。

對應目前 SCSS 要刪除的：

- 學生端 `.titleRow` / `.title` / `.tagRow`（actions slot 取代 tagRow 的固定位置）。
- 學生端 `.sectionHeader` / `.sectionTitle` / `.sectionDescription` / `.inlineRecordsHeader` / `.inlineRecordsTitle` / `.chartHeader`。
- 管理端 `.dashboardTitleBlock` / `.dashboardTitleRow h2` / `.dashboardDescription`、`.panelHeader h3` / `.panelHeader p`（`AdminOverviewCommandCenter`、`AdminPreparationDashboard`、`OverviewActionWidgets`、`OverviewInsightsPanel` 的同型樣式）。

### Layer 3：Tab 區

`DashboardTabs` 為 context provider，協調 `DashboardTabBar` 與 `DashboardTabPanel`。

```tsx
<DashboardBlock padding="flush">
  <DashboardTabs activeId={tabId} onChange={setTabId}>
    <DashboardTabBar
      tabs={[
        { id: "all", label: "全部" },
        { id: "active", label: "進行中", badge: 12 },
      ]}
      toolbar={
        <DashboardToolbar>
          <DashboardToolbar.Search value={q} onChange={setQ} placeholder="搜尋學生" />
          <DashboardToolbar.FilterMenu options={...} />
        </DashboardToolbar>
      }
    />

    <DashboardTabPanel tabId="all">{/* 自由內容 */}</DashboardTabPanel>
    <DashboardTabPanel tabId="active">{/* 自由內容 */}</DashboardTabPanel>
  </DashboardTabs>
</DashboardBlock>
```

責任分配：

- `DashboardTabs`：context（active id、onChange）。不畫任何視覺。
- `DashboardTabBar`：tab 列排版、底線 border-bottom、toolbar slot 的對齊與 `max-width` clamp、mobile 換行（toolbar 自動換到下一行佔滿寬度）。內部仍使用 Carbon `<Tabs> / <TabList> / <Tab>` 以保留鍵盤導覽與 aria。
- `DashboardTabPanel`：依 context 中 `activeId` 與自身 `tabId` 比對，match 才 render。
- `DashboardToolbar`：flex row、預設右對齊、提供 borderless 子元件樣式 context（取代目前 `:global(.cds--search-input) { border: none; background: transparent; }` 等覆蓋）。`children` 開放給任意內容（例如 export 按鈕）；常用的 `Search` / `FilterMenu` 以 sub-component 形式提供，內部已套好 toolbar 預設樣式。

對應目前 SCSS 要刪除的：

- `AdminOverviewCommandCenter.module.scss` 的 `.tabRow / .tabRowToolbar / .tabRowToolbarActive / .tabRowSearch / .tabRowFilterMenu` 與其 `@media (max-width: 672px)` 規則。
- 其他 admin panel（participants / clarifications / proctoring）若各自重抄一份，亦同步移除。

### Layer 4：Typography primitives

放 `frontend/src/shared/components/dashboard/typography/`。多數情境會被 `BlockHeader` 與 `MetricBlock` 等高階元件包用，呼叫端極少直接使用。

- `PageTitle`：預設 `<h1>`，可由 `as` 改。
- `SectionTitle`：預設 `<h2>`。
- `MetricBlock`：包裝 label + value（+ 可選 trend / icon slot），props `label`、`value`、`size="default" | "lg"`、`align="start" | "end"`。對應學生端 `.metricLabel + .metricValue`、管理端 `.examStatusMetric span+strong`、`.examScheduleItem span+strong`、`.examProgressTitle + .examProgressValue`、`participantSingleMetric`、`OverviewActionWidgets` 與 `OverviewInsightsPanel` 的數值 + 標籤組合。
- `TimeDisplay`：props `variant="countdown" | "header"`、`value`、`label`。`countdown` 走 `heading-03` + monospace；`header` 走 `body-compact-01` + monospace。對應學生端 `.timerValue`、`ContestHero` 的 `.timeLabel / .timeValue`、`ContestLayout` 的 `.headerTimerDisplay`。

所有 typography primitive 僅接 `as` / `size` / `align` 等語意 props，不接受 `style` / `className`。

## 整頓範圍

直接以新元件取代並刪除對應 SCSS 規則：

- `frontend/src/features/contest/components/studentDashboard/StudentContestDashboard.module.scss`
- `frontend/src/features/contest/components/studentDashboard/StudentContestDashboardView.tsx`
- `frontend/src/features/contest/components/participants/ContestParticipantsDashboard.module.scss`（若使用 panelHeader / sectionHeader）
- `frontend/src/features/contest/components/admin/AdminOverviewCommandCenter.module.scss` 與 `.tsx`
- `frontend/src/features/contest/components/admin/AdminPreparationDashboard.module.scss` 與 `.tsx`
- `frontend/src/features/contest/components/admin/AdminInsightRail.module.scss`
- `frontend/src/features/contest/components/admin/OverviewInsightsPanel.module.scss`
- `frontend/src/features/contest/components/admin/OverviewActionWidgets.module.scss`
- `frontend/src/features/contest/screens/admin/panels/AdminOverviewScreen.module.scss` 與 `.tsx`
- `frontend/src/features/contest/screens/admin/panels/AdminClarificationsPanel.module.scss`
- `frontend/src/features/contest/screens/admin/panels/AdminProctoringPanel.module.scss`
- `frontend/src/features/contest/components/layout/ContestHero.module.scss` 與相關 `.tsx`
- `frontend/src/features/contest/components/layout/ContestLayout.module.scss`（`.headerTimerDisplay` 部分換 `<TimeDisplay variant="header" />`，其餘 layout 樣式保留）

僅替換 typography / divider / tab+toolbar 相關規則；色彩、interactive state、specific layout（例如 `.scoreDistributionPanel` 的圖表容器尺寸）等保留不動。

## 預期效果

- 兩端頁面標題、區塊標題、metric、時間視覺一致；學生端僅以 weight 400 維持柔和感。
- `font-size` / `font-weight` / `border-right` / `border-bottom` + `:last-child` 的重複樣板從 contest 模組消失。
- 新儀表板（教師工作區、批改、統計、未來其他應用）可直接組合 `DashboardPage` / `Container` / `Block` / `BlockHeader` / `Tabs` / `Toolbar`，無需從零寫 module SCSS。
- 加上 stylelint 規則後，`font-size`、`font-weight` 寫死值無法再進入 contest 模組，避免回退。

## 開放議題

1. `DashboardContainer` `layout="grid"` 在多列 wrap 時的 divider 演算法在 RTL 下是否需要特例驗證。
2. 引入 stylelint 規則的範圍：先限縮在 `frontend/src/shared/components/dashboard/**` 與 `frontend/src/features/contest/**`，待穩定後再擴及全 features。
3. Storybook：每個新元件需有對應 story，列為實作計畫的一部分。
