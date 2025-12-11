# QJudge 文件目錄

> **最後更新**: 2025-12-11

本目錄包含 QJudge 專案的完整技術文件，涵蓋架構、API、資料庫、部署、測試以及 Code Review 報告。

---

## 📚 文件列表

### 1. 架構與設計

**[ARCHITECTURE.md](./ARCHITECTURE.md)** - 系統架構文件

- 系統概述與技術棧
- 前後端架構詳解
- 資料庫設計概覽
- 評測系統架構
- 部署架構與安全設計
- 未來規劃

### 2. API 規範

**[API.md](./API.md)** - RESTful API 文件

- 認證系統 API
- 題目系統 API
- 提交系統 API
- 競賽系統 API
- 通知與公告 API
- 錯誤碼與速率限制

### 3. 資料模型

**[DATABASE.md](./DATABASE.md)** - 資料庫設計文件

- 資料庫架構與連線設定
- 完整的資料表結構（ER 圖）
- 索引策略與效能優化
- 資料完整性約束
- 遷移策略與備份

### 4. 部署與測試

**[DEPLOYMENT_AND_TESTING.md](./DEPLOYMENT_AND_TESTING.md)** - 部署與測試指南

- 開發環境快速啟動
- 生產環境部署步驟
- 測試策略與覆蓋率
- CI/CD 流程
- 監控與維護
- 故障排除

### 5. Code Review 報告

**[CODE_REVIEW_REPORT.md](./CODE_REVIEW_REPORT.md)** - 完整的程式碼審查報告

- 架構與設計評價
- 安全性分析（包含已識別的漏洞）
- 程式碼品質評估
- 效能與可擴展性分析
- 測試覆蓋率評估
- 冗餘程式碼識別
- 改進建議（分優先權）

### 6. 其他文件

**[problem-import-format.md](./problem-import-format.md)** - 題目 YAML 導入格式規範

**[E2E_TESTING.md](../E2E_TESTING.md)** - E2E 測試指南

**[examples/a-plus-b-problem.yaml](./examples/a-plus-b-problem.yaml)** - 題目 YAML 範例

---

## 🚀 快速導航

### 我是新手，從哪裡開始？

1. **學生使用者** → 閱讀 [../README.md](../README.md) 快速開始
2. **教師使用者** → 閱讀 [ARCHITECTURE.md](./ARCHITECTURE.md) 瞭解系統
3. **開發者** → 先看 [ARCHITECTURE.md](./ARCHITECTURE.md)，再看 [CODE_REVIEW_REPORT.md](./CODE_REVIEW_REPORT.md)
4. **維運人員** → 閱讀 [DEPLOYMENT_AND_TESTING.md](./DEPLOYMENT_AND_TESTING.md)

### 我想要...

- **瞭解系統架構** → [ARCHITECTURE.md](./ARCHITECTURE.md)
- **查看 API 規範** → [API.md](./API.md) 或訪問 `/api/schema/swagger-ui/`
- **瞭解資料庫結構** → [DATABASE.md](./DATABASE.md)
- **部署到生產環境** → [DEPLOYMENT_AND_TESTING.md](./DEPLOYMENT_AND_TESTING.md)
- **查看已知問題與改進建議** → [CODE_REVIEW_REPORT.md](./CODE_REVIEW_REPORT.md)
- **導入題目** → [problem-import-format.md](./problem-import-format.md)
- **執行 E2E 測試** → [E2E_TESTING.md](../E2E_TESTING.md)

---

## 📊 文件概覽

| 文件                      | 類型 | 頁數 | 目標讀者               |
| ------------------------- | ---- | ---- | ---------------------- |
| ARCHITECTURE.md           | 技術 | 長   | 開發者、架構師         |
| API.md                    | 參考 | 長   | 前端開發者、API 使用者 |
| DATABASE.md               | 參考 | 長   | 後端開發者、DBA        |
| DEPLOYMENT_AND_TESTING.md | 操作 | 長   | 維運人員、DevOps       |
| CODE_REVIEW_REPORT.md     | 報告 | 超長 | 所有開發者             |
| problem-import-format.md  | 參考 | 短   | 教師、內容建立者       |
| E2E_TESTING.md            | 操作 | 短   | QA、測試工程師         |

---

## 🔄 文件更新記錄

### 2025-12-10 - 大規模文件更新

**新增**:

- ✅ `ARCHITECTURE.md` - 完整的系統架構文件
- ✅ `API.md` - 詳細的 API 規範與範例
- ✅ `DATABASE.md` - 資料庫設計與索引策略
- ✅ `DEPLOYMENT_AND_TESTING.md` - 部署與測試完整指南
- ✅ `CODE_REVIEW_REPORT.md` - 深度程式碼審查報告

**改進**:

- 📝 重新組織文件結構
- 📝 新增此 README.md 作為文件導航
- 📝 統一文件格式與樣式

### 之前版本

- 📝 `problem-import-format.md` - 題目格式規範
- 📝 `E2E_TESTING.md` - E2E 測試指南
- 📝 範例檔案

---

## 💡 文件撰寫原則

本專案文件遵循以下原則：

1. **繁體中文優先**: 主要文件使用繁體中文，程式碼註解使用中英混合
2. **實事求是**: 只記錄已實作的功能，不幻想未實作的情境
3. **詳細完整**: 提供充足的範例與說明
4. **定期更新**: 隨著專案演進持續更新文件
5. **易於導航**: 清晰的目錄結構與交叉引用

---

## 🤝 貢獻文件

如果你發現文件有錯誤或需要補充，歡迎：

1. 提交 Issue 指出問題
2. 提交 Pull Request 修正文件
3. 聯絡專案維護者

**文件風格指南**:

- 使用 Markdown 格式
- 標題層級不超過 4 層
- 程式碼區塊指定語言（語法高亮）
- 重要內容使用表格或清單
- 新增適當的表情符號增加可讀性

---

## 📞 支援與聯絡

- **GitHub Issues**: [提交 Issue](https://github.com/quan0715/QJudge/issues)
- **專案首頁**: [README.md](../README.md)
- **線上演示**: `nycu-coding-lab.quan.wtf`

---

**QJudge Documentation** - 完整、詳實、易懂 📚
