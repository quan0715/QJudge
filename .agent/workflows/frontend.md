---
description: QJudge 前端開發指南 - React + Carbon Design System 開發規範、組件使用與專案慣例
---

# QJudge Frontend Development Guide

本技能文件整合 Carbon Design System、React 最佳實踐，以及 QJudge 專案開發慣例。

## 適用情境

- 開發新的 React 組件或頁面
- 使用 Carbon Design System 設計 UI
- 實作表單與狀態管理
- 建立 Editor 類型的三欄式佈局
- 使用 Layer 實作正確的視覺層次

---

## Carbon Design System 核心概念

### 1. Grid 系統

使用 Carbon 的 16 欄位 Grid 系統進行佈局：

```tsx
import { Grid, Column } from "@carbon/react";

<Grid>
  <Column lg={16} md={8} sm={4}>
    {/* 全寬內容 */}
  </Column>
  <Column lg={8} md={4} sm={4}>
    {/* 半寬內容 */}
  </Column>
</Grid>
```

**斷點規則**：
| Prefix | 寬度 | 欄數 |
|--------|------|------|
| `sm` | 0-320px | 4 |
| `md` | 321-672px | 8 |
| `lg` | 673-1056px | 16 |
| `xlg` | 1057-1312px | 16 |
| `max` | 1313px+ | 16 |

### 2. Layer 組件

`Layer` 用於建立正確的視覺層次，特別是在 Fluid 表單中：

```tsx
import { Layer, TextInput } from "@carbon/react";

// Layer 會自動調整子組件的背景色
<Layer>
  <TextInput id="name" labelText="Name" />
</Layer>

// 嵌套 Layer 產生更深層次
<Layer>
  <Layer>
    <TextInput id="nested" labelText="Nested Field" />
  </Layer>
</Layer>
```

**層次對應**：
- Layer 0: `$layer-01` (白色背景)
- Layer 1: `$layer-02` (灰色背景)
- Layer 2: `$layer-03` (更深灰色)

### 3. SideNav Rail 模式

用於可折疊的側邊導航：

```tsx
import { SideNav, SideNavItems, SideNavLink, SideNavMenu, SideNavMenuItem } from "@carbon/react";
import { Settings, Document } from "@carbon/icons-react";

<SideNav
  isRail
  expanded={!collapsed}
  isChildOfHeader={false}
  aria-label="Side navigation"
>
  <SideNavItems>
    <SideNavLink renderIcon={Settings} href="#" isActive={activeId === "settings"}>
      設定
    </SideNavLink>
    <SideNavMenu renderIcon={Document} title="文件" defaultExpanded>
      <SideNavMenuItem href="#" isActive={activeId === "doc1"}>
        文件 1
      </SideNavMenuItem>
    </SideNavMenu>
  </SideNavItems>
</SideNav>
```

**SideNav 尺寸**：
- 收合 (Rail): `48px`
- 展開: `256px`

### 4. Tabs 組件

使用 Contained Tabs 進行區塊導航：

```tsx
import { Tabs, TabList, Tab, TabPanels, TabPanel, Layer } from "@carbon/react";
import { Information, Document } from "@carbon/icons-react";

const TABS = [
  { id: "info", title: "資訊", icon: Information },
  { id: "content", title: "內容", icon: Document },
];

<Tabs selectedIndex={selectedIndex} onChange={handleTabChange}>
  <TabList aria-label="Form sections" contained>
    {TABS.map((tab) => (
      <Tab key={tab.id} renderIcon={tab.icon}>
        {tab.title}
      </Tab>
    ))}
  </TabList>
  <TabPanels>
    {TABS.map((tab) => (
      <TabPanel key={tab.id}>
        <Layer className="tab-content">
          {/* Tab 內容 */}
        </Layer>
      </TabPanel>
    ))}
  </TabPanels>
</Tabs>
```

---

## QJudge 專案架構

### 目錄結構

```
src/
├── core/                 # 核心配置與實體
│   ├── config/          # 應用程式配置
│   └── entities/        # 領域實體型別
├── domains/             # 領域驅動的功能模組
│   ├── problem/         # 題目相關
│   ├── contest/         # 競賽相關
│   ├── lab/             # Lab 相關
│   └── teacher/         # 教師管理
├── hooks/               # 通用 React Hooks
├── services/            # API 服務層
├── ui/                  # 共用 UI 組件
│   ├── components/      # 通用組件
│   ├── layout/          # 佈局組件
│   └── theme/           # 主題設定
└── styles/              # 全域樣式
```

### Entity vs Model 分離

