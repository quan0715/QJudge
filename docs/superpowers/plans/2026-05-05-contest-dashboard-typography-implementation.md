# 競賽儀表板版面與排版整頓 — 實作計畫

> **Spec:** `docs/superpowers/specs/2026-05-05-contest-dashboard-typography-design.md`

**Goal:** 把學生競賽儀表板與競賽管理儀表板各自重複的 title/subtitle/time/divider/tab+toolbar 樣式，遷移到一組可重用的 dashboard primitive（DashboardPage / Container / Block / BlockHeader / Tabs / Toolbar / 4 個 typography primitive）。

**Architecture:** 新元件放 `frontend/src/shared/components/dashboard/`，採三層 + tab 子系統設計。所有 typography 樣式來自 Carbon token；divider 由 Container 注入；tab+toolbar 樣式由 TabBar/Toolbar 內部處理。

**Tech Stack:** React 19 + TypeScript + CSS Modules + SCSS + `@carbon/react` + Vitest + Storybook (CSF3)。

---

## 執行順序

1. Phase 1：typography primitives（PageTitle / SectionTitle / MetricBlock / TimeDisplay）
2. Phase 2：結構元件（DashboardPage / Container / Block / BlockHeader）
3. Phase 3：Tabs + Toolbar 子系統
4. Phase 4：遷移學生競賽儀表板（小範圍驗證）
5. Phase 5：遷移管理端（AdminOverviewScreen header / CommandCenter / Preparation / ActionWidgets / InsightsPanel）
6. Phase 6：遷移 ContestHero / ContestLayout 時間相關

每個 Phase 結束都 commit。Phase 1–3 是純新增、零侵入；Phase 4 之後才動既有畫面。

---

## Phase 1：Typography Primitives

**Files:**

- Create: `frontend/src/shared/components/dashboard/typography/PageTitle.tsx`
- Create: `frontend/src/shared/components/dashboard/typography/PageTitle.module.scss`
- Create: `frontend/src/shared/components/dashboard/typography/SectionTitle.tsx`
- Create: `frontend/src/shared/components/dashboard/typography/SectionTitle.module.scss`
- Create: `frontend/src/shared/components/dashboard/typography/MetricBlock.tsx`
- Create: `frontend/src/shared/components/dashboard/typography/MetricBlock.module.scss`
- Create: `frontend/src/shared/components/dashboard/typography/TimeDisplay.tsx`
- Create: `frontend/src/shared/components/dashboard/typography/TimeDisplay.module.scss`
- Create: `frontend/src/shared/components/dashboard/typography/index.ts`
- Create: `frontend/src/shared/components/dashboard/typography/typography.test.tsx`
- Create: `frontend/src/shared/components/dashboard/typography/typography.stories.tsx`

### Task 1.1：PageTitle

責任：頁面層級主標題；預設 `<h1>`；學生端 size + 細體字。

- [ ] **Step 1：寫 SCSS**

```scss
// PageTitle.module.scss
.root {
  margin: 0;
  color: var(--cds-text-primary);
  font-size: var(--cds-heading-04-font-size, 1.75rem);
  font-weight: 400;
  line-height: var(--cds-heading-04-line-height, 1.28572);
}
```

- [ ] **Step 2：寫 component**

```tsx
// PageTitle.tsx
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import styles from "./PageTitle.module.scss";

type Props<E extends ElementType> = {
  as?: E;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<E>, "as" | "children" | "className" | "style">;

export function PageTitle<E extends ElementType = "h1">({
  as,
  children,
  ...rest
}: Props<E>) {
  const Tag = (as ?? "h1") as ElementType;
  return (
    <Tag className={styles.root} {...rest}>
      {children}
    </Tag>
  );
}
```

### Task 1.2：SectionTitle

責任：區塊標題；預設 `<h2>`；對齊 `heading-compact-02`。

- [ ] **Step 1：寫 SCSS**

```scss
// SectionTitle.module.scss
.root {
  margin: 0;
  color: var(--cds-text-primary);
  font-size: var(--cds-heading-compact-02-font-size, 1rem);
  font-weight: 600;
  line-height: var(--cds-heading-compact-02-line-height, 1.375);
}
```

- [ ] **Step 2：寫 component**

```tsx
// SectionTitle.tsx
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import styles from "./SectionTitle.module.scss";

type Props<E extends ElementType> = {
  as?: E;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<E>, "as" | "children" | "className" | "style">;

export function SectionTitle<E extends ElementType = "h2">({
  as,
  children,
  ...rest
}: Props<E>) {
  const Tag = (as ?? "h2") as ElementType;
  return (
    <Tag className={styles.root} {...rest}>
      {children}
    </Tag>
  );
}
```

### Task 1.3：MetricBlock

責任：label + value + 可選 trend slot；size default(1rem) / lg(1.25rem)；align start / end。

- [ ] **Step 1：寫 SCSS**

