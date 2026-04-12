# MCP 協作 Section 實現計劃

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 landing page 的 BentoFeaturesSection 之後新增 MCPCollaborationSection，展示 QJudge 與外部 AI 工具的無縫協作。

**Architecture:** 
新增一個獨立的 section 組件，展示教師如何在 Claude、ChatGPT、Google Gemini、Notion 中使用 QJudge 的功能。Section 包含：標題區、Logo 區、功能說明區、兩個並排的示例 block（快速出題 + 自動批改評論）。所有文案從 landingContent 中獲取，支援多語言。

**Tech Stack:** React + TypeScript、SCSS、i18next、Carbon UI

---

## 文件結構

**創建：**
- `frontend/src/features/landing/sections/MCPCollaborationSection.tsx` — 主組件
- `frontend/src/features/landing/sections/MCPCollaborationSection.scss` — 樣式

**修改：**
- `frontend/src/features/landing/content/landingContent.ts` — 添加 MCPCollaborationContent 類型和數據
- `frontend/src/features/landing/screens/LandingScreen.tsx` — 導入並使用 MCPCollaborationSection
- `frontend/src/i18n/locales/zh-TW/common.json` — 添加繁體中文翻譯
- `frontend/src/i18n/locales/en/common.json` — 添加英文翻譯

---

## 實現任務

### Task 1: 添加翻譯文案

**Files:**
- Modify: `frontend/src/i18n/locales/zh-TW/common.json`
- Modify: `frontend/src/i18n/locales/en/common.json`

- [ ] **Step 1: 在繁體中文翻譯中添加 MCP section 文案**

在 `frontend/src/i18n/locales/zh-TW/common.json` 的 landing 部分添加：

```json
"mcp": {
  "eyebrow": "無痛協作",
  "title": "與現有 AI 工具無痛協作",
  "description": "直接在 Claude、ChatGPT、Google Gemini、Notion 中建立、批改、評論",
  "features": {
    "0": "快速生成競賽題目",
    "1": "自動批改學生作答",
    "2": "提供個性化評論"
  },
  "features_description": {
    "0": "與 AI 協商題目需求，直接建立到 QJudge",
    "1": "取得批改結果和統計數據",
    "2": "AI 分析常見錯誤並給改進建議"
  },
  "examples": {
    "0": {
      "title": "快速生成題目",
      "description": "教師在 Claude 中與 AI 協商題目需求，Claude 直接在 QJudge 中建立題目",
      "userMessage": "幫我設計一套 C++ 迴圈的競賽題目",
      "aiMessage": "我為你設計了 3 道題目。已直接建立到你的 QJudge 題庫。",
      "feedback": "✓ 已建立"
    },
    "1": {
      "title": "自動批改評論",
      "description": "教師在 Claude 中請求批改結果，Claude 自動從 QJudge 取得批改數據並提供分析",
      "userMessage": "請協助批改第三題",
      "aiMessage": "第三題通過率 45%。常見問題是邊界條件處理不當。我提供了改進建議。",
      "stats": "通過率 45%"
    }
  },
  "tools": {
    "claude": "Claude",
    "chatgpt": "ChatGPT",
    "gemini": "Google Gemini",
    "notion": "Notion"
  }
}
```

- [ ] **Step 2: 在英文翻譯中添加 MCP section 文案**

在 `frontend/src/i18n/locales/en/common.json` 的 landing 部分添加：