```typescript
// core/entities/problem.entity.ts - 前端使用的實體
export interface ProblemDetail {
  id: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  // ... 其他欄位
}

// models/problem.ts - API 回應的原始格式
export interface ProblemAPIResponse {
  id: number;
  title: string;
  difficulty: string;
  // ... snake_case 欄位
}
```

---

## 表單開發模式

### 1. react-hook-form + FormProvider

使用 react-hook-form 管理表單狀態，透過 FormProvider 提供 context：

```tsx
import { useForm, FormProvider, useFormContext } from "react-hook-form";

// 表單 Schema
interface FormSchema {
  title: string;
  description: string;
}

// 父組件
const MyForm: React.FC = () => {
  const methods = useForm<FormSchema>({
    defaultValues: {
      title: "",
      description: "",
    },
  });

  const handleSubmit = methods.handleSubmit((data) => {
    console.log("Submit:", data);
  });

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit}>
        <TitleSection />
        <DescriptionSection />
        <button type="submit">儲存</button>
      </form>
    </FormProvider>
  );
};

// 子組件透過 useFormContext 存取
const TitleSection: React.FC = () => {
  const { register, formState: { errors } } = useFormContext<FormSchema>();

  return (
    <TextInput
      id="title"
      labelText="標題"
      {...register("title", { required: "標題為必填" })}
      invalid={!!errors.title}
      invalidText={errors.title?.message}
    />
  );
};
```

### 2. 表單區塊組件

將表單拆分為可重用的區塊：

```tsx
// ProblemForm/sections/BasicInfoSection.tsx
import { useFormContext } from "react-hook-form";
import { Grid, Column, Layer, TextInput, Dropdown } from "@carbon/react";

const BasicInfoSection: React.FC = () => {
  const { register, setValue, watch } = useFormContext();

  return (
    <Layer>
      <Grid>
        <Column lg={16}>
          <h5>基本資訊</h5>
          <p className="helper-text">設定題目的基本屬性</p>
        </Column>
        <Column lg={8}>
          <TextInput
            id="title"
            labelText="標題"
            {...register("title")}
          />
        </Column>
        <Column lg={8}>
          <Dropdown
            id="difficulty"
            titleText="難度"
            items={["easy", "medium", "hard"]}
            selectedItem={watch("difficulty")}
            onChange={({ selectedItem }) => setValue("difficulty", selectedItem)}
          />
        </Column>
      </Grid>
    </Layer>
  );
};
```

---

## 三欄式 Editor 佈局

QJudge 使用 `EditorLayout` 組件建立 Lab/Problem Editor：

### EditorLayout 使用方式

```tsx
import EditorLayout from "@/ui/components/editor/EditorLayout";
import EditorNavbar from "@/ui/components/editor/EditorNavbar";

const LabEditorPage: React.FC = () => {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  return (
    <div className="lab-editor">
      <EditorNavbar
        title="Lab 標題"
        backTo="/teacher?tab=labs"
        leftCollapsed={leftCollapsed}
        onToggleLeft={() => setLeftCollapsed(prev => !prev)}
        rightCollapsed={rightCollapsed}
        onToggleRight={() => setRightCollapsed(prev => !prev)}
        onSave={handleSave}
      />

      <EditorLayout
        leftPanel={<SideNavigation />}
        centerPanel={<Layer><FormContent /></Layer>}
        rightPanel={<PreviewPanel />}
        leftCollapsed={leftCollapsed}
        rightCollapsed={rightCollapsed}
      />
    </div>
  );
};
```

### 佈局特性

- **左側面板**: Carbon SideNav Rail，48px/256px 切換
- **中央面板**: 主要編輯區域，使用 Layer 包裹
- **右側面板**: 預覽區域，可折疊
- **中央+右側**: 使用 react-resizable-panels 實現調整大小

---

## 狀態管理指南

### 選擇標準

| 類型 | 場景 | 方案 |
|------|------|------|
| **Local State** | 組件 UI 狀態 | useState, useReducer |
| **URL State** | 路由參數、Tab 選擇 | useSearchParams |
| **Form State** | 表單值、驗證 | react-hook-form |
| **Server State** | API 資料、快取 | React Query |
| **Global State** | 跨組件共享 | Zustand |

```
Small app, simple state → Zustand or Jotai
Large app, complex state → Redux Toolkit
Heavy server interaction → React Query + light client state
Atomic/granular updates → Jotai
```

### URL State 管理

使用 `useSearchParams` 管理 URL 狀態：

