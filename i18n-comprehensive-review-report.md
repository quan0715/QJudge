# QJudge i18n 翻譯內容全面檢視報告

**生成日期**: 2025-12-13  
**檢視範圍**: 翻譯 JSON 檔案、文檔、前端程式碼  

---

## 📋 執行摘要

本報告針對 QJudge 專案的多語言翻譯內容進行全面檢視，以**正體中文（zh-TW）**為主要語言來源，檢查其他語言版本（en, ja, ko）的同步狀態。

### 主要發現

✅ **優點**：
- 4 個主要翻譯檔案（common.json, problem.json, contest.json, admin.json）在所有語言間完全同步
- 共 691 個翻譯 key 在所有語言版本中保持一致
- 翻譯檔案結構清晰，採用階層式命名

⚠️ **需要改善**：
1. **docs.json** 在 ja 和 ko 語言缺少 35 個翻譯 key
2. 發現 13 個重複的 key 出現在多個檔案中
3. 前端程式碼中有 **52 個檔案**包含 **598 處**硬編碼中文字串

---

## 📊 翻譯檔案分析

### 1. 翻譯 Key 數量統計

| 檔案 | zh-TW | en | ja | ko | 狀態 |
|------|-------|----|----|----|----|
| **common.json** | 230 | 230 | 230 | 230 | ✅ 完全同步 |
| **problem.json** | 61 | 61 | 61 | 61 | ✅ 完全同步 |
| **contest.json** | 293 | 293 | 293 | 293 | ✅ 完全同步 |
| **admin.json** | 107 | 107 | 107 | 107 | ✅ 完全同步 |
| **docs.json** | 69 | 69 | 34 | 34 | ⚠️ 需要同步 |
| **總計** | **760** | **760** | **725** | **725** | - |

### 2. 缺失翻譯 Key 詳細清單

#### docs.json - 日語（ja）缺失的 35 個 Key

**badge 區塊** (2 個):
- `badge`
- `badge.aiGenerated`

**feedback 區塊** (4 個):
- `feedback`
- `feedback.helpful`
- `feedback.notHelpful`
- `feedback.thanks`
- `feedback.title`

**quickLinks 區塊** (25 個):
- `quickLinks`
- `quickLinks.admin` (+ description, tag, title)
- `quickLinks.contestant` (+ description, tag, title)
- `quickLinks.developer` (+ description, tag, title)
- `quickLinks.student` (+ description, tag, title)
- `quickLinks.teacher` (+ description, tag, title)

**search 區塊** (7 個):
- `search`
- `search.label`
- `search.matches`
- `search.noResults`
- `search.placeholder`
- `search.resultsCount`
- `search.searching`

> **註**: 韓語（ko）缺失的 key 與日語完全相同

---

## 🔄 重複 Key 分析

發現 **13 個 key** 出現在多個檔案中，建議整合至 `common.json` 以避免重複維護：

| Key | 出現位置 | 建議處理 |
|-----|----------|---------|
| `message` | common.json, docs.json | 保留在 common.json，docs.json 使用引用 |
| `message.loading` | common.json, docs.json | 同上 |
| `message.notFound` | common.json, docs.json | 同上 |
| `nav` | common.json, docs.json | 評估是否可共用或保持獨立 |
| `page` | common.json, docs.json | 評估是否可共用或保持獨立 |
| `tabs` | problem.json, contest.json | 移至 common.json |
| `tabs.submissions` | problem.json, contest.json | 移至 common.json |
| `user` | common.json, admin.json | 已在 common.json，admin.json 可擴展使用 |
| `user.role` | common.json, admin.json | 同上 |
| `user.role.admin` | common.json, admin.json | 同上 |
| `user.role.adminTA` | common.json, admin.json | 同上 |
| `user.role.student` | common.json, admin.json | 同上 |
| `user.role.teacher` | common.json, admin.json | 同上 |

### 分析說明

- **message** 系列: docs.json 中的 message 與 common.json 語意相同，可直接引用
- **nav/page**: 需評估 docs 專屬導航是否需獨立維護
- **tabs**: problem 和 contest 共用的 tab 應移至 common
- **user.role**: 目前的重複是合理的，因為兩處都需要用戶角色資訊

