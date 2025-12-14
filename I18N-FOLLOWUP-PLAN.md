# i18n 翻譯跟進計劃 (Follow-up Plan)

**生成日期**: 2025-12-14  
**基於分支**: copilot/review-i18n-translations  
**當前狀態**: Phase 1-3 完成，Phase 4+ 待執行

---

## 📊 當前狀態總結

### ✅ 已完成工作

#### Phase 1: 翻譯文件同步 (100% 完成)
- ✅ 同步 docs.json 的 ja/ko 翻譯 (各新增 35 個 key)
- ✅ 所有 5 個翻譯文件完全同步 (zh-TW, en, ja, ko)
- ✅ 翻譯覆蓋率: 91% → 100%

#### Phase 2: 硬編碼字串移除 (2/46 檔案完成，4.3%)
- ✅ ContestLogsPage.tsx (59 處硬編碼已移除)
- ✅ ContestParticipantsPage.tsx (51 處硬編碼已移除)
- ✅ 累計清理: 110 處硬編碼字串

#### Phase 3: 翻譯組織優化 (100% 完成)
- ✅ 移動 4 個多檔案使用的 key 至 common.json
- ✅ 優化翻譯結構，避免重複

#### Phase 4: 工具建立 (100% 完成)
- ✅ 建立 i18n 使用頻率分析工具 (scripts/analyze-i18n-usage.py)
- ✅ 可自動識別應移至 common.json 的 key
- ✅ 可檢測未使用的翻譯

### 📈 統計數據

**翻譯覆蓋率:**
- 總翻譯 key: 871 個
- 使用中: 69 個 (7%)
- 未使用: 802 個 (93%)

**硬編碼字串:**
- 已處理: 2 個檔案, 110 處字串 ✅
- 待處理: 46 個檔案, 476 處字串 ⚠️
- **總進度**: 18.8% (110/586)

**各命名空間使用率:**
- admin.json: 0% (0/107 keys)
- common.json: 1% (4/234 keys)
- contest.json: 14% (59/400 keys) - **已優化**
- docs.json: 8% (6/69 keys)
- problem.json: 0% (0/61 keys)

---

## 🎯 Phase 5: 硬編碼字串清理計劃

### 優先級分組

#### P0 - 核心功能頁面 (4 檔案, 預計 8-12 小時)
| 檔案 | 硬編碼數 | 優先級 | 預估時間 |
|-----|---------|--------|---------|
| 1. ProblemForm.tsx | 53 | 🔴 Critical | 3-4h |
| 2. ContestClarifications.tsx | 43 | 🔴 Critical | 2-3h |
| 3. TestCaseList.tsx | 36 | 🔴 Critical | 2-3h |
| 4. ProblemStatsTab.tsx | 32 | 🔴 Critical | 2h |

**理由**: 這些是用戶最常使用的核心功能，國際化影響最大。

#### P1 - 重要功能頁面 (6 檔案, 預計 6-8 小時)
| 檔案 | 硬編碼數 | 優先級 | 預估時間 |
|-----|---------|--------|---------|
| 5. SubmissionTable.tsx | 22 | 🟠 High | 1.5h |
| 6. ProblemTable.tsx | 20 | 🟠 High | 1.5h |
| 7. ContestCreatePage.tsx | 20 | 🟠 High | 1.5h |
| 8. ContestProblemsPage.tsx | 19 | 🟠 High | 1h |
| 9. ContestAdminsPage.tsx | 16 | 🟠 High | 1h |
| 10. SubmissionDetailModal.tsx | 13 | 🟠 High | 1h |

#### P2 - 一般功能頁面 (10 檔案, 預計 8-10 小時)
11-20 檔案，每個檔案 8-12 處硬編碼

#### P3 - 次要功能頁面 (26 檔案, 預計 6-8 小時)
21-46 檔案，每個檔案 1-7 處硬編碼

### 執行策略

**方案 A: 分批執行 (建議)**
- Week 1: P0 (4 檔案)
- Week 2: P1 (6 檔案)
- Week 3-4: P2 (10 檔案)
- Week 5-6: P3 (26 檔案)

**方案 B: 模組執行**
- Phase 5.1: Problem 相關 (10 檔案)
- Phase 5.2: Contest 相關 (12 檔案)
- Phase 5.3: Submission 相關 (8 檔案)
- Phase 5.4: 其他 (16 檔案)

---

## 🎯 Phase 6: 未使用翻譯審查

### 目標
審查 802 個未使用的翻譯 key，確定是否:
1. 為未來功能保留
2. 可以安全移除
3. 需要重新組織

### 執行計劃

#### 6.1 審查 admin.json (107 keys, 100% 未使用)
**狀態**: 可能完全未實作或使用不同路徑

**行動**:
- 檢查 admin 相關頁面實際使用情況
- 確認是否為未來功能
- 建議: 保留 80%，移除明顯過時的 20%

#### 6.2 審查 common.json (230 keys, 98% 未使用)
**狀態**: 大量通用翻譯未被引用

**行動**:
- 識別真正通用的 key
- 檢查是否有替代引用方式
- 建議: 保留 60%，移除或重組 40%

