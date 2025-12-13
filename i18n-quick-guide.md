# i18n 改善快速指南

## 🎯 第一步：同步 docs.json 翻譯

### 缺失的翻譯 Key

日語（ja）和韓語（ko）的 docs.json 各缺少 35 個 key。

### 建議的翻譯內容

#### 1. 在 `frontend/src/i18n/locales/ja/docs.json` 中新增：

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

#### 2. 在 `frontend/src/i18n/locales/ko/docs.json` 中新增：

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

### 驗證步驟

1. 編輯完成後，驗證 JSON 語法：
   ```bash
   cd frontend/src/i18n/locales
   python3 -m json.tool ja/docs.json > /dev/null && echo "ja/docs.json: OK"
   python3 -m json.tool ko/docs.json > /dev/null && echo "ko/docs.json: OK"
   ```

2. 執行分析工具確認同步：
   ```bash
   python3 /tmp/i18n_analysis.py
   ```

3. 測試應用程式，切換至 ja 和 ko 語言，確認文檔頁面顯示正常。

---

## 🔧 第二步：清理硬編碼字串範例

### 範例 1: ContestLogsPage.tsx

**問題**：圖表資料標籤硬編碼

```tsx
// 修改前
data.push({ date, value: counts.violation, group: "違規事件" });
data.push({ date, value: counts.submission, group: "程式提交" });
data.push({ date, value: counts.lifecycle, group: "考試狀態" });
```

**解決方案**：

1. 在 `contest.json` 新增翻譯：
```json
{
  "logs": {
    "chartGroups": {
      "violation": "違規事件",
      "submission": "程式提交",
      "lifecycle": "考試狀態"
    }
  }
}
```

2. 修改程式碼：
```tsx
// 修改後
import { useTranslation } from 'react-i18next';

const { t } = useTranslation('contest');

data.push({ 
  date, 
  value: counts.violation, 
  group: t('logs.chartGroups.violation') 
});
data.push({ 
  date, 
  value: counts.submission, 
  group: t('logs.chartGroups.submission') 
});
data.push({ 
  date, 
  value: counts.lifecycle, 
  group: t('logs.chartGroups.lifecycle') 
});
```

3. 同步到其他語言（en, ja, ko）。

### 範例 2: ProblemForm.tsx

**問題**：表單標籤與錯誤訊息硬編碼

```tsx
// 修改前
title="錯誤"
title="成功"
<Switch name="basic" text="基本資訊" />
```

**解決方案**：

1. 在 `problem.json` 新增翻譯：
```json
{
  "form": {
    "errorTitle": "錯誤",
    "successTitle": "成功",
    "sections": {
      "basic": "基本資訊",
      "testCases": "測試案例",
      "restrictions": "限制條件"
    }
  }
}
```

2. 修改程式碼：
```tsx
// 修改後
const { t } = useTranslation('problem');

title={t('form.errorTitle')}
title={t('form.successTitle')}
<Switch name="basic" text={t('form.sections.basic')} />
```

---

## 📋 檢查清單

### 完成 docs.json 同步後

- [ ] ja/docs.json 新增 35 個 key
- [ ] ko/docs.json 新增 35 個 key
- [ ] 驗證 JSON 語法正確
- [ ] 執行分析工具確認無缺失 key
- [ ] 測試應用程式，確認 ja 和 ko 語言下文檔頁面顯示正常
- [ ] Commit 並 push 變更

### 開始清理硬編碼字串

- [ ] 選擇要處理的檔案（建議從 ContestLogsPage.tsx 開始）
- [ ] 識別硬編碼字串的類型（表格標題、狀態、錯誤訊息等）
- [ ] 在對應的翻譯 JSON 檔案中新增 key
- [ ] 使用 useTranslation hook 替換硬編碼字串
- [ ] 同步翻譯到所有語言（en, ja, ko）
- [ ] 測試功能是否正常運作
- [ ] Commit 並 push 變更

---

## 🛠️ 有用的命令

### 驗證 JSON 檔案語法
```bash
cd frontend/src/i18n/locales
for file in */*.json; do
  echo -n "Checking $file... "
  python3 -m json.tool "$file" > /dev/null && echo "OK" || echo "ERROR"
done
```

### 計算各語言的 key 數量
```bash
cd frontend/src/i18n/locales
for lang in zh-TW en ja ko; do
  echo "$lang:"
  for file in common problem contest admin docs; do
    count=$(python3 -c "import json; d=json.load(open('$lang/${file}.json')); print(sum(1 for _ in d))")
    echo "  $file.json: $count keys"
  done
done
```

### 搜尋特定的硬編碼字串
```bash
cd frontend/src
grep -r "違規事件" --include="*.tsx" --include="*.ts"
```

---

## 📚 參考資源

- [完整分析報告](./i18n-comprehensive-review-report.md)
- [翻譯 Key 統計](./i18n-translation-analysis-report.md)
- [硬編碼字串清單](./hardcoded-strings-report.md)
- [React i18next 文檔](https://react.i18next.com/)

---

**預計完成時間**：
- docs.json 同步：2-3 小時
- 前 10 個檔案硬編碼清理：3-5 天

祝改善順利！🚀