---

## 💻 硬編碼字串掃描結果

### 統計概覽

- **掃描範圍**: frontend/src 目錄下所有 .tsx/.ts 檔案
- **發現問題檔案**: 52 個
- **硬編碼字串總數**: 598 處

### 問題最嚴重的前 10 個檔案

| 檔案 | 硬編碼數 | 優先級 |
|------|---------|-------|
| `domains/contest/pages/settings/ContestLogsPage.tsx` | 59 | 🔴 高 |
| `domains/problem/components/ProblemForm.tsx` | 53 | 🔴 高 |
| `domains/contest/pages/settings/ContestParticipantsPage.tsx` | 51 | 🔴 高 |
| `domains/contest/components/ContestClarifications.tsx` | 43 | 🔴 高 |
| `domains/problem/components/common/TestCaseList.tsx` | 36 | 🟠 中 |
| `domains/problem/components/solver/ProblemStatsTab.tsx` | 32 | 🟠 中 |
| `domains/submission/components/SubmissionTable.tsx` | 22 | 🟠 中 |
| `domains/problem/components/ProblemTable.tsx` | 20 | 🟠 中 |
| `domains/contest/pages/ContestCreatePage.tsx` | 20 | 🟠 中 |
| `domains/contest/pages/settings/ContestProblemsPage.tsx` | 19 | 🟠 中 |

### 硬編碼類型分析

1. **表格欄位標題** (估計 ~120 處)
   ```tsx
   { key: "status", header: "狀態" }
   { key: "language", header: "語言" }
   ```
   **建議**: 移至對應的翻譯檔案（common.json 或功能專屬檔案）

2. **狀態標籤** (估計 ~80 處)
   ```tsx
   { id: "AC", label: "通過 (AC)" }
   { id: "in_progress", label: "進行中" }
   ```
   **建議**: 整合至 common.json 的 status 或 label 區塊

3. **錯誤訊息** (估計 ~100 處)
   ```tsx
   showError('發布失敗，請檢查輸入內容');
   setError('請輸入競賽名稱');
   ```
   **建議**: 移至各功能模組的翻譯檔案（如 contest.json）

4. **確認對話框** (估計 ~50 處)
   ```tsx
   if (!confirm('確定要刪除此提問？')) return;
   ```
   **建議**: 使用統一的確認對話框組件搭配翻譯

5. **圖表標籤** (估計 ~60 處)
   ```tsx
   data.push({ group: "違規事件", value: counts.violation });
   ```
   **建議**: 移至對應功能的翻譯檔案

6. **表單標籤與提示** (估計 ~80 處)
   ```tsx
   <Switch name="basic" text="基本資訊" />
   ```
   **建議**: 使用 form 相關的翻譯 key

7. **其他雜項** (估計 ~108 處)
   - 按鈕文字
   - 頁面標題
   - 提示訊息等

---

## 📚 文檔同步狀態

### 文檔檔案結構

```
frontend/public/docs/
├── zh-TW/     (13 個 .md 檔案) ✅ 完整
├── en/        (13 個 .md 檔案) ✅ 完整
├── ja/        (13 個 .md 檔案) ✅ 完整
└── ko/        (13 個 .md 檔案) ✅ 完整
```

### 文檔列表

所有語言版本都包含以下文檔：

**Getting Started:**
- overview.md - 平台概覽
- quick-start.md - 快速入門

**User Guide:**
- submission.md - 程式碼提交
- contests.md - 參加競賽
- judge-system.md - 評測系統說明
- common-errors.md - 常見錯誤
- supported-languages.md - 支援的程式語言

**Teacher Guide:**
- teacher-overview.md - 教師功能總覽
- problem-import.md - YAML 題目建立

**Admin Guide:**
- admin-overview.md - 管理員功能總覽

**Developer Guide:**
- contributing.md - 如何貢獻
- dev-setup.md - 開發環境設定
- e2e-testing.md - E2E 測試指南

