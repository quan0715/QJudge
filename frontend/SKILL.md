📘 SKILL.md — QJudge Frontend UI Development Skill Guide (Carbon Design System Edition)

本文件為 AI Agent 專用技能參考文件。
在進行任何前端生成任務時，需完整遵守以下規範與技能要求。

---

## 🏗️ 0. Frontend Architecture (QJudge 2.0)

本專案採用 **Domain-Driven, Component-Based Architecture**，遵循 **Clean Architecture** 原則。

### 📁 Folder Structure

```
src/
  app/                      # Application Bootstrap & Configuration
    router.tsx              # Main Router Definition
    providers.tsx           # Global Providers (Theme, Auth, QueryClient)
    App.tsx                 # Root Component
    main.tsx                # Entry Point
  
  core/                     # Domain Layer (Enterprise Business Rules)
    entities/               # TypeScript Interfaces/Types (e.g., Problem, Contest)
      mappers/              # DTO <-> Entity Mappers
    config/                 # Environment & Constants
    errors/                 # Custom Error Classes
  
  services/                 # Infrastructure Layer (External Interfaces)
    api/                    # Axios instances & Interceptors (httpClient.ts)
    auth/                   # Auth Service (index.ts)
    contest/                # Contest Domain API (index.ts)
    problem/                # Problem Domain API (index.ts)
    submission/             # Submission Domain API (index.ts)
  
  ui/                       # Shared Presentation Layer (Dumb Components)
    components/             # Reusable Atomic UI (Buttons, Cards, Inputs)
    layout/                 # UI Structures (PageHeader, Shell, Grid Wrappers)
    carbon/                 # Carbon Overrides & Wrappers
    theme/                  # Token Definitions, Theme Context
    hooks/                  # Shared UI Hooks (useTheme, useMediaQuery)
    styles/                 # Global SCSS/CSS Mixins
  
  domains/                  # Features organized by Business Domain
    contest/
      pages/                # Route Components (ContestList, ContestDetail)
        admin/              # Admin-specific pages (Settings, Participants)
      components/           # Domain-Specific UI (ContestCard, Scoreboard)
        layout/             # Domain-specific layout (ContestHero, ContestTabs)
      hooks/                # Business Logic Hooks (useContestTimer)
      utils/                # Domain Helpers
    problem/
      pages/                
      components/           # (ProblemSolver, CodeEditor, Terminal)
      hooks/                
      utils/                
    submission/
      pages/
      components/           # (SubmissionStatus, DiffViewer)
      hooks/
    auth/                   # Login, Profile, 2FA
    common/                 # Cross-domain shared business logic (rare)
  
  utils/                    # Pure Technical Utilities (date, string, validation)
  hooks/                    # Shared React Hooks
```

### 🔄 Clean Architecture Mapping

| Layer | Folder | Responsibility | Dependencies |
|-------|--------|----------------|--------------|
| Domain Layer | `src/core/entities` | Enterprise Business Rules & Types | None (Pure TS) |
| Application Layer | `src/domains/*/hooks` | Business Use Cases (View Logic) | Domain Layer, Services |
| Presentation Layer | `src/domains/*/pages`, `src/ui/*` | UI & Interaction | Application Layer, Carbon |
| Infrastructure Layer | `src/services/` | API / Storage / Hardware | Config, 3rd Party Libs |

### ⚠️ Architecture Rules (STRICT)

1. **Dependency Flow**: `Presentation -> Application -> Domain`
   - ❌ Forbidden: `core/entities` importing from `ui/`

2. **Domain Isolation**:
   - `domains/problem` should NOT import from `domains/contest`
   - If shared logic needed → move to `domains/common` or `core`

3. **No Logic in Pages**:
   - Pages only compose components and fetch data (via hooks)
   - Complex logic goes into `hooks/` or `components/`

4. **Carbon First**:
   - All UI elements must use Carbon components or wrappers in `ui/`
   - No raw CSS for standard elements (Buttons, Inputs)

5. **Layout Consistency**:
   - All pages must use `ui/layout/` wrappers
   - PageHeader → Tabs → Content flow must be preserved

6. **Service Layer Rules**:
   - API Surface: Only use `index.ts` for public exports
   - Pure Data: Never import React inside services
   - No UI: No toast, modal in services
   - Centralized HTTP: Always use `@/services/api/httpClient`
   - Typed: All requests/responses use types from `core/entities`

---

🎨 1. Carbon Design System Overview（核心原則）

