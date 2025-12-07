📘 SKILL.md — QJudge Frontend UI Development Skill Guide (Carbon Design System Edition)

本文件為 AI Agent 專用技能參考文件。
在進行任何前端生成任務時，需完整遵守以下規範與技能要求。

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