✅ **文檔狀態**: 所有語言的文檔檔案數量一致，結構完整

---

## 💡 改善建議與行動計畫

### 優先級 P0 (立即處理)

#### 1. 同步 docs.json 缺失的翻譯

**任務**: 為 ja 和 ko 語言的 docs.json 新增 35 個缺失的 key

**建議的翻譯內容**:

**日語 (ja/docs.json)**:
```json
{
  "badge": {
    "aiGenerated": "AI生成"
  },
  "quickLinks": {
    "student": {
      "tag": "学生",
      "title": "問題を解く",
      "description": "問題の閲覧、コード作成、提出評価の方法を学ぶ"
    },
    "contestant": {
      "tag": "コンテスト",
      "title": "コンテストに参加",
      "description": "コンテストルール、スコアリングシステム、トラブルシューティングを理解する"
    },
    "teacher": {
      "tag": "教師",
      "title": "コンテストを管理",
      "description": "コンテストの作成、問題管理、学生の統計表示"
    },
    "admin": {
      "tag": "管理者",
      "title": "システム管理",
      "description": "ユーザー、権限、システム設定の管理"
    },
    "developer": {
      "tag": "開発者",
      "title": "コードに貢献",
      "description": "開発環境のセットアップとコントリビューションワークフローを学ぶ"
    }
  },
  "search": {
    "label": "ドキュメントを検索",
    "placeholder": "ドキュメントを検索...",
    "searching": "検索中...",
    "noResults": "結果が見つかりません",
    "resultsCount": "{{count}}件の結果が見つかりました",
    "matches": "件一致"
  },
  "feedback": {
    "title": "このページは役に立ちましたか？",
    "helpful": "役に立った",
    "notHelpful": "改善が必要",
    "thanks": "フィードバックありがとうございます！"
  }
}
```

**韓語 (ko/docs.json)**:
```json
{
  "badge": {
    "aiGenerated": "AI 생성"
  },
  "quickLinks": {
    "student": {
      "tag": "학생",
      "title": "문제 풀기",
      "description": "문제 탐색, 코드 작성 및 제출 평가 방법 학습"
    },
    "contestant": {
      "tag": "대회",
      "title": "대회 참가",
      "description": "대회 규칙, 채점 시스템 및 문제 해결 방법 이해"
    },
    "teacher": {
      "tag": "교사",
      "title": "대회 관리",
      "description": "대회 생성, 문제 관리 및 학생 통계 확인"
    },
    "admin": {
      "tag": "관리자",
      "title": "시스템 관리",
      "description": "사용자, 권한 및 시스템 구성 관리"
    },
    "developer": {
      "tag": "개발자",
      "title": "코드 기여",
      "description": "개발 환경 설정 및 기여 워크플로우 학습"
    }
  },
  "search": {
    "label": "문서 검색",
    "placeholder": "문서 검색...",
    "searching": "검색 중...",
    "noResults": "결과를 찾을 수 없습니다",
    "resultsCount": "{{count}}개의 결과 발견",
    "matches": "개 일치"
  },
  "feedback": {
    "title": "이 페이지가 도움이 되었나요?",
    "helpful": "도움이 됨",
    "notHelpful": "개선 필요",
    "thanks": "피드백 감사합니다!"
  }
}
```

---

### 優先級 P1 (短期內處理)

#### 2. 清理硬編碼字串 - 第一階段

**目標**: 處理最嚴重的前 10 個檔案

**執行步驟**:
1. 識別硬編碼字串的語意分類
2. 在對應的翻譯檔案中新增 key
3. 使用 `useTranslation()` hook 或 `t()` 函數替換
4. 測試功能是否正常

**範例修改**:

修改前:
```tsx
// ContestLogsPage.tsx
data.push({ date, value: counts.violation, group: "違規事件" });
data.push({ date, value: counts.submission, group: "程式提交" });
```

修改後:
```tsx
// 在 contest.json 新增:
// "logs": {
//   "chartGroups": {
//     "violation": "違規事件",
//     "submission": "程式提交",
//     "lifecycle": "考試狀態"
//   }
// }

// ContestLogsPage.tsx
const { t } = useTranslation('contest');
data.push({ 
  date, 
  value: counts.violation, 
  group: t('logs.chartGroups.violation') 
});
```