在開發 QJudge 前端 UI（ProblemSolver、ContestLayout 等）時，所有視覺、排版、色彩、元件、交互行為必須遵循 IBM Carbon Design System。

Carbon 的核心包含：

Theme（Light / Dark）

Color Tokens

Layering（Layer 0,1,2,3）

Grid（12-column layout）

Spacing Tokens

Typography Tokens

Accessible Components（React-based）

AI 完成 UI 生成時，不得產生自定義顏色、Magic Numbers、破壞 Carbon Token 的排版。

🌞🌙 2. Theme & Color（最重要）

Carbon 使用 token 驅動色彩，而不是 hard-coded hex。

✔ Light Theme（Default）

背景必須使用：

$background: $white;      #ffffff  
$layer-01: $layer (gray-10)  
$text-primary: $gray-100  
$text-secondary: $gray-70

✔ Dark Theme（Gray 90）

背景必須使用：

$background: $gray-90;    #262626
$layer-01: $gray-80  
$text-primary: $gray-10  
$divider: $gray-70

🚫 禁止

不可使用 #fff、#000 直接定義顏色

不可使用自製 palette，必須使用 Carbon Tokens

不可在 dark mode 使用白色卡片背景（會造成視覺錯誤）

🧱 3. Layout Structure（整頁排版規則）

所有具有「頁面級」層級的 UI 必須符合 Carbon PageHeader 與 Grid pattern。

✔ Full-width sections（Hero, Tabs, Content Background）

外層 Section 不可有任何左右 padding

外層必須寬度 100%

✔ Max-width Container（內容本體）

Section 內部內容必須置中：

max-width: 1200px;
margin: 0 auto;
padding: 0 24px; // spacing-05（可依需求調整）

✔ Section stacking（重要）

Section 與 Section 之間 不能有額外 margin / padding 間距：

[Hero]
[Tabs] ← 貼緊 hero 底下（只有底線分隔）
[Content Card]

🧭 4. PageHeader Pattern（ProblemSolver / ContestLayout 必須使用）

Carbon 建議頁面結構：

<PageHeader>
  Breadcrumbs (optional)
  Title (H1)
  Metadata (Difficulty, Limits)
  Right Actions (Submit, Language Switch)
</PageHeader>

<Tabs>

<PageContent>


AI 在生成頁面碼時，需符合以下：

H1 使用 Productive Heading 05 token

Metadata 使用 Label 01

Tabs 使用 Carbon Tabs（不要自行寫）

Right Action Buttons 使用 Carbon Button 組件

📐 5. Carbon Grid 使用規範

不可自行寫 display: flex; margin-left: 100px; 來手動排版主內容。

使用：

<Content>
  <Grid>
    <Row>
      <Column lg={12}> ...content... </Column>
    </Row>
  </Grid>
</Content>


用途：

控制頁面最大寬度

自動符合 Carbon spacing / gutter

讓不同主題 layout 一致

🔠 6. Typography 規範

使用 Carbon tokens：

Token	用途
$productive-heading-05	頁面標題 H1
$heading-03	卡片標題
$label-01	Metadata（Time Limit / Difficulty）
$body-long-01	內文描述

不可自行使用 font-size: 22px 之類的魔法值。

🖱 7. Components 規則（AI 必須遵守）

QJudge 必須盡可能重用 Carbon React Components，包括：

Tabs

Button（primary / secondary）

Dropdown（語言切換）

Grid

Layered Panels

Inline Notifications

Structured Lists (if needed)

Modal (confirm submit)

Skeleton states

🚫 AI 不得：

自製 Tabs

自製 Button

自製卡片樣式

自行定義顏色與邊框

🔎 8. Layer（視覺層級）

Carbon 定義 Layering：

Layer	用途
Layer 0	Page Background（white or gray-90）
Layer 1	Card 背景（white-100 or gray-80）
Layer 2	Dropdown、Popover
Layer 3	Modal

ProblemSolver / ContestLayout 主要用 Layer 0 + Layer 1。

🧩 9. QJudge 專案特化規範（AI 必須遵守）

以下為你 OJ 系統特別重要的技能：

✔ 9.1 ProblemSolver 結構
<ProblemHero />   // PageHeader
<ProblemTabs />
<TabPanel>

✔ 9.2 LocalStorage Persistence

AI 必須實作：

code persistence

custom test cases persistence

keys 必須含 problemId

