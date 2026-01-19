# Storybook 生成標準與規範

## 概覽

- 訪問路徑：`/dev/storybook`（僅開發環境）
- 檔案位置：與組件同目錄，命名為 `<ComponentName>.stories.tsx`
- 註冊位置：`src/features/storybook/registry/index.ts`

## 目錄結構

```
src/
├── shared/
│   ├── ui/
│   │   └── tag/
│   │       ├── AcrBadge.tsx
│   │       └── AcrBadge.stories.tsx    ← 與組件同目錄
│   └── config/
│       ├── ThemeSwitch.tsx
│       └── ThemeSwitch.stories.tsx
├── features/
│   └── problem/
│       └── components/
│           ├── ProblemPreviewCard.tsx
│           └── ProblemPreviewCard.stories.tsx
└── domains/
    └── storybook/
        ├── registry/index.ts           ← 註冊所有 stories
        └── mocks/                       ← Mock 資料
            ├── index.ts
            └── problem.mock.ts
```

## Story 檔案結構標準

```tsx
import type { StoryModule } from "@/features/storybook/types/story";
import { MyComponent, type MyComponentProps } from "./MyComponent";

const storyModule: StoryModule<MyComponentProps> = {
  meta: {
    title: "shared/ui/folder/MyComponent", // 路徑格式
    component: MyComponent,
    description: "組件用途說明",
    category: "shared" | "features" | "ui" | "layouts",
    defaultArgs: {
      /* 預設 props */
    },
    argTypes: {
      /* 控制項定義 */
    },
  },
  stories: [
    /* story 陣列 */
  ],
};

export default storyModule;
```

## argTypes 定義規範

| control 類型   | 適用場景         | 範例                            |
| -------------- | ---------------- | ------------------------------- |
| `text`         | 字串輸入         | `label`, `placeholder`          |
| `number`       | 數值輸入         | `value`, `maxCount`             |
| `boolean`      | 開關             | `disabled`, `showLabel`         |
| `select`       | 單選（有限選項） | `size: "sm" \| "md"`, `variant` |
| `multi-select` | 多選             | `selectedTags`                  |
| `array`        | 陣列輸入         | `labels: string[]`              |
| `object`       | 物件（複雜資料） | `problem: Problem`              |

### argTypes 範例

```tsx
argTypes: {
  value: {
    control: "number",
    label: "數值",
    description: "0-100 的百分比",
    defaultValue: 50,
  },
  size: {
    control: "select",
    label: "尺寸",
    description: "組件大小",
    options: ["sm", "md", "lg"],
    defaultValue: "md",
  },
  // 使用 mapping 將 select key 轉換為實際 object
  problem: {
    control: "select",
    label: "題目資料",
    description: "選擇 Mock 題目",
    options: Object.keys(mockProblems),  // ["twoSum", "addTwoNumbers", ...]
    mapping: mockProblems,               // { twoSum: Problem, ... }
    defaultValue: "twoSum",              // 預設選中的 key
  },
}
```

### mapping 使用說明

當 prop 是複雜物件（如 `Problem`、`Contest`）時，使用 `mapping` 將 select 的 key 轉換為實際物件：

- `options`: 顯示在下拉選單的 key 陣列
- `mapping`: key 到實際物件的對應表
- `defaultValue`: 預設選中的 key（不是物件）
- `defaultArgs.problem`: 預設的實際物件（用於初始渲染）

## Stories 數量與命名原則

### 精簡原則（重要！）

- **Playground 可涵蓋大部分情況**，避免建立冗餘的單一狀態 story
- 優先用「All States」或「All Ranges」整合展示多種狀態
- 總 stories 數量建議 **2~4 個**

### 標準 Story 結構

| Story 名稱                  | 用途                                    | 必要性  |
| --------------------------- | --------------------------------------- | ------- |
| **Playground**              | 使用 Controls 面板動態調整所有 props    | ✅ 必須 |
| **All States / All Ranges** | 一次展示所有狀態變化（含尺寸對比）      | ⭐ 建議 |
| **Edge Cases**              | 邊界情況（0、100、undefined、空陣列等） | 視需求  |
| **In Context**              | 實際使用場景範例                        | 視需求  |

### 不需要的 Stories

❌ 單獨的 `size="sm"` story（已在 Playground 可調整）  
❌ 單獨的 `High Rate` / `Low Rate` story（用 All Ranges 整合）  
❌ 與 Playground 重複的單一狀態展示

## Story 範例（精簡版）

### 簡單組件（2-3 stories）