#### 6.3 審查 contest.json (341 keys, 85% 未使用)
**狀態**: 已部分使用，但仍有大量未用

**行動**:
- 優先保留與已實作功能相關的 key
- 標記可能的未來功能
- 建議: 保留 70%，移除 30%

#### 6.4 審查 docs.json (63 keys, 91% 未使用)
**狀態**: 文檔系統可能使用動態載入

**行動**:
- 檢查文檔頁面實際使用
- 確認 markdown 文件是否引用
- 建議: 保留 90% (文檔功能可能未完全實作)

#### 6.5 審查 problem.json (61 keys, 100% 未使用)
**狀態**: 完全未使用，可能為未來功能

**行動**:
- 檢查 problem 相關頁面
- 確認是否為規劃中功能
- 建議: 保留 80%，移除明顯錯誤的 20%

---

## 🎯 Phase 7: 翻譯品質改善

### 7.1 翻譯一致性檢查
- 檢查相同概念在不同檔案中的翻譯是否一致
- 建立翻譯術語表

### 7.2 翻譯完整性驗證
- 確保所有 4 語言 (zh-TW, en, ja, ko) 的翻譯品質
- 審查機器翻譯的品質

### 7.3 上下文適配性
- 確保翻譯在實際 UI 中顯示合理
- 檢查字串長度是否適合 UI 元件

---

## 🎯 Phase 8: 自動化與 CI/CD 整合

### 8.1 Pre-commit Hooks
```bash
# 自動檢查:
- 新增的硬編碼中文字串
- 翻譯文件語法正確性
- 翻譯 key 在各語言檔案中的一致性
```

### 8.2 CI 檢查
```yaml
# GitHub Actions workflow:
- 翻譯文件完整性檢查
- 未使用翻譯 key 報告
- 硬編碼字串掃描
- 翻譯覆蓋率統計
```

### 8.3 開發工具
- VSCode 擴充套件: 高亮未翻譯字串
- ESLint 規則: 禁止硬編碼字串
- 翻譯 key 自動補全

---

## 📋 執行檢查清單

### Phase 5: 硬編碼清理
- [ ] Week 1: P0 檔案 (4 個)
  - [ ] ProblemForm.tsx
  - [ ] ContestClarifications.tsx
  - [ ] TestCaseList.tsx
  - [ ] ProblemStatsTab.tsx
- [ ] Week 2: P1 檔案 (6 個)
- [ ] Week 3-4: P2 檔案 (10 個)
- [ ] Week 5-6: P3 檔案 (26 個)

### Phase 6: 未使用翻譯審查
- [ ] admin.json 審查與清理
- [ ] common.json 審查與重組
- [ ] contest.json 審查與優化
- [ ] docs.json 審查
- [ ] problem.json 審查

### Phase 7: 品質改善
- [ ] 建立翻譯術語表
- [ ] 翻譯一致性審查
- [ ] 翻譯品質驗證
- [ ] UI 顯示測試

### Phase 8: 自動化
- [ ] Pre-commit hooks 設置
- [ ] CI/CD 整合
- [ ] 開發工具配置
- [ ] 文檔更新

---

## 🎯 里程碑

### Milestone 1: 核心功能國際化 (2 週)
- 完成 P0 + P1 檔案 (10 個檔案)
- 硬編碼清理率達到 45%

### Milestone 2: 主要功能國際化 (1 個月)
- 完成 P0 + P1 + P2 檔案 (20 個檔案)
- 硬編碼清理率達到 75%

### Milestone 3: 完整國際化 (2 個月)
- 完成所有 46 個檔案
- 硬編碼清理率達到 100%

### Milestone 4: 優化與自動化 (2.5 個月)
- 完成翻譯審查與優化
- 建立自動化工具與 CI/CD
- i18n 系統完全成熟

---

## 💡 建議

### 立即執行 (本週)
1. ✅ 與 main 分支同步 (確認無衝突)
2. 🎯 開始 Phase 5.1: 處理 ProblemForm.tsx (53 處硬編碼)
3. 🎯 設置基本的 ESLint 規則防止新增硬編碼

### 短期執行 (本月)
1. 完成 P0 檔案 (4 個核心功能)
2. 開始 Phase 6: 審查未使用翻譯
3. 建立翻譯貢獻指南

### 中期執行 (3 個月內)
1. 完成所有硬編碼清理
2. 完成翻譯品質改善
3. 建立完整的自動化系統

---

## 📊 成功指標

| 指標 | 當前 | 目標 (3 個月) |
|-----|------|--------------|
| 硬編碼清理率 | 18.8% | 100% |
| 翻譯使用率 | 7% | 40%+ |
| 翻譯覆蓋率 | 100% | 100% |
| 自動化覆蓋率 | 0% | 80% |
| CI/CD 整合 | 0% | 100% |

---

## 🔗 相關資源

- **分析工具**: `scripts/analyze-i18n-usage.py`
- **文檔**: `scripts/README-i18n-analyzer.md`
- **當前 PR**: copilot/review-i18n-translations
- **翻譯檔案**: `frontend/src/i18n/locales/{zh-TW,en,ja,ko}/*.json`

---

**下次更新**: 完成 Phase 5.1 後更新進度