```scss
// MetricBlock.module.scss
.root {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
}

.alignEnd {
  justify-items: end;
  text-align: end;
}

.label {
  margin: 0;
  color: var(--cds-text-secondary);
  font-size: var(--cds-label-01-font-size, 0.75rem);
  font-weight: 400;
  line-height: var(--cds-label-01-line-height, 1.33333);
}

.value {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  margin: 0;
  color: var(--cds-text-primary);
  font-weight: 600;
}

.valueDefault {
  font-size: var(--cds-heading-compact-02-font-size, 1rem);
  line-height: var(--cds-heading-compact-02-line-height, 1.375);
}

.valueLg {
  font-size: var(--cds-heading-03-font-size, 1.25rem);
  line-height: var(--cds-heading-03-line-height, 1.4);
}
```

- [ ] **Step 2：寫 component**

```tsx
// MetricBlock.tsx
import type { ReactNode } from "react";
import styles from "./MetricBlock.module.scss";

export interface MetricBlockProps {
  label: ReactNode;
  value: ReactNode;
  size?: "default" | "lg";
  align?: "start" | "end";
  trailing?: ReactNode;
}

export function MetricBlock({
  label,
  value,
  size = "default",
  align = "start",
  trailing,
}: MetricBlockProps) {
  const valueClass =
    size === "lg" ? styles.valueLg : styles.valueDefault;
  const rootClass = [styles.root, align === "end" && styles.alignEnd]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={rootClass}>
      <span className={styles.label}>{label}</span>
      <strong className={`${styles.value} ${valueClass}`}>
        {value}
        {trailing}
      </strong>
    </div>
  );
}
```

### Task 1.4：TimeDisplay

責任：時間數字（monospace）；variant countdown / header；可選 label。

- [ ] **Step 1：寫 SCSS**

```scss
// TimeDisplay.module.scss
.root {
  display: inline-flex;
  flex-direction: column;
  min-width: 0;
}

.label {
  color: var(--cds-text-secondary);
  font-size: var(--cds-label-01-font-size, 0.75rem);
  font-weight: 400;
  line-height: var(--cds-label-01-line-height, 1.33333);
}

.value {
  color: var(--cds-text-primary);
  font-family: var(--cds-code-font-family, monospace);
}

.countdown {
  font-size: var(--cds-heading-03-font-size, 1.25rem);
  font-weight: 600;
  line-height: var(--cds-heading-03-line-height, 1.4);
}

.header {
  font-size: var(--cds-body-compact-01-font-size, 0.875rem);
  font-weight: 400;
  line-height: var(--cds-body-compact-01-line-height, 1.28572);
}
```

- [ ] **Step 2：寫 component**

```tsx
// TimeDisplay.tsx
import type { ReactNode } from "react";
import styles from "./TimeDisplay.module.scss";

export interface TimeDisplayProps {
  value: ReactNode;
  variant?: "countdown" | "header";
  label?: ReactNode;
}

export function TimeDisplay({
  value,
  variant = "countdown",
  label,
}: TimeDisplayProps) {
  const valueClass =
    variant === "header" ? styles.header : styles.countdown;
  return (
    <span className={styles.root}>
      {label && <span className={styles.label}>{label}</span>}
      <span className={`${styles.value} ${valueClass}`}>{value}</span>
    </span>
  );
}
```

### Task 1.5：Barrel export

- [ ] **Step 1：寫 index.ts**

```ts
// frontend/src/shared/components/dashboard/typography/index.ts
export { PageTitle } from "./PageTitle";
export { SectionTitle } from "./SectionTitle";
export { MetricBlock, type MetricBlockProps } from "./MetricBlock";
export { TimeDisplay, type TimeDisplayProps } from "./TimeDisplay";
```

### Task 1.6：行為測試

涵蓋：預設 tag、`as` 切換、MetricBlock align、TimeDisplay 有/無 label、TimeDisplay variant。

- [ ] **Step 1：寫測試**

```tsx
// typography.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  MetricBlock,
  PageTitle,
  SectionTitle,
  TimeDisplay,
} from "./index";

describe("PageTitle", () => {
  it("defaults to h1", () => {
    render(<PageTitle>Hello</PageTitle>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hello");
  });

  it("respects as prop", () => {
    render(<PageTitle as="h2">Hello</PageTitle>);
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
  });
});

describe("SectionTitle", () => {
  it("defaults to h2", () => {
    render(<SectionTitle>Section</SectionTitle>);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Section");
  });
});

describe("MetricBlock", () => {
  it("renders label and value", () => {
    render(<MetricBlock label="參賽人數" value={42} />);
    expect(screen.getByText("參賽人數")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders trailing slot", () => {
    render(
      <MetricBlock label="x" value="y" trailing={<span data-testid="t">T</span>} />,
    );
    expect(screen.getByTestId("t")).toBeInTheDocument();
  });
});

describe("TimeDisplay", () => {
  it("renders value", () => {
    render(<TimeDisplay value="01:23:45" />);
    expect(screen.getByText("01:23:45")).toBeInTheDocument();
  });

  it("renders optional label", () => {
    render(<TimeDisplay value="01:23:45" label="剩餘時間" />);
    expect(screen.getByText("剩餘時間")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2：跑測試**

```bash
cd frontend && npx vitest run src/shared/components/dashboard/typography
```

預期：全綠。

### Task 1.7：Storybook stories

- [ ] **Step 1：寫 stories**

```tsx
// typography.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import { ArrowUp } from "@carbon/icons-react";
import {
  MetricBlock,
  PageTitle,
  SectionTitle,
  TimeDisplay,
} from "./index";