```tsx
const [searchParams, setSearchParams] = useSearchParams();

// 讀取狀態
const selectedTab = searchParams.get("tab") || "basic-info";
const selectedProblemId = searchParams.get("problem") || null;

// 更新狀態
const setSelectedTab = useCallback((tab: string) => {
  setSearchParams(prev => {
    const next = new URLSearchParams(prev);
    next.set("tab", tab);
    return next;
  });
}, [setSearchParams]);
```

### Zustand (推薦用於 Client State)

```typescript
// store/useStore.ts
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

interface AppState {
  user: User | null
  theme: 'light' | 'dark'
  setUser: (user: User | null) => void
  toggleTheme: () => void
}

export const useStore = create<AppState>()(
  devtools(
    persist(
      (set) => ({
        user: null,
        theme: 'light',
        setUser: (user) => set({ user }),
        toggleTheme: () => set((state) => ({
          theme: state.theme === 'light' ? 'dark' : 'light'
        })),
      }),
      { name: 'app-storage' }
    )
  )
)

// 使用方式
function Header() {
  const { user, theme, toggleTheme } = useStore()
  return (
    <header className={theme}>
      {user?.name}
      <button onClick={toggleTheme}>Toggle Theme</button>
    </header>
  )
}
```

### Zustand with Slices (可擴展模式)

```typescript
// store/slices/createUserSlice.ts
import { StateCreator } from 'zustand'

export interface UserSlice {
  user: User | null
  isAuthenticated: boolean
  login: (credentials: Credentials) => Promise<void>
  logout: () => void
}

export const createUserSlice: StateCreator<
  UserSlice & CartSlice,
  [],
  [],
  UserSlice
> = (set, get) => ({
  user: null,
  isAuthenticated: false,
  login: async (credentials) => {
    const user = await authApi.login(credentials)
    set({ user, isAuthenticated: true })
  },
  logout: () => {
    set({ user: null, isAuthenticated: false })
  },
})

// store/index.ts
import { create } from 'zustand'
import { createUserSlice, UserSlice } from './slices/createUserSlice'
import { createCartSlice, CartSlice } from './slices/createCartSlice'

type StoreState = UserSlice & CartSlice

export const useStore = create<StoreState>()((...args) => ({
  ...createUserSlice(...args),
  ...createCartSlice(...args),
}))

// Selective subscriptions (防止不必要的 re-render)
export const useUser = () => useStore((state) => state.user)
export const useCart = () => useStore((state) => state.cart)
```

### React Query (Server State 管理)

```typescript
// hooks/useProblems.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// Query keys factory
export const problemKeys = {
  all: ['problems'] as const,
  lists: () => [...problemKeys.all, 'list'] as const,
  list: (filters: ProblemFilters) => [...problemKeys.lists(), filters] as const,
  details: () => [...problemKeys.all, 'detail'] as const,
  detail: (id: string) => [...problemKeys.details(), id] as const,
}

// Fetch hook
export function useProblems(filters: ProblemFilters) {
  return useQuery({
    queryKey: problemKeys.list(filters),
    queryFn: () => fetchProblems(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  })
}

// Single item hook
export function useProblem(id: string) {
  return useQuery({
    queryKey: problemKeys.detail(id),
    queryFn: () => getProblem(id),
    enabled: !!id, // Don't fetch if no id
  })
}

// Mutation with optimistic update
export function useUpdateProblem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateProblem,
    onMutate: async (newProblem) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: problemKeys.detail(newProblem.id) })

      // Snapshot previous value
      const previousProblem = queryClient.getQueryData(problemKeys.detail(newProblem.id))

      // Optimistically update
      queryClient.setQueryData(problemKeys.detail(newProblem.id), newProblem)

      return { previousProblem }
    },
    onError: (err, newProblem, context) => {
      // Rollback on error
      queryClient.setQueryData(
        problemKeys.detail(newProblem.id),
        context?.previousProblem
      )
    },
    onSettled: (data, error, variables) => {
      // Refetch after mutation
      queryClient.invalidateQueries({ queryKey: problemKeys.detail(variables.id) })
    },
  })
}
```

### 結合 Client + Server State

```typescript
// Zustand for UI state
const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  modal: null,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: null }),
}))

// React Query for server state
function Dashboard() {
  const { sidebarOpen, toggleSidebar } = useUIStore()
  const { data: problems, isLoading } = useProblems({ active: true })
  const { data: stats } = useStats()

  if (isLoading) return <DashboardSkeleton />

  return (
    <div className={sidebarOpen ? 'with-sidebar' : ''}>
      <Sidebar open={sidebarOpen} onToggle={toggleSidebar} />
      <main>
        <StatsCards stats={stats} />
        <ProblemTable problems={problems} />
      </main>
    </div>
  )
}
```