---

### 優先級 P2 (中期規劃)

#### 3. 整合重複的 Key

**任務**: 評估並整合 13 個重複出現的 key

**建議處理方式**:

| Key | 處理方案 |
|-----|---------|
| message.* | docs.json 移除，使用 common.json |
| tabs.submissions | 移至 common.json |
| user.role.* | 維持現狀（合理的重複） |
| nav, page | 評估後決定是否保持獨立 |

#### 4. 建立翻譯規範文件

**內容應包括**:
- Key 命名規範
- 各檔案的職責範圍
- 新增翻譯的流程
- 翻譯品質檢查清單

---

### 優先級 P3 (長期維護)

#### 5. 建立自動化檢查機制

**目標**: 防止未來新增硬編碼字串

**建議工具**:
1. Pre-commit hook: 檢查新增的中文字串
2. CI/CD 集成: 自動掃描翻譯同步狀態
3. ESLint 規則: 禁止硬編碼非英文字串

#### 6. 清理剩餘硬編碼字串

**任務**: 處理剩餘 42 個檔案的 598 處硬編碼

**分階段執行**:
- 第二階段: 處理次要頁面（20 個檔案）
- 第三階段: 處理工具類組件（22 個檔案）

---

## 📋 檢查清單

### docs.json 同步

- [ ] 新增 ja/docs.json 缺失的 35 個 key
- [ ] 新增 ko/docs.json 缺失的 35 個 key
- [ ] 驗證 JSON 語法正確
- [ ] 測試文檔頁面顯示正常

### 硬編碼字串清理（第一階段）

- [ ] ContestLogsPage.tsx (59 處)
- [ ] ProblemForm.tsx (53 處)
- [ ] ContestParticipantsPage.tsx (51 處)
- [ ] ContestClarifications.tsx (43 處)
- [ ] TestCaseList.tsx (36 處)
- [ ] ProblemStatsTab.tsx (32 處)
- [ ] SubmissionTable.tsx (22 處)
- [ ] ProblemTable.tsx (20 處)
- [ ] ContestCreatePage.tsx (20 處)
- [ ] ContestProblemsPage.tsx (19 處)

### 重複 Key 整理

- [ ] 評估 message 系列是否可整合
- [ ] 評估 nav/page 是否需獨立
- [ ] 移動 tabs.submissions 至 common.json
- [ ] 文件化 user.role 的使用方式

### 文檔與規範

- [ ] 編寫翻譯規範文件
- [ ] 更新開發者文檔
- [ ] 建立翻譯貢獻指南

---

## 🎯 成功指標

1. **完整性**: 所有語言的 key 數量一致
2. **無硬編碼**: 前端程式碼中無中文硬編碼字串
3. **無重複**: 各翻譯檔案職責明確，無不必要的重複
4. **可維護性**: 有明確的翻譯規範和自動化檢查

---

## 附錄

### A. 翻譯檔案統計

| 指標 | 數值 |
|-----|-----|
| 總翻譯 key 數 (zh-TW) | 760 |
| 完全同步的檔案數 | 4 / 5 |
| 需要同步的 key 數 | 70 (ja + ko) |
| 重複的 key 數 | 13 |
| 硬編碼字串數 | 598 |

### B. 相關檔案路徑

**翻譯檔案**:
- `frontend/src/i18n/locales/{lang}/*.json`

**主要問題檔案**:
- `frontend/src/domains/contest/pages/settings/ContestLogsPage.tsx`
- `frontend/src/domains/problem/components/ProblemForm.tsx`
- `frontend/src/domains/contest/pages/settings/ContestParticipantsPage.tsx`
- 等 52 個檔案

**文檔檔案**:
- `frontend/public/docs/{lang}/*.md`

---

**報告結束**

此報告提供了 QJudge 專案 i18n 翻譯內容的全面檢視。建議優先處理 docs.json 的翻譯同步，然後逐步清理硬編碼字串，最後建立長期維護機制。