const meta: Meta = {
  title: "Dashboard/Typography",
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj;

export const Headings: Story = {
  render: () => (
    <div style={{ display: "grid", gap: "1rem" }}>
      <PageTitle>2026 春季程式競賽</PageTitle>
      <SectionTitle>參賽進度</SectionTitle>
    </div>
  ),
};

export const Metrics: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "2rem" }}>
      <MetricBlock label="題目數量" value={12} />
      <MetricBlock label="參賽人數" value={42} size="lg" />
      <MetricBlock
        label="完成率"
        value="78%"
        size="lg"
        trailing={<ArrowUp size={16} />}
      />
      <MetricBlock label="剩餘" value="04:12" align="end" />
    </div>
  ),
};

export const Times: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
      <TimeDisplay variant="countdown" value="01:23:45" label="剩餘時間" />
      <TimeDisplay variant="header" value="14:05" />
    </div>
  ),
};
```

### Task 1.8：Commit

- [ ] **Step 1：commit**

```bash
git add frontend/src/shared/components/dashboard/typography
git commit -m "feat(dashboard): add typography primitives"
```

---

## Phase 2：結構元件 Container / Block / BlockHeader

**Files:**

- Create: `frontend/src/shared/components/dashboard/DashboardPage.tsx`
- Create: `frontend/src/shared/components/dashboard/DashboardPage.module.scss`
- Create: `frontend/src/shared/components/dashboard/DashboardContainer.tsx`
- Create: `frontend/src/shared/components/dashboard/DashboardContainer.module.scss`
- Create: `frontend/src/shared/components/dashboard/DashboardBlock.tsx`
- Create: `frontend/src/shared/components/dashboard/DashboardBlock.module.scss`
- Create: `frontend/src/shared/components/dashboard/BlockHeader.tsx`
- Create: `frontend/src/shared/components/dashboard/BlockHeader.module.scss`
- Create: `frontend/src/shared/components/dashboard/index.ts`
- Create: `frontend/src/shared/components/dashboard/structure.test.tsx`
- Create: `frontend/src/shared/components/dashboard/structure.stories.tsx`

### Task 2.1：DashboardPage

責任：scroll 容器 + max-width clamp + 頁面 padding。

- [ ] **Step 1：SCSS**

```scss
// DashboardPage.module.scss
.root {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.inner {
  max-width: 1180px;
  margin: 0 auto;
  padding: 1rem;
}

@media (max-width: 672px) {
  .inner {
    padding: 0.75rem;
  }
}
```

- [ ] **Step 2：component**

```tsx
// DashboardPage.tsx
import type { ReactNode } from "react";
import styles from "./DashboardPage.module.scss";

export interface DashboardPageProps {
  children: ReactNode;
  ariaLabel?: string;
}

export function DashboardPage({ children, ariaLabel }: DashboardPageProps) {
  return (
    <main className={styles.root} aria-label={ariaLabel}>
      <div className={styles.inner}>{children}</div>
    </main>
  );
}
```

### Task 2.2：DashboardContainer

責任：layout=stack/split/grid + dividers="auto"|"none" + bordered；不接 padding/style/className。

關鍵實作：dividers 用 `> *:not(:last-child)` 補 border（stack：bottom；split：right；grid：right + bottom 都補，外層 wrap 時自動）。

- [ ] **Step 1：SCSS**

```scss
// DashboardContainer.module.scss
.root {
  display: flex;
  min-width: 0;
}

.bordered {
  border: 1px solid var(--cds-border-subtle);
}

// stack
.stack {
  flex-direction: column;
}

.stack.dividers > *:not(:last-child) {
  border-bottom: 1px solid var(--cds-border-subtle);
}

// split
.split {
  flex-direction: row;
  align-items: stretch;
}

.split.dividers > *:not(:last-child) {
  border-right: 1px solid var(--cds-border-subtle);
}

@media (max-width: 1056px) {
  .split {
    flex-direction: column;
  }

  .split.dividers > *:not(:last-child) {
    border-right: 0;
    border-bottom: 1px solid var(--cds-border-subtle);
  }
}

// grid
.grid {
  display: grid;
}

.gridCols2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.gridCols3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.gridCols4 {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.gridColsAuto {
  grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
}

.grid.dividers > * {
  border-right: 1px solid var(--cds-border-subtle);
  border-bottom: 1px solid var(--cds-border-subtle);
}

// 最右一欄 / 最下一列消除多餘 border 由具體 column 數決定
.grid.dividers.gridCols2 > *:nth-child(2n) { border-right: 0; }
.grid.dividers.gridCols3 > *:nth-child(3n) { border-right: 0; }
.grid.dividers.gridCols4 > *:nth-child(4n) { border-right: 0; }

// 最後一列無下邊框（簡化處理：所有 child 加 bottom，再用負的 margin 方式較複雜；改用最後 child 取消）
.grid.dividers > *:last-child { border-right: 0; }

// 最後一整列移除底邊：以 nth-last-child + nth-child 的精確算法在 wrap 情境較難覆蓋全部欄數；保留底邊時讓外層 .bordered 包裹效果視覺仍可接受。
// （保留 bottom border，整體外觀類似 Carbon DataTable 的網格視覺）

@media (max-width: 672px) {
  .grid:not(.gridColsAuto) {
    grid-template-columns: 1fr;
  }

  .grid.dividers:not(.gridColsAuto) > * {
    border-right: 0;
  }
}
```

- [ ] **Step 2：component**

```tsx
// DashboardContainer.tsx
import type { ReactNode } from "react";
import styles from "./DashboardContainer.module.scss";

type Layout = "stack" | "split" | "grid";
type Columns = 2 | 3 | 4 | "auto";

export interface DashboardContainerProps {
  layout: Layout;
  columns?: Columns;
  dividers?: "auto" | "none";
  bordered?: boolean;
  children: ReactNode;
  ariaLabel?: string;
}

const COLS_CLASS: Record<Columns, string> = {
  2: styles.gridCols2,
  3: styles.gridCols3,
  4: styles.gridCols4,
  auto: styles.gridColsAuto,
};

export function DashboardContainer({
  layout,
  columns,
  dividers = "none",
  bordered = false,
  children,
  ariaLabel,
}: DashboardContainerProps) {
  const classes = [
    styles.root,
    styles[layout],
    dividers === "auto" && styles.dividers,
    bordered && styles.bordered,
    layout === "grid" && columns && COLS_CLASS[columns],
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes} aria-label={ariaLabel}>
      {children}
    </div>
  );
}
```

### Task 2.3：DashboardBlock

責任：padding (default/compact/flush)；不畫 border。

- [ ] **Step 1：SCSS**

```scss
// DashboardBlock.module.scss
.root {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.paddingDefault {
  padding: 1.25rem 1.5rem;
}

.paddingCompact {
  padding: 0.75rem 1rem;
}

.paddingFlush {
  padding: 0;
}

@media (max-width: 672px) {
  .paddingDefault {
    padding: 1rem;
  }
}
```

- [ ] **Step 2：component**

```tsx
// DashboardBlock.tsx
import type { ReactNode } from "react";
import styles from "./DashboardBlock.module.scss";

type Padding = "default" | "compact" | "flush";

export interface DashboardBlockProps {
  padding?: Padding;
  children: ReactNode;
  ariaLabel?: string;
}

const PAD: Record<Padding, string> = {
  default: styles.paddingDefault,
  compact: styles.paddingCompact,
  flush: styles.paddingFlush,
};

export function DashboardBlock({
  padding = "default",
  children,
  ariaLabel,
}: DashboardBlockProps) {
  return (
    <section
      className={`${styles.root} ${PAD[padding]}`}
      aria-label={ariaLabel}
    >
      {children}
    </section>
  );
}
```

### Task 2.4：BlockHeader

責任：title + description + actions slot；可選 titleSize=page|section、titleAs。

- [ ] **Step 1：SCSS**

```scss
// BlockHeader.module.scss
.root {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.text {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
}

.description {
  margin: 0;
  color: var(--cds-text-secondary);
  font-size: var(--cds-body-compact-01-font-size, 0.875rem);
  line-height: var(--cds-body-compact-01-line-height, 1.28572);
}

.actions {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  flex: 0 0 auto;
}
```

- [ ] **Step 2：component**

```tsx
// BlockHeader.tsx
import type { ElementType, ReactNode } from "react";
import { PageTitle } from "./typography/PageTitle";
import { SectionTitle } from "./typography/SectionTitle";
import styles from "./BlockHeader.module.scss";

export interface BlockHeaderProps {
  title: ReactNode;
  titleAs?: ElementType;
  titleSize?: "page" | "section";
  description?: ReactNode;
  actions?: ReactNode;
}

export function BlockHeader({
  title,
  titleAs,
  titleSize = "section",
  description,
  actions,
}: BlockHeaderProps) {
  const TitleComp = titleSize === "page" ? PageTitle : SectionTitle;
  return (
    <header className={styles.root}>
      <div className={styles.text}>
        <TitleComp as={titleAs}>{title}</TitleComp>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
```

### Task 2.5：Barrel export

- [ ] **Step 1：寫 index.ts**

```ts
// frontend/src/shared/components/dashboard/index.ts
export * from "./typography";
export { DashboardPage } from "./DashboardPage";
export {
  DashboardContainer,
  type DashboardContainerProps,
} from "./DashboardContainer";
export { DashboardBlock, type DashboardBlockProps } from "./DashboardBlock";
export { BlockHeader, type BlockHeaderProps } from "./BlockHeader";
```

### Task 2.6：行為測試

- [ ] **Step 1：寫測試**

```tsx
// structure.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  BlockHeader,
  DashboardBlock,
  DashboardContainer,
  DashboardPage,
} from "./index";

describe("DashboardPage", () => {
  it("renders children inside main", () => {
    render(<DashboardPage ariaLabel="page">x</DashboardPage>);
    expect(screen.getByRole("main", { name: "page" })).toHaveTextContent("x");
  });
});

describe("DashboardContainer", () => {
  it("renders children", () => {
    render(
      <DashboardContainer layout="stack">
        <div>a</div>
        <div>b</div>
      </DashboardContainer>,
    );
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("b")).toBeInTheDocument();
  });
});

describe("DashboardBlock", () => {
  it("renders as section", () => {
    render(<DashboardBlock ariaLabel="block">body</DashboardBlock>);
    expect(screen.getByRole("region", { name: "block" })).toHaveTextContent("body");
  });
});

describe("BlockHeader", () => {
  it("renders title and description", () => {
    render(<BlockHeader title="Hello" description="desc" />);
    expect(screen.getByRole("heading", { name: "Hello" })).toBeInTheDocument();
    expect(screen.getByText("desc")).toBeInTheDocument();
  });

  it("renders actions slot", () => {
    render(
      <BlockHeader
        title="t"
        actions={<button data-testid="a">A</button>}
      />,
    );
    expect(screen.getByTestId("a")).toBeInTheDocument();
  });

  it("uses h1 when titleSize=page", () => {
    render(<BlockHeader title="X" titleSize="page" />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2：跑測試**

```bash
cd frontend && npx vitest run src/shared/components/dashboard
```

預期：全綠。

### Task 2.7：Storybook stories

- [ ] **Step 1：寫 stories**

```tsx
// structure.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import { Add } from "@carbon/icons-react";
import { Button } from "@carbon/react";
import {
  BlockHeader,
  DashboardBlock,
  DashboardContainer,
  DashboardPage,
  MetricBlock,
} from "./index";

const meta: Meta = {
  title: "Dashboard/Structure",
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj;

export const SplitWithStackInside: Story = {
  render: () => (
    <DashboardPage>
      <DashboardContainer layout="split" bordered dividers="auto">
        <DashboardContainer layout="stack" dividers="auto">
          <DashboardBlock>
            <BlockHeader
              titleSize="page"
              title="2026 春季程式競賽"
              description="練習用儀表板示範"
              actions={<Button size="sm" renderIcon={Add}>新增</Button>}
            />
          </DashboardBlock>
          <DashboardContainer layout="grid" columns={3} dividers="auto">
            <DashboardBlock><MetricBlock label="題目" value={12} /></DashboardBlock>
            <DashboardBlock><MetricBlock label="參賽" value={42} /></DashboardBlock>
            <DashboardBlock><MetricBlock label="完成率" value="78%" /></DashboardBlock>
          </DashboardContainer>
        </DashboardContainer>
        <DashboardContainer layout="stack" dividers="auto">
          <DashboardBlock>
            <BlockHeader title="統計" description="近 24 小時" />
          </DashboardBlock>
          <DashboardBlock>內容</DashboardBlock>
        </DashboardContainer>
      </DashboardContainer>
    </DashboardPage>
  ),
};

export const Grid2x2Matrix: Story = {
  render: () => (
    <DashboardContainer layout="grid" columns={2} bordered dividers="auto">
      <DashboardBlock><MetricBlock label="A" value="1" size="lg" /></DashboardBlock>
      <DashboardBlock><MetricBlock label="B" value="2" size="lg" /></DashboardBlock>
      <DashboardBlock><MetricBlock label="C" value="3" size="lg" /></DashboardBlock>
      <DashboardBlock><MetricBlock label="D" value="4" size="lg" /></DashboardBlock>
    </DashboardContainer>
  ),
};
```

### Task 2.8：Commit

- [ ] **Step 1：commit**

```bash
git add frontend/src/shared/components/dashboard
git commit -m "feat(dashboard): add page/container/block/header primitives"
```

---

## Phase 3：Tabs + Toolbar

**Files:**

- Create: `frontend/src/shared/components/dashboard/tabs/DashboardTabs.tsx`
- Create: `frontend/src/shared/components/dashboard/tabs/DashboardTabBar.tsx`
- Create: `frontend/src/shared/components/dashboard/tabs/DashboardTabBar.module.scss`
- Create: `frontend/src/shared/components/dashboard/tabs/DashboardTabPanel.tsx`
- Create: `frontend/src/shared/components/dashboard/tabs/DashboardToolbar.tsx`
- Create: `frontend/src/shared/components/dashboard/tabs/DashboardToolbar.module.scss`
- Create: `frontend/src/shared/components/dashboard/tabs/index.ts`
- Create: `frontend/src/shared/components/dashboard/tabs/tabs.test.tsx`
- Create: `frontend/src/shared/components/dashboard/tabs/tabs.stories.tsx`
- Modify: `frontend/src/shared/components/dashboard/index.ts`（加上 tabs 出口）

### Task 3.1：DashboardTabs context provider

- [ ] **Step 1：context**

```tsx
// DashboardTabs.tsx
import { createContext, useContext, type ReactNode } from "react";

interface Ctx {
  activeId: string;
  onChange: (id: string) => void;
}
const TabsCtx = createContext<Ctx | null>(null);

export interface DashboardTabsProps {
  activeId: string;
  onChange: (id: string) => void;
  children: ReactNode;
}

export function DashboardTabs({
  activeId,
  onChange,
  children,
}: DashboardTabsProps) {
  return (
    <TabsCtx.Provider value={{ activeId, onChange }}>
      {children}
    </TabsCtx.Provider>
  );
}

export function useDashboardTabs(): Ctx {
  const ctx = useContext(TabsCtx);
  if (!ctx) {
    throw new Error("DashboardTabs context missing");
  }
  return ctx;
}
```

### Task 3.2：DashboardTabBar

- [ ] **Step 1：SCSS**

```scss
// DashboardTabBar.module.scss
.root {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--cds-border-subtle);
}

.tabs {
  flex: 0 1 auto;
  min-width: 0;
}

.toolbar {
  display: inline-flex;
  align-items: center;
  flex: 0 1 auto;
  margin: 0 1rem;
  align-self: center;
  max-width: 24rem;
  width: 100%;
}

@media (max-width: 672px) {
  .root {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
  }

  .toolbar {
    margin: 0 1rem 0.5rem;
    max-width: none;
  }
}
```

- [ ] **Step 2：component（用 Carbon Tabs）**

```tsx
// DashboardTabBar.tsx
import type { ReactNode } from "react";
import { Tabs, TabList, Tab } from "@carbon/react";
import { useDashboardTabs } from "./DashboardTabs";
import styles from "./DashboardTabBar.module.scss";

export interface TabDef {
  id: string;
  label: ReactNode;
  badge?: ReactNode;
}

export interface DashboardTabBarProps {
  tabs: TabDef[];
  toolbar?: ReactNode;
}

export function DashboardTabBar({ tabs, toolbar }: DashboardTabBarProps) {
  const { activeId, onChange } = useDashboardTabs();
  const selectedIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === activeId),
  );
  return (
    <div className={styles.root}>
      <Tabs
        selectedIndex={selectedIndex}
        onChange={({ selectedIndex }) => {
          const next = tabs[selectedIndex];
          if (next) onChange(next.id);
        }}
        className={styles.tabs}
      >
        <TabList aria-label="dashboard tabs">
          {tabs.map((t) => (
            <Tab key={t.id}>
              {t.label}
              {t.badge !== undefined && <> ({t.badge})</>}
            </Tab>
          ))}
        </TabList>
      </Tabs>
      {toolbar && <div className={styles.toolbar}>{toolbar}</div>}
    </div>
  );
}
```

### Task 3.3：DashboardTabPanel

- [ ] **Step 1：component**

```tsx
// DashboardTabPanel.tsx
import type { ReactNode } from "react";
import { useDashboardTabs } from "./DashboardTabs";

export interface DashboardTabPanelProps {
  tabId: string;
  children: ReactNode;
}

export function DashboardTabPanel({ tabId, children }: DashboardTabPanelProps) {
  const { activeId } = useDashboardTabs();
  if (activeId !== tabId) return null;
  return <>{children}</>;
}
```

### Task 3.4：DashboardToolbar

- [ ] **Step 1：SCSS**

```scss
// DashboardToolbar.module.scss
.root {
  display: inline-flex;
  align-items: stretch;
  width: 100%;
  gap: 0;
  border: 0;
  background: transparent;
}

.search {
  flex: 1 1 auto;
  min-width: 0;
}

.search :global(.cds--search-input) {
  border: none;
  background: transparent;
}

.search :global(.cds--search-magnifier) {
  inset-inline-start: 0.75rem;
}

.filterMenu {
  flex: 0 0 auto;
  border-left: 0;
}
```

- [ ] **Step 2：component**

```tsx
// DashboardToolbar.tsx
import type { ChangeEvent, ReactNode } from "react";
import { Search } from "@carbon/react";
import styles from "./DashboardToolbar.module.scss";

export interface DashboardToolbarProps {
  children: ReactNode;
}

function Root({ children }: DashboardToolbarProps) {
  return <div className={styles.root}>{children}</div>;
}

interface ToolbarSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

function ToolbarSearch({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: ToolbarSearchProps) {
  return (
    <div className={styles.search}>
      <Search
        size="lg"
        labelText={ariaLabel ?? placeholder ?? "search"}
        placeholder={placeholder}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
    </div>
  );
}

interface ToolbarFilterSlotProps {
  children: ReactNode;
}
function ToolbarFilter({ children }: ToolbarFilterSlotProps) {
  return <div className={styles.filterMenu}>{children}</div>;
}

export const DashboardToolbar = Object.assign(Root, {
  Search: ToolbarSearch,
  Filter: ToolbarFilter,
});
```

### Task 3.5：Barrel exports

- [ ] **Step 1：tabs/index.ts**

```ts
export {
  DashboardTabs,
  type DashboardTabsProps,
} from "./DashboardTabs";
export {
  DashboardTabBar,
  type DashboardTabBarProps,
  type TabDef,
} from "./DashboardTabBar";
export {
  DashboardTabPanel,
  type DashboardTabPanelProps,
} from "./DashboardTabPanel";
export {
  DashboardToolbar,
  type DashboardToolbarProps,
} from "./DashboardToolbar";
```

- [ ] **Step 2：在 dashboard/index.ts 加入**

```ts
export * from "./tabs";
```

### Task 3.6：行為測試

- [ ] **Step 1：tabs.test.tsx**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  DashboardTabBar,
  DashboardTabPanel,
  DashboardTabs,
  DashboardToolbar,
} from "./index";

describe("Dashboard tabs", () => {
  function setup(active: string, onChange = vi.fn()) {
    render(
      <DashboardTabs activeId={active} onChange={onChange}>
        <DashboardTabBar
          tabs={[
            { id: "a", label: "A" },
            { id: "b", label: "B" },
          ]}
          toolbar={
            <DashboardToolbar>
              <DashboardToolbar.Search
                value=""
                onChange={() => undefined}
                placeholder="search"
              />
            </DashboardToolbar>
          }
        />
        <DashboardTabPanel tabId="a">PANEL_A</DashboardTabPanel>
        <DashboardTabPanel tabId="b">PANEL_B</DashboardTabPanel>
      </DashboardTabs>,
    );
    return { onChange };
  }

  it("only renders active panel", () => {
    setup("a");
    expect(screen.getByText("PANEL_A")).toBeInTheDocument();
    expect(screen.queryByText("PANEL_B")).not.toBeInTheDocument();
  });

  it("renders toolbar slot", () => {
    setup("a");
    expect(screen.getByPlaceholderText("search")).toBeInTheDocument();
  });

  it("fires onChange when clicking another tab", () => {
    const { onChange } = setup("a");
    fireEvent.click(screen.getByRole("tab", { name: "B" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
```

- [ ] **Step 2：跑測試**

```bash
cd frontend && npx vitest run src/shared/components/dashboard/tabs
```

### Task 3.7：Stories

- [ ] **Step 1：tabs.stories.tsx**

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  DashboardBlock,
  DashboardTabBar,
  DashboardTabPanel,
  DashboardTabs,
  DashboardToolbar,
} from "../index";

const meta: Meta = {
  title: "Dashboard/Tabs",
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj;

export const TabsWithToolbar: Story = {
  render: () => {
    const [active, setActive] = useState("all");
    const [q, setQ] = useState("");
    return (
      <DashboardBlock padding="flush">
        <DashboardTabs activeId={active} onChange={setActive}>
          <DashboardTabBar
            tabs={[
              { id: "all", label: "全部" },
              { id: "active", label: "進行中", badge: 12 },
              { id: "done", label: "已結束" },
            ]}
            toolbar={
              <DashboardToolbar>
                <DashboardToolbar.Search
                  value={q}
                  onChange={setQ}
                  placeholder="搜尋學生"
                />
              </DashboardToolbar>
            }
          />
          <DashboardTabPanel tabId="all">
            <div style={{ padding: "1rem" }}>全部內容</div>
          </DashboardTabPanel>
          <DashboardTabPanel tabId="active">
            <div style={{ padding: "1rem" }}>進行中</div>
          </DashboardTabPanel>
          <DashboardTabPanel tabId="done">
            <div style={{ padding: "1rem" }}>已結束</div>
          </DashboardTabPanel>
        </DashboardTabs>
      </DashboardBlock>
    );
  },
};
```

### Task 3.8：Commit

```bash
git add frontend/src/shared/components/dashboard/tabs frontend/src/shared/components/dashboard/index.ts
git commit -m "feat(dashboard): add tabs and toolbar primitives"
```

---

## Phase 4：遷移學生競賽儀表板

**Files:**

- Modify: `frontend/src/features/contest/components/studentDashboard/StudentContestDashboardView.tsx`
- Modify: `frontend/src/features/contest/components/studentDashboard/StudentContestDashboard.module.scss`（移除已用元件取代的規則）
- Read for context: `frontend/src/features/contest/components/studentDashboard/StudentContestDashboardView.test.tsx`

### Task 4.1：取代外層 layout

- [ ] **Step 1：把 `<main className={styles.root}><div className={styles.dashboard}><div className={styles.layout}>...` 換成 `<DashboardPage ariaLabel="學生競賽首頁"><DashboardContainer layout="split" bordered dividers="auto">...`

- [ ] **Step 2：左欄改 `<DashboardContainer layout="stack" dividers="auto">`，右欄同理。

### Task 4.2：取代 titleRow / detailRow / 各種 metric

- [ ] **Step 1**：頁面標題用 `<DashboardBlock><BlockHeader titleSize="page" title={contest.name} actions={<TagRow ... />} /></DashboardBlock>`。
- [ ] **Step 2**：原 `.detailRow` 三格 metric 改 `<DashboardContainer layout="grid" columns={3} dividers="auto">` 內含三個 `<DashboardBlock><MetricBlock label="..." value={...} /></DashboardBlock>`。
- [ ] **Step 3**：原右欄 summaryMetric / summaryChart / scoreDistributionPanel / actionStack / rulesPanel 各包成 `<DashboardBlock>`，header 用 `<BlockHeader title="..." description="..." />` 或 `<BlockHeader title="..." />`。
- [ ] **Step 4**：`.timerValue` 換 `<TimeDisplay variant="countdown" value={remainingTime} label="剩餘時間" />`。
- [ ] **Step 5**：`.recordTitle` / `.recordMeta` 區仍走自有 layout（這部分不在整頓範圍），但 `.metricLabel + .metricValue` 全部用 `<MetricBlock>`。

### Task 4.3：清理舊 SCSS

- [ ] **Step 1**：刪除 `StudentContestDashboard.module.scss` 中已不使用的：`.title`、`.titleRow`、`.tagRow`、`.sectionHeader`、`.sectionTitle`、`.inlineRecordsTitle`、`.sectionDescription`、`.detailRow`、`.detailCell`、`.summaryMetric`、`.scoreDistributionPanel`、`.actionStack`、`.rulesPanel`、`.timerValue`、`.metricLabel`、`.metricValue`、`.layout`、`.mainPanel`、`.summaryPanel`、`.dashboard`、`.root`，以及對應的 media query 內覆寫。
- [ ] **Step 2**：保留 `.recordTitle`、`.recordScore`、`.recordMeta`、`.problemReportList`、`.problemReportItem`、`.problemReportMeta`、`.questionList`、`.errorText`、`.emptyText`、`.warningIcon`、`.successIcon`、`.progressTrack`、`.progressFill`、`.chartSkeleton`、`.scoreDistributionChart`、`.rulesContent`、`.inlineRecordsPanel`（這些是 record-list 與 chart 自己的 layout，不在整頓範圍）。

### Task 4.4：跑既有測試

- [ ] **Step 1：跑 student dashboard 測試**

```bash
cd frontend && npx vitest run src/features/contest/components/studentDashboard
```

預期：全綠（測試斷言應為 text content 或 aria，不依賴具體 className）。

如有測試斷言依賴 `styles.title` className，更新為 `getByRole("heading", { name: ... })`。

### Task 4.5：lint / typecheck

```bash
cd frontend && npx tsc -b --noEmit && npm run lint -- src/features/contest/components/studentDashboard src/shared/components/dashboard
```

### Task 4.6：Commit

```bash
git add frontend/src/features/contest/components/studentDashboard
git commit -m "refactor(contest): migrate student dashboard to dashboard primitives"
```

---

## Phase 5：遷移管理端主畫面

涵蓋：

- `screens/admin/panels/AdminOverviewScreen.tsx` 與 `.module.scss`：頁面 header 改 `BlockHeader titleSize="page"`，刪除 `.dashboardTitleBlock / .dashboardTitleRow h2 / .dashboardDescription / .contestHeader`。
- `components/admin/AdminOverviewCommandCenter.tsx` 與 `.module.scss`：
  - `.examStatusMatrix + .examStatusMetric` 換 `DashboardContainer layout="grid" columns={2} dividers="auto"` + `MetricBlock size="lg"`。
  - `.examScheduleGrid + .examScheduleItem` 換 `DashboardContainer layout="grid" columns={2} dividers="auto"` + `MetricBlock size="lg"`。
  - `.examProgressBlock + .examProgressTitle + .examProgressValue` 換 `DashboardBlock` + `MetricBlock size="lg"`。
  - `.panelHeader h3 / .panelHeader p` 全換 `BlockHeader`，刪 SCSS 對應規則。
- `components/admin/AdminPreparationDashboard.module.scss`：`.panelHeader` 同上。
- `components/admin/OverviewActionWidgets.module.scss`：`.title / .subtitle / .widgetTitle / 數值` 改用 `BlockHeader` + `MetricBlock`。
- `components/admin/OverviewInsightsPanel.module.scss`：`.title / .actionTileTitle / 數值` 同上。
- `components/admin/AdminInsightRail.module.scss`：影響部分（標題與描述）。

每個檔案改完後 commit：

```bash
git commit -m "refactor(contest-admin): migrate <FileName> to dashboard primitives"
```

完成後跑：

```bash
cd frontend && npx vitest run src/features/contest && npx tsc -b --noEmit
```

---

## Phase 6：遷移 ContestHero / ContestLayout 時間元件

**Files:**

- Modify: `frontend/src/features/contest/components/layout/ContestHero.tsx`
- Modify: `frontend/src/features/contest/components/layout/ContestHero.module.scss`：刪 `.timeLabel / .timeValue`。
- Modify: `frontend/src/features/contest/components/layout/ContestLayout.tsx`：`.headerTimerDisplay` 處改 `<TimeDisplay variant="header" value={...} />`。
- Modify: `frontend/src/features/contest/components/layout/ContestLayout.module.scss`：刪 `.headerTimerDisplay`。

完成後 commit：

```bash
git commit -m "refactor(contest): use TimeDisplay primitive for hero and layout timers"
```

---

## 收尾

- [ ] 跑全部 contest 測試：`cd frontend && npx vitest run src/features/contest`
- [ ] 跑 typecheck：`cd frontend && npx tsc -b --noEmit`
- [ ] 啟動 storybook 目視：`bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev logs -f storybook`，逐個檢查 `Dashboard/Typography`、`Dashboard/Structure`、`Dashboard/Tabs` 故事。
- [ ] 啟動 dev：visual check 學生 dashboard 與 admin overview。

完成 Phase 1–6 後，stylelint 規則與其餘 admin tab（participants/clarifications/proctoring）的 toolbar 遷移為獨立後續工作。