### 狀態管理最佳實踐

**Do's ✓**
- **Colocate state** - 狀態盡量放在使用它的地方
- **Use selectors** - 使用選擇器防止不必要的 re-render
- **Normalize data** - 扁平化巢狀結構便於更新
- **Type everything** - 完整的 TypeScript 覆蓋
- **Separate concerns** - Server state (React Query) vs Client state (Zustand)

**Don'ts ✗**
- **Don't over-globalize** - 不是所有狀態都需要全域
- **Don't duplicate server state** - 讓 React Query 管理
- **Don't mutate directly** - 使用 immutable 更新
- **Don't store derived data** - 計算它而不是儲存
- **Don't mix paradigms** - 每個類別選擇一個主要方案

---

## Carbon Icons 使用

從 `@carbon/icons-react` 導入圖示：

```tsx
import {
  Add,
  TrashCan,
  Settings,
  Document,
  DocumentAdd,
  Save,
  Upload,
  Information,
  Code,
  WarningAlt,
  DataCheck,
} from "@carbon/icons-react";

// 在 Button 中使用
<Button renderIcon={Add} size="sm">
  新增
</Button>

// 在 SideNavLink 中使用
<SideNavLink renderIcon={Settings}>
  設定
</SideNavLink>

// 在 Tab 中使用
<Tab renderIcon={Information}>
  資訊
</Tab>
```

---

## SCSS 最佳實踐

### 使用 Carbon 變數

```scss
// 使用 Carbon 設計 Token
.my-component {
  background-color: var(--cds-layer-01);
  color: var(--cds-text-primary);
  padding: var(--cds-spacing-05);
  border: 1px solid var(--cds-border-subtle);
}

// 常用變數
// --cds-layer-01, --cds-layer-02, --cds-layer-03
// --cds-text-primary, --cds-text-secondary, --cds-text-helper
// --cds-border-subtle, --cds-border-strong
// --cds-spacing-01 到 --cds-spacing-13
```

### BEM 命名規範

```scss
.problem-form-v2 {
  // Block
  &__header {
    // Element
    display: flex;
    justify-content: space-between;
  }

  &__title {
    margin: 0;
  }

  &__tabs-container {
    flex: 1;
    overflow: hidden;
  }

  &__footer {
    display: flex;
    padding: var(--cds-spacing-05);
    border-top: 1px solid var(--cds-border-subtle);

    &-left {
      flex: 1;
    }

    &-right {
      display: flex;
      gap: var(--cds-spacing-03);
    }
  }
}
```

---

## 常用元件組合

### ContainerCard 區塊

用於包裹表單區塊：

```tsx
import ContainerCard from "@/ui/components/layout/ContainerCard";

<ContainerCard title="基本資訊">
  <TextInput id="title" labelText="標題" />
  <TextArea id="description" labelText="描述" />
</ContainerCard>
```

### DataTable 資料表格

```tsx
import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Tag,
  Button,
} from "@carbon/react";

<DataTable
  rows={dataRows}
  headers={[
    { key: "title", header: "標題" },
    { key: "difficulty", header: "難度" },
    { key: "actions", header: "操作" },
  ]}
>
  {({ rows, headers, getHeaderProps, getRowProps, getTableProps }) => (
    <TableContainer title="題目列表">
      <TableToolbar>
        <TableToolbarContent>
          <TableToolbarSearch onChange={handleSearch} />
          <Button renderIcon={Add} size="sm">新增</Button>
        </TableToolbarContent>
      </TableToolbar>
      <Table {...getTableProps()} size="sm">
        <TableHead>
          <TableRow>
            {headers.map((header) => (
              <TableHeader {...getHeaderProps({ header })} key={header.key}>
                {header.header}
              </TableHeader>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow {...getRowProps({ row })} key={row.id}>
              {row.cells.map((cell) => (
                <TableCell key={cell.id}>{cell.value}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )}
</DataTable>
```

---

## 參考資源

- [Carbon Design System](https://carbondesignsystem.com)
- [Carbon React Tutorial](https://carbondesignsystem.com/developing/react-tutorial/overview/)
- [Carbon Components React GitHub](https://github.com/carbon-design-system/carbon/tree/main/packages/react)
- [React Hook Form](https://react-hook-form.com/)
- [TanStack Query](https://tanstack.com/query)
- [Zustand](https://github.com/pmndrs/zustand)