✔ 9.3 UITestCase 型別（標準定義）

AI 必須使用：

interface UITestCase {
  id: string;
  source: 'public' | 'custom';
  input: string;
  expectedOutput?: string | null;
  enabled: boolean;
}

✔ 9.4 Run Test payload

AI 必須送：

{
  "is_test": true,
  "custom_test_cases": [
    { "input": "", "expected_output": "" }
  ]
}

✔ 9.5 不可污染 Statistics / Submission History

AI 必須確保：

is_test = true 的 submissions 不算進 AC 率

不影響排行榜

不會被錯誤顯示在 History（除非特意設定）

⚠ 10. 常見錯誤（AI 必須避免）

AI 在產生 UI 程式碼時不得：

❌ 使用 #fff 或 #000

❌ 手動寫 Tabs UI

❌ 手寫 spacing magic number

❌ 在 dark mode 使用 white 背景 card

❌ 使用 padding: 24px 100px 這種非 Carbon spacing pattern

❌ 自定義 color system

❌ 忽略 Grid 導致 layout 不對齊

若遇到 UI 需求，AI 應優先：

✔ 查 Carbon component

✔ 查 Carbon token

✔ 查 Carbon grid

✔ 使用 max-width wrapper

✔ 使用 Layer token

🏁 11. AI Code Generation Checklist

在生成任何 UI 相關程式碼前，AI 必須自我檢查：

✔ 是否使用 Carbon components？
✔ 是否使用 Carbon Grid？
✔ 是否正確使用 color tokens？
✔ Light theme 背景 = White？
✔ Dark theme 背景 = Gray 90？
✔ Section 之間是否無多餘 padding？
✔ Content 是否在 max-width container 中？
✔ 是否避免 magic numbers？
✔ UITestCase 型別是否一致？
✔ LocalStorage key 是否含 problemId？
✔ Run Test payload 是否符合規範？

AI 需全部通過後才可輸出程式碼。

---

## 📋 12. Key UI Components Reference

### 12.1 Layout Components (`ui/layout/`)

| Component | Purpose | Usage |
|-----------|---------|-------|
| `PageHeader` | Standard page header with title, subtitle, actions | All pages |
| `SurfaceSection` | Full-width section with max-width content | Page content areas |
| `ContainerCard` | Card with optional title and action | Data display |
| `StickyTabs` | Sticky navigation tabs | Domain navigation |

### 12.2 Domain Components Pattern

```tsx
// domains/contest/components/ContestProblemList.tsx
// ✅ Good: Uses shared UI components + domain-specific logic
import { ContainerCard } from '@/ui/components/layout/ContainerCard';
import { SurfaceSection } from '@/ui/components/layout/SurfaceSection';
import ProblemTable from '@/domains/problem/components/ProblemTable';

// ❌ Bad: Importing from another domain directly
import { ContestCard } from '@/domains/contest/components/ContestCard'; // in problem domain
```

### 12.3 Service Layer Pattern

```tsx
// services/contest/index.ts
// ✅ Good: Pure data fetching, typed responses
import { httpClient } from '@/services/api/httpClient';
import type { ContestDetail } from '@/core/entities/contest.entity';

export const getContest = async (id: string): Promise<ContestDetail> => {
  const response = await httpClient.get(`/contests/${id}/`);
  return response.data;
};

// ❌ Bad: UI logic in services
import { toast } from 'react-hot-toast'; // Never in services!
```

---

## 🔧 13. Development Patterns

### 13.1 Permission-Based UI

```tsx
// ✅ Pattern: Check permissions from entity
const canManage = contest.permissions?.canViewAllSubmissions || isAdminOrTeacher;

// Show admin actions conditionally
<ContainerCard 
  action={canManage ? <AdminActions /> : undefined}
>
```

### 13.2 Entity Mapping

```tsx
// core/entities/mappers/contestMapper.ts
// Always map DTO (snake_case) to Entity (camelCase)
export const mapContestDetailDto = (dto: any): ContestDetail => ({
  id: dto.id,
  hasStarted: dto.has_started,
  hasFinishedExam: dto.has_finished_exam,
  // ...
});
```

### 13.3 Component Props Interface

```tsx
// ✅ Good: Clear, typed props
interface ContestProblemListProps {
  contest: ContestDetail;
  problems: ContestProblemSummary[];
  myRank: ScoreboardRow | null;
  currentUser: any;
  maxWidth?: string;
  onReload?: () => void;
}
```