```json
"mcp": {
  "eyebrow": "Seamless Collaboration",
  "title": "Collaborate Seamlessly with Your Favorite AI Tools",
  "description": "Create, grade, and review directly in Claude, ChatGPT, Google Gemini, and Notion",
  "features": {
    "0": "Generate competition problems quickly",
    "1": "Automatically grade student submissions",
    "2": "Provide personalized feedback"
  },
  "features_description": {
    "0": "Brainstorm with AI and create problems directly in QJudge",
    "1": "Get grading results and statistics automatically",
    "2": "AI analyzes common errors and suggests improvements"
  },
  "examples": {
    "0": {
      "title": "Quick Problem Generation",
      "description": "Teachers brainstorm with AI in Claude, and problems are created directly in QJudge",
      "userMessage": "Design a set of C++ loop competition problems",
      "aiMessage": "I've designed 3 problems for you. Created directly in your QJudge library.",
      "feedback": "✓ Created"
    },
    "1": {
      "title": "Automatic Grading & Review",
      "description": "Teachers request grading results in Claude, AI fetches data and provides analysis",
      "userMessage": "Help me grade problem 3",
      "aiMessage": "Problem 3 has a 45% pass rate. Common issue: improper boundary handling. I've provided improvement suggestions.",
      "stats": "Pass rate 45%"
    }
  },
  "tools": {
    "claude": "Claude",
    "chatgpt": "ChatGPT",
    "gemini": "Google Gemini",
    "notion": "Notion"
  }
}
```

- [ ] **Step 3: 驗證翻譯檔案有效性**

Run: `cd /Users/quan/online_judge/frontend && npm run check:i18n`

Expected: 無語言鍵不匹配的警告

- [ ] **Step 4: Commit 翻譯**

```bash
cd /Users/quan/online_judge
git add frontend/src/i18n/locales/zh-TW/common.json frontend/src/i18n/locales/en/common.json
git commit -m "feat(landing): add MCP collaboration section translations"
```

---

### Task 2: 更新 landingContent.ts

**Files:**
- Modify: `frontend/src/features/landing/content/landingContent.ts`

- [ ] **Step 1: 在 landingContent.ts 中添加 MCPCollaborationContent 接口**

在文件頂部添加新接口（在 LandingContent 接口之前）：

```typescript
export interface MCPCollaborationExample {
  title: string;
  description: string;
  userMessage: string;
  aiMessage: string;
  feedback?: string;
  stats?: string;
}

export interface MCPCollaborationContent {
  eyebrow: string;
  title: string;
  description: string;
  features: string[];
  featuresDescription: string[];
  examples: [MCPCollaborationExample, MCPCollaborationExample];
  tools: {
    claude: string;
    chatgpt: string;
    gemini: string;
    notion: string;
  };
}
```

- [ ] **Step 2: 在 LandingContent 接口中添加 mcp 屬性**

找到 `export interface LandingContent {` 部分，在 `footer` 屬性之前添加：

```typescript
mcp: MCPCollaborationContent;
```

- [ ] **Step 3: 在 getLandingContent 函數中添加 mcp 數據**

在 `getLandingContent` 函數的返回對象中，在 `pricing` 屬性之前添加：

```typescript
mcp: {
  eyebrow: t("mcp.eyebrow"),
  title: t("mcp.title"),
  description: t("mcp.description"),
  features: [
    t("mcp.features.0"),
    t("mcp.features.1"),
    t("mcp.features.2"),
  ],
  featuresDescription: [
    t("mcp.features_description.0"),
    t("mcp.features_description.1"),
    t("mcp.features_description.2"),
  ],
  examples: [
    {
      title: t("mcp.examples.0.title"),
      description: t("mcp.examples.0.description"),
      userMessage: t("mcp.examples.0.userMessage"),
      aiMessage: t("mcp.examples.0.aiMessage"),
      feedback: t("mcp.examples.0.feedback"),
    },
    {
      title: t("mcp.examples.1.title"),
      description: t("mcp.examples.1.description"),
      userMessage: t("mcp.examples.1.userMessage"),
      aiMessage: t("mcp.examples.1.aiMessage"),
      stats: t("mcp.examples.1.stats"),
    },
  ],
  tools: {
    claude: t("mcp.tools.claude"),
    chatgpt: t("mcp.tools.chatgpt"),
    gemini: t("mcp.tools.gemini"),
    notion: t("mcp.tools.notion"),
  },
},
```

- [ ] **Step 4: 驗證類型檢查**

Run: `cd /Users/quan/online_judge/frontend && npm run type-check`

Expected: 無類型錯誤

