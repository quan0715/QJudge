# MCP 協作 Section 設計文檔

**日期：** 2026-04-12  
**目標用戶：** 教師 / 出題者  
**主要功能：** 展示 QJudge 透過 MCP 與外部 AI 工具（Claude、ChatGPT、Google Gemini、Notion）的無縫協作能力

---

## 設計目標

在 landing page 的 BentoFeaturesSection 之後新增一個獨立的 MCP 協作 section，用簡潔、親切的方式展示教師如何在喜愛的 AI 工具中直接使用 QJudge 的出題、批改、評論功能，無需在不同應用間切換。

---

## 版面結構

### 1. 標題區

**標題：** 「與現有 AI 工具無痛協作」  
**副標題：** 「直接在 Claude、ChatGPT、Google Gemini、Notion 中建立、批改、評論」

- 清晰展示這不是新功能，而是現有 QJudge 功能可被整合到教師日常使用的工具中

### 2. AI 工具 Logo 區

一排並列的工具 logo：
- Claude ✓（原生 MCP 支援）
- ChatGPT
- Google Gemini
- Notion

logo 可作為連結，指向對應工具的設定或文件頁面（未來實現）

### 3. 「可以幫你做什麼」說明區

三項核心功能（使用親切、非技術性的措辭）：
1. **快速生成競賽題目** — 與 AI 協商題目需求，直接建立到 QJudge
2. **自動批改學生作答** — 取得批改結果和統計數據
3. **提供個性化評論** — AI 分析常見錯誤並給改進建議

### 4. 兩個示例 Block（2 列並排）

#### 左欄：示例 1 - 快速生成題目

**標題：** 「快速生成題目」

**內容結構：**
- **左側文字區：**
  - 說明：教師在 Claude 中與 AI 協商題目需求，Claude 直接在 QJudge 中建立題目
  - 對話示例：
    - 教師：「幫我設計一套 C++ 迴圈的競賽題目」
    - Claude：「我為你設計了 3 道題目。已直接建立到你的 QJudge 題庫。」

- **右側視覺區：**
  - 呈現對話截圖或模擬對話界面
  - 展示成功建立的視覺反饋（如 ✓ 已建立、題目列表等）

#### 右欄：示例 2 - 自動批改評論

**標題：** 「自動批改評論」

**內容結構：**
- **左側文字區：**
  - 說明：教師在 Claude 中請求批改結果，Claude 自動從 QJudge 取得批改數據並提供分析
  - 對話示例：
    - 教師：「請協助批改第三題」
    - Claude：「第三題通過率 45%。常見問題是邊界條件處理不當。我提供了改進建議。」

- **右側視覺區：**
  - 呈現 QJudge 的批改結果截圖
  - 顯示：通過率圖表 / 分布數據 / 評論內容

---

## 設計原則

1. **簡潔親切** — 使用教師能理解的語言，避免技術術語（MCP、API 等）
2. **場景化** — 通過真實對話示例展示，讓教師能想像自己的使用場景
3. **視覺平衡** — 兩個示例並排，信息量均勻分布
4. **行動導向** — Logo 區日後可連結到設定指南，方便教師快速開始

---

## 實現細節

### 技術架構

- **位置：** `frontend/src/features/landing/sections/` 新增 `MCPCollaborationSection.tsx`
- **樣式：** `MCPCollaborationSection.scss`（遵循現有 landing section 的設計體系）
- **資料結構：** 定義 section 所需的文案、圖片路徑等

### 視覺資源

需要準備：
1. Claude、ChatGPT、Google Gemini、Notion 的官方 logo
2. 對話示例的截圖或設計稿（示例 1 和示例 2 各一張）
3. 批改結果的截圖或設計稿（示例 2 右側）

### 文案

- 標題、副標題、三項功能說明
- 對話示例的確切措辭（需確保準確反映實際 MCP 功能）

---

## 位置整合

- **插入位置：** `frontend/src/features/landing/screens/` 中的 landing page 路由，在 BentoFeaturesSection 之後
- **與現有 AI 卡片的區分：**
  - BentoFeaturesSection 的「AI」卡片展示 QJudge 的內建 AI 助教功能（如 QJudge AI 幫出題）
  - 新 MCPCollaborationSection 展示外部 AI 工具與 QJudge 的整合故事

---

## 成功指標

1. 教師能清楚理解「我可以在 Claude 中直接用 QJudge」
2. 對話示例能引發教師的使用興趣
3. Logo 區清晰展示支援的工具
4. 頁面佈局和現有 landing 風格一致

---

## 後續任務

1. 設計/準備對話示例和批改結果的視覺資源
2. 實現 React 組件和樣式
3. 測試在不同螢幕尺寸下的顯示效果
4. 將 logo 連結至對應的設定頁面（未來版本）
