# UI 設計參考 (UI Design Reference)

## 1. NYCU 品牌設計規範 (Brand Guidelines)

### 1.1 色彩系統 (Color System)

**主色 (Primary)**:
- **NYCU Ultramarine (群青)**
  - HEX: `#0033A1`
  - Pantone: 286 C
  - RGB: 0, 51, 161
  - 用途：導覽列、主要按鈕、強調文字、Logo

**輔助色 (Secondary)**:
- **Silver (銀色)**
  - HEX: `#A5A5A5` (近似 Pantone 877 C)
  - 用途：次要文字、邊框、背景裝飾
- **Black (黑色)**
  - HEX: `#000000`
  - 用途：主要標題、內文

**功能色 (Functional - Carbon Design)**:
- **Success**: `#24A148` (Green 60) - AC, 通過
- **Error**: `#DA1E28` (Red 60) - WA, 錯誤, TLE
- **Warning**: `#F1C21B` (Yellow 30) - CE, 警告
- **Info**: `#0043CE` (Blue 60) - 提示, 運行中

### 1.2 字體規範 (Typography)

**中文**:
- **Noto Sans TC (思源黑體)** - 優先使用
- 微軟正黑體 (Microsoft JhengHei) - 備用

**英文**:
- **Albertus** (校名標準字，僅用於 Logo/Header)
- **Inter** 或 **Roboto** (UI 介面文字)
- **JetBrains Mono** 或 **Fira Code** (程式碼區塊)

---

## 2. IBM Carbon Design System 整合

本平台採用 **IBM Carbon Design System** (v11) 作為 UI 基礎，以呈現專業、學術且現代化的風格。

### 2.1 核心元件 (Core Components)

- **Layout**: 使用 Carbon Grid (2x Grid System)
- **Navigation**: UI Shell (Header, SideNav)
- **Buttons**:
  - Primary: `#0033A1` (NYCU Blue)
  - Secondary: Gray 80
  - Ghost: 用於低強調操作
- **Data Display**:
  - DataTable: 用於題目列表、排名、提交記錄
  - Pagination: 分頁控制
  - Tag: 顯示難度、狀態 (Easy: Green, Medium: Blue, Hard: Red)
- **Feedback**:
  - InlineNotification: 表單錯誤
  - ToastNotification: 操作成功提示
  - Loading: 頁面或區塊載入中
  - Modal: 確認對話框、考試密碼輸入

### 2.2 主題 (Themes)

- **Light Mode (預設)**:
  - Background: `#FFFFFF` / `#F4F4F4`
  - Text: `#161616`
- **Dark Mode (支援)**:
  - Background: `#161616` / `#262626`
  - Text: `#F4F4F4`
  - Primary Color 需微調以符合對比度要求

---

## 3. 關鍵頁面設計 (Key Page Designs)

### 3.1 登入頁面 (Login)
- **布局**: 左右分欄 (Split Layout)
  - 左側：NYCU 校園意象圖 / Logo / 歡迎詞
  - 右側：登入表單 (Tabs: NYCU OAuth / Email)
- **元素**:
  - NYCU Logo (頂部)
  - "Sign in with NYCU" 按鈕 (顯著)
  - Email/Password 輸入框 (次要)

### 3.2 題目列表 (Problem List)
- **布局**: 頂部篩選列 + 中間表格 + 底部已解決統計
- **表格欄位**: 狀態(Icon), ID, 標題, 難度(Tag), 通過率(ProgressBar), 標籤
- **互動**: Hover 效果，點擊行跳轉

### 3.3 題目詳情與作答 (Problem Detail)
- **布局**: 雙欄布局 (Resizable Split Pane)
  - 左欄 (40-50%): 題目描述 (Markdown), 範例測資 (Copyable Code Snippet)
  - 右欄 (50-60%): 程式碼編輯器 (Monaco), 輸出控制台, 提交按鈕
- **特色**:
  - 頂部 Toolbar: 語言選擇, 重置代碼, 設定
  - 底部 Action Bar: 測試執行, 提交

### 3.4 考試大廳 (Contest Arena)
- **布局**: 專注模式 (Focus Mode)
  - 隱藏頂部導覽列，僅保留考試資訊和倒數計時
  - 左側：題目導航 (顯示完成度)
  - 中間：作答區
  - 右側：公告欄 / 排名概況 (可收合)
- **防作弊提示**: 進入時顯示全螢幕提示和監控說明

---

## 4. 響應式設計 (Responsive Design)

- **Desktop (> 1056px)**: 完整功能，雙欄/三欄布局
- **Tablet (672px - 1056px)**: 側邊欄收合，表格可水平捲動
- **Mobile (< 672px)**:
  - 導覽列變為漢堡選單
  - 題目詳情與編輯器改為上下堆疊或分頁切換 (Tabs)
  - 隱藏非必要資訊 (如詳細統計)

---

## 5. 可及性 (Accessibility)

- 符合 **WCAG 2.1 AA** 標準
- 支援鍵盤導航 (Tab, Enter, Esc)
- 圖片需有 `alt` 文字
- 顏色對比度 >= 4.5:1
- 支援螢幕閱讀器 (ARIA labels)