- [ ] **Step 5: Commit**

```bash
cd /Users/quan/online_judge
git add frontend/src/features/landing/content/landingContent.ts
git commit -m "feat(landing): add MCPCollaborationContent type and data"
```

---

### Task 3: 創建 MCPCollaborationSection 組件

**Files:**
- Create: `frontend/src/features/landing/sections/MCPCollaborationSection.tsx`

- [ ] **Step 1: 創建組件框架**

Create file `frontend/src/features/landing/sections/MCPCollaborationSection.tsx` with:

```typescript
import type { FC } from "react";
import { Tile } from "@carbon/react";
import SectionHeading from "@/features/landing/components/SectionHeading";
import type { MCPCollaborationContent } from "@/features/landing/content/landingContent";
import "./MCPCollaborationSection.scss";

interface MCPCollaborationSectionProps {
  content: MCPCollaborationContent;
}

const MCPCollaborationSection: FC<MCPCollaborationSectionProps> = ({ content }) => {
  return (
    <section id="landing-mcp" className="landing-mcp-section landing-section" data-testid="landing-section-mcp">
      <div className="landing-section__inner">
        {/* Section Heading */}
        <SectionHeading 
          eyebrow={content.eyebrow} 
          title={content.title} 
          description={content.description} 
          align="center" 
        />

        {/* Tools Logo Row */}
        <div className="landing-mcp-section__tools">
          <span className="landing-mcp-section__tools-label">支援的應用</span>
          <div className="landing-mcp-section__tools-logos">
            <div className="landing-mcp-section__tool-logo">{content.tools.claude}</div>
            <div className="landing-mcp-section__tool-logo">{content.tools.chatgpt}</div>
            <div className="landing-mcp-section__tool-logo">{content.tools.gemini}</div>
            <div className="landing-mcp-section__tool-logo">{content.tools.notion}</div>
          </div>
        </div>

        {/* Features List */}
        <div className="landing-mcp-section__features">
          {content.features.map((feature, index) => (
            <div key={feature} className="landing-mcp-section__feature-item">
              <h4>{feature}</h4>
              <p>{content.featuresDescription[index]}</p>
            </div>
          ))}
        </div>

        {/* Examples Grid (2 columns) */}
        <div className="landing-mcp-section__examples">
          {content.examples.map((example) => (
            <Tile
              key={example.title}
              className="landing-mcp-section__example-card"
            >
              <div className="landing-mcp-section__example-header">
                <h3>{example.title}</h3>
                <p className="landing-mcp-section__example-description">
                  {example.description}
                </p>
              </div>

              <div className="landing-mcp-section__chat-area">
                <div className="landing-mcp-section__chat-message landing-mcp-section__chat-message--user">
                  <span className="landing-mcp-section__chat-sender">教師</span>
                  <p>{example.userMessage}</p>
                </div>

                <div className="landing-mcp-section__chat-message landing-mcp-section__chat-message--ai">
                  <span className="landing-mcp-section__chat-sender">Claude</span>
                  <p>{example.aiMessage}</p>
                  {example.feedback && (
                    <div className="landing-mcp-section__feedback">
                      {example.feedback}
                    </div>
                  )}
                  {example.stats && (
                    <div className="landing-mcp-section__stats">
                      {example.stats}
                    </div>
                  )}
                </div>
              </div>
            </Tile>
          ))}
        </div>
      </div>
    </section>
  );
};

export default MCPCollaborationSection;
```

- [ ] **Step 2: 驗證組件導出**

Verify that the file exports correctly. Check: `grep -n "export default MCPCollaborationSection" /Users/quan/online_judge/frontend/src/features/landing/sections/MCPCollaborationSection.tsx`

Expected: 找到 export 行

- [ ] **Step 3: Commit**

```bash
cd /Users/quan/online_judge
git add frontend/src/features/landing/sections/MCPCollaborationSection.tsx
git commit -m "feat(landing): create MCPCollaborationSection component"
```

---

### Task 4: 創建 MCPCollaborationSection 樣式