```tsx
stories: [
  {
    name: "Playground",
    description: "使用右側 Controls 面板調整 Props",
    render: (args) => <MyBadge {...args} />,
  },
  {
    name: "All States",
    description: "所有狀態變化：綠色/藍色/紅色",
    render: () => (
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <MyBadge value={80} />
        <MyBadge value={50} />
        <MyBadge value={20} />
      </div>
    ),
  },
],
```

### 複雜組件（3-4 stories）

```tsx
stories: [
  {
    name: "Playground",
    description: "使用右側下拉選單切換不同 Mock 資料",
    render: (args) => <ProblemPreviewCard {...args} />,
  },
  {
    name: "All Difficulties",
    description: "Easy/Medium/Hard 三種難度",
    render: () => ( /* 展示三種難度 */ ),
  },
  {
    name: "Solved States",
    description: "已解決 vs 未解決",
    render: () => ( /* 展示兩種狀態 */ ),
  },
],
```

## Mock 資料管理

### 位置

`src/features/storybook/mocks/`

### 結構

```typescript
// problem.mock.ts
export const mockTags = { /* 預定義 tags */ };
export function createMockProblem(options) { /* factory */ }
export const mockProblems = {
  twoSum: createMockProblem({ ... }),
  addTwoNumbers: createMockProblem({ ... }),
  // ...
};
export const mockProblemList = [ /* 陣列 */ ];
```

### 使用方式

```tsx
import { mockProblems } from "@/features/storybook/mocks";

// 在 argTypes 中使用 mapping
argTypes: {
  problem: {
    control: "select",
    options: Object.keys(mockProblems),
    mapping: mockProblems,
  },
}
```

## Registry 註冊

### 註冊格式

```typescript
// registry/index.ts

// 1. Import
import MyComponentStories from "@/shared/ui/folder/MyComponent.stories";

// 2. Register
registerStory("shared/ui/folder/MyComponent", MyComponentStories);
```

### Category 對應

| category   | 目錄                                          | 說明                                                    |
| ---------- | --------------------------------------------- | ------------------------------------------------------- |
| `shared`   | `shared/ui/*`, `shared/ui/config/*`, `shared/ui/problem/*` | 共用 UI 組件                                            |
| `features` | `features/<domain>/components/*` | Feature 專用組件（按 domain 分類，如 problem、contest） |
| `layouts`  | `shared/layout/*`                | 版型組件                                                |

## Checklist（建立 Story 時確認）

- [ ] 檔案位於組件同目錄，命名為 `<Component>.stories.tsx`
- [ ] `meta.category` 正確設定
- [ ] `meta.argTypes` 涵蓋所有重要 props
- [ ] 第一個 story 是 **Playground**
- [ ] stories 數量精簡（2~4 個）
- [ ] 已在 `registry/index.ts` 註冊
- [ ] 若使用複雜資料，已建立對應 mock

## 現有 Stories 清單

### Shared UI

| 組件                  | 路徑             | Stories 數量 |
| --------------------- | ---------------- | ------------ |
| AcrBadge              | `shared/ui/tag/` | 3            |
| CategoryTag           | `shared/ui/tag/` | 3            |
| DifficultyBadge       | `shared/ui/tag/` | 2            |
| SubmissionStatusBadge + Icon | `shared/ui/tag/` | 2            |
| ContestStatusBadge    | `shared/ui/tag/` | 2            |
| ThemeSwitch           | `shared/ui/config/`  | 2            |
| LanguageSwitch        | `shared/ui/config/`  | 2            |
| ProblemPreview        | `shared/ui/problem/` | 2            |
| TestCaseEntry         | `shared/ui/testcase/` | 2            |
| TestCaseList          | `shared/ui/testcase/` | 3            |
| TestCaseDetail        | `shared/ui/testcase/` | 3            |
| TestResultEntry       | `shared/ui/submission/` | 2            |
| TestResultList        | `shared/ui/submission/` | 3            |
| TestResultDetail      | `shared/ui/submission/` | 3            |

### Features (按 domain 分類)

| Domain  | 組件               | 路徑                           | Stories 數量 |
| ------- | ------------------ | ------------------------------ | ------------ |
| problem | ProblemPreviewCard | `features/problem/components/` | 3            |
| contest | ContestPreviewCard | `features/contest/components/` | 3            |

## Core Entity 對應

| UI 元件              | Core Entity                    | 說明                     |
| -------------------- | ------------------------------ | ------------------------ |
| TestCaseEntry/List/Detail | `core/entities/testcase.entity.ts` | TestCaseData, TestCaseSource |
| TestResultEntry/List/Detail | `core/entities/submission.entity.ts` | TestResult, SubmissionStatus |
