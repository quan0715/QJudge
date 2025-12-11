# 貢獻指南

感謝您對 QJudge 專案的興趣！我們歡迎各種形式的貢獻。

## 目錄

1. [行為準則](#行為準則)
2. [如何貢獻](#如何貢獻)
3. [開發環境設置](#開發環境設置)
4. [程式碼風格](#程式碼風格)
5. [提交規範](#提交規範)
6. [Pull Request 流程](#pull-request-流程)
7. [問題回報](#問題回報)

---

## 行為準則

本專案採用友善、開放的社群環境。請遵守以下原則：

- 尊重所有貢獻者
- 使用友善、專業的語言
- 接受建設性的批評
- 專注於對社群最有利的事情

---

## 如何貢獻

### 貢獻類型

我們歡迎以下類型的貢獻：

- 🐛 **Bug 修復**：修復已知問題
- ✨ **新功能**：新增功能或改進現有功能
- 📚 **文件**：改進文件、新增使用範例
- 🧪 **測試**：新增或改進測試覆蓋
- 🎨 **UI/UX**：改善使用者介面和體驗
- ⚡ **效能**：效能優化
- 🔧 **重構**：程式碼重構和清理

### 開始之前

1. 檢查 [Issues](https://github.com/quan0715/QJudge/issues) 是否已有相關討論
2. 對於重大改動，請先開 Issue 討論
3. Fork 專案並在自己的分支上開發

---

## 開發環境設置

### 系統需求

- Python 3.11+
- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 15+
- Redis 7+

### 快速開始

```bash
# 1. Clone 專案
git clone https://github.com/quan0715/QJudge.git
cd QJudge

# 2. 複製環境變數範本
cp .env.example .env

# 3. 啟動開發環境
docker-compose -f docker-compose.dev.yml up -d

# 4. 安裝後端依賴
cd backend
pip install -r requirements/dev.txt
python manage.py migrate
python manage.py seed_e2e_data  # 建立測試資料

# 5. 安裝前端依賴
cd ../frontend
npm install
npm run dev
```

### 開發伺服器

- **前端**: http://localhost:5173
- **後端 API**: http://localhost:8000
- **API 文件**: http://localhost:8000/api/v1/docs/

---

## 程式碼風格

### Python (後端)

我們遵循 PEP 8 規範，並使用以下工具：

```bash
# 格式化
black backend/

# Lint 檢查
flake8 backend/

# Import 排序
isort backend/
```

#### 命名規範

- **變數/函數**：`snake_case`
- **類別**：`PascalCase`
- **常數**：`UPPER_SNAKE_CASE`
- **私有方法**：`_leading_underscore`

#### Docstring 風格

```python
def function_name(param1: str, param2: int) -> bool:
    """
    簡短描述。

    詳細描述（如果需要）。

    Args:
        param1: 參數1說明
        param2: 參數2說明

    Returns:
        回傳值說明

    Raises:
        ExceptionType: 例外說明
    """
    pass
```

### TypeScript (前端)

我們使用 ESLint 和 Prettier：

```bash
# 格式化和 Lint
cd frontend
npm run lint
npm run lint:fix
```

#### 命名規範

- **變數/函數**：`camelCase`
- **元件/類別**：`PascalCase`
- **常數**：`UPPER_SNAKE_CASE`
- **介面/型別**：`PascalCase`（介面不加 `I` 前綴）

#### 元件結構

```typescript
// ComponentName.tsx
import React from 'react';
import { ... } from '@carbon/react';

interface ComponentNameProps {
  prop1: string;
  prop2?: number;
}

/**
 * 元件說明
 */
const ComponentName: React.FC<ComponentNameProps> = ({ prop1, prop2 }) => {
  // hooks
  const [state, setState] = useState();

  // handlers
  const handleClick = () => {};

  // render
  return <div>{/* ... */}</div>;
};

export default ComponentName;
```

---

## 提交規範

我們使用 [Conventional Commits](https://www.conventionalcommits.org/) 規範：

### 格式

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Type 類型

| Type       | 說明                         |
| ---------- | ---------------------------- |
| `feat`     | 新功能                       |
| `fix`      | Bug 修復                     |
| `docs`     | 文件更新                     |
| `style`    | 程式碼格式（不影響功能）     |
| `refactor` | 重構（不新增功能或修復 bug） |
| `perf`     | 效能優化                     |
| `test`     | 新增或修改測試               |
| `chore`    | 建置流程或工具設定           |
| `ci`       | CI/CD 設定                   |

### 範例

```bash
# 新功能
feat(contest): add exam heartbeat monitoring

# Bug 修復
fix(submission): fix N+1 query in list view

# 文件
docs: update API documentation

# 重構
refactor(auth): extract token service
```

---

## Pull Request 流程

### 1. 建立分支

```bash
# 從 develop 分支建立功能分支
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name

# 或修復分支
git checkout -b fix/bug-description
```

### 2. 開發與測試

```bash
# 後端測試
cd backend
pytest

# 前端測試
cd frontend
npm run test
```

### 3. 提交 PR

確保您的 PR：

- [ ] 有清楚的標題和描述
- [ ] 關聯相關的 Issue（如果有）
- [ ] 通過所有 CI 測試
- [ ] 包含必要的測試
- [ ] 更新了相關文件

### PR 模板

```markdown
## Summary

簡短描述這個 PR 的目的和改動。

## Changes

- 列出主要改動點
- ...

## Test Plan

- [ ] 單元測試通過
- [ ] E2E 測試通過
- [ ] 手動測試步驟...

## Screenshots (if applicable)

[如果有 UI 改動，附上截圖]

## Related Issues

Closes #123
```

### 4. Code Review

- 至少需要一位維護者的 Approve
- 解決所有 Review 意見
- 確保 CI 全部通過

---

## 問題回報

### Bug 回報

使用 Bug Report Issue 模板，包含：

1. **環境資訊**：OS、瀏覽器、版本等
2. **重現步驟**：詳細的步驟說明
3. **預期行為**：應該發生什麼
4. **實際行為**：實際發生什麼
5. **截圖/Log**：如果有的話

### 功能建議

使用 Feature Request Issue 模板，包含：

1. **問題描述**：您想解決什麼問題
2. **建議方案**：您的解決方案想法
3. **替代方案**：其他可能的方案
4. **附加資訊**：任何相關資訊

---

## 聯絡方式

- **GitHub Issues**: 技術問題和功能建議
- **Email**: 專案維護者

---

感謝您的貢獻！🎉