**Files:**
- Create: `frontend/src/features/landing/sections/MCPCollaborationSection.scss`

- [ ] **Step 1: 創建基本樣式結構**

Create file `frontend/src/features/landing/sections/MCPCollaborationSection.scss` with:

```scss
@use "@/styles/tokens" as *;

.landing-mcp-section {
  padding: $spacing-8 0;
  background: $color-background-secondary;
  
  &__tools {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: $spacing-4;
    margin: $spacing-6 0;
    flex-wrap: wrap;
  }

  &__tools-label {
    font-size: $font-size-label-01;
    color: $color-text-secondary;
    font-weight: 600;
  }

  &__tools-logos {
    display: flex;
    gap: $spacing-3;
    align-items: center;
  }

  &__tool-logo {
    padding: $spacing-2 $spacing-3;
    background: $color-background-primary;
    border: 1px solid $color-border-subtle;
    border-radius: 4px;
    font-size: $font-size-body-01;
    font-weight: 600;
    color: $color-text-primary;
    min-width: 100px;
    text-align: center;
  }

  &__features {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: $spacing-5;
    margin: $spacing-6 0;

    @media (max-width: 768px) {
      grid-template-columns: 1fr;
    }
  }

  &__feature-item {
    text-align: center;

    h4 {
      font-size: $font-size-heading-04;
      color: $color-text-primary;
      margin-bottom: $spacing-2;
    }

    p {
      font-size: $font-size-body-01;
      color: $color-text-secondary;
      line-height: 1.5;
    }
  }

  &__examples {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: $spacing-5;
    margin-top: $spacing-6;

    @media (max-width: 768px) {
      grid-template-columns: 1fr;
    }
  }

  &__example-card {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: $spacing-5;
    background: $color-background-primary;
    border: 1px solid $color-border-subtle;
    border-radius: 8px;

    &:hover {
      border-color: $color-border-strong;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }
  }

  &__example-header {
    margin-bottom: $spacing-4;

    h3 {
      font-size: $font-size-heading-05;
      color: $color-text-primary;
      margin-bottom: $spacing-2;
    }
  }

  &__example-description {
    font-size: $font-size-body-01;
    color: $color-text-secondary;
    line-height: 1.5;
  }

  &__chat-area {
    display: flex;
    flex-direction: column;
    gap: $spacing-3;
  }

  &__chat-message {
    padding: $spacing-3;
    border-radius: 6px;
    font-size: $font-size-body-01;
    line-height: 1.5;

    &--user {
      background: $color-background-ui;
      border-left: 3px solid $color-border-interactive;
      margin-left: 0;
    }

    &--ai {
      background: $color-background-highlight;
      border-left: 3px solid $color-border-success;
      margin-left: 0;
    }
  }

  &__chat-sender {
    display: block;
    font-size: $font-size-label-01;
    font-weight: 600;
    color: $color-text-primary;
    margin-bottom: $spacing-1;
  }

  &__feedback {
    margin-top: $spacing-2;
    padding: $spacing-2;
    background: rgba($color-success, 0.1);
    color: $color-success;
    font-weight: 600;
    border-radius: 4px;
    font-size: $font-size-label-01;
  }

  &__stats {
    margin-top: $spacing-2;
    padding: $spacing-2;
    background: rgba($color-interactive, 0.1);
    color: $color-interactive;
    font-weight: 600;
    border-radius: 4px;
    font-size: $font-size-label-01;
  }
}
```

- [ ] **Step 2: 驗證 SCSS 語法**

Run: `cd /Users/quan/online_judge/frontend && npm run build 2>&1 | head -20`

Expected: 無 SCSS 編譯錯誤

- [ ] **Step 3: Commit**

```bash
cd /Users/quan/online_judge
git add frontend/src/features/landing/sections/MCPCollaborationSection.scss
git commit -m "feat(landing): add MCPCollaborationSection styles"
```

---

### Task 5: 更新 LandingScreen.tsx

**Files:**
- Modify: `frontend/src/features/landing/screens/LandingScreen.tsx`

- [ ] **Step 1: 在 LandingScreen.tsx 中導入 MCPCollaborationSection**

在導入部分（第 15 行之後）添加：

```typescript
import MCPCollaborationSection from "@/features/landing/sections/MCPCollaborationSection";
```

- [ ] **Step 2: 在主內容區域中使用 MCPCollaborationSection**

在 `<BentoFeaturesSection ... />` 之後（第 79 行之後）添加：

```typescript
        <MCPCollaborationSection content={content.mcp} />
```

最終應該看起來像：

```typescript
        <BentoFeaturesSection
          eyebrow={t("bento.eyebrow")}
          title={t("bento.title")}
          description={t("bento.description")}
          cards={content.bento}
        />
        <MCPCollaborationSection content={content.mcp} />
        <WhyChooseSection
          eyebrow={t("whyChoose.eyebrow")}
          title={t("whyChoose.title")}
          description={t("whyChoose.description")}
          items={content.whyChoose}
        />
```

- [ ] **Step 3: 驗證文件編譯**

Run: `cd /Users/quan/online_judge/frontend && npm run type-check`

Expected: 無類型錯誤

- [ ] **Step 4: Commit**

```bash
cd /Users/quan/online_judge
git add frontend/src/features/landing/screens/LandingScreen.tsx
git commit -m "feat(landing): integrate MCPCollaborationSection into LandingScreen"
```

---

### Task 6: 測試組件

**Files:**
- Test: 在瀏覽器中檢查頁面

- [ ] **Step 1: 啟動 dev 環境**

Run: `bash /Users/quan/online_judge/.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d --build`

等待服務啟動（~1-2 分鐘）

- [ ] **Step 2: 驗證前端編譯成功**

Run: `docker compose -f /Users/quan/online_judge/docker-compose.dev.yml logs frontend 2>&1 | grep -E "(ready|error|fail)" | tail -3`

Expected: 看到 "ready" 或類似的成功信息，無 error/fail

- [ ] **Step 3: 在瀏覽器中打開 landing 頁面**

打開 `http://localhost:5173`（或你的 dev 服務器地址）

- [ ] **Step 4: 檢查 MCPCollaborationSection 是否顯示**

視覺檢查清單：
- [ ] 標題「與現有 AI 工具無痛協作」可見
- [ ] 副標題正確顯示
- [ ] 四個 AI 工具的 logo/名字列在一行
- [ ] 三個功能說明（快速生成題目、自動批改、個性化評論）可見
- [ ] 兩個示例 block 並排顯示（在寬屏下）
- [ ] 示例 1 展示「快速生成題目」的對話
- [ ] 示例 2 展示「自動批改評論」的對話
- [ ] 示例中的聊天氣泡樣式正確（用戶/AI 消息區分）

- [ ] **Step 5: 檢查語言切換**

在頁面語言切換器中選擇英文，確認：
- [ ] 所有文案都切換到英文
- [ ] 對話內容也是英文

- [ ] **Step 6: 檢查響應式設計**

在瀏覽器開發者工具中測試不同螢幕尺寸：
- [ ] 平板尺寸（768px）：grid 應改為單列
- [ ] 手機尺寸（375px）：版面應仍可讀

- [ ] **Step 7: Commit 測試結果**

如果一切正常，進行最終提交：

```bash
cd /Users/quan/online_judge
git log --oneline -5
```

Expected: 應看到 5 個最近的 commit，包括 MCP 相關的提交

---

## 成功驗收標準

1. ✅ MCPCollaborationSection 組件正確渲染
2. ✅ 所有文案從 landingContent 正確傳遞
3. ✅ 中英文翻譯都正確顯示
4. ✅ 兩個示例 block 在寬屏下並排，在窄屏下堆疊
5. ✅ 所有樣式符合設計文檔要求
6. ✅ 組件集成到 LandingScreen，排在 BentoFeaturesSection 之後
7. ✅ 無類型錯誤或編譯警告
8. ✅ 頁面響應式設計良好
