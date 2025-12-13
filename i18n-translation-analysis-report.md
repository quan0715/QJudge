# QJudge i18n 翻譯內容分析報告
生成時間: i18n-translation-analysis-report
## 📊 執行摘要
- **支援語言**: zh-TW, en, ja, ko
- **翻譯檔案數**: 5

## 📈 翻譯 Key 數量統計
| 檔案 | zh-TW | en | ja | ko |
|------|-------|----|----|----|
| common.json | 230 ✓ | 230 ✓ | 230 ✓ | 230 ✓ |
| problem.json | 61 ✓ | 61 ✓ | 61 ✓ | 61 ✓ |
| contest.json | 293 ✓ | 293 ✓ | 293 ✓ | 293 ✓ |
| admin.json | 107 ✓ | 107 ✓ | 107 ✓ | 107 ✓ |
| docs.json | 69 ✓ | 69 ✓ | 34 ⚠ | 34 ⚠ |

## 🔍 缺失翻譯 Key 詳細清單

### docs.json

**ja 缺失的 Key (35 個)**:
- `badge`
- `badge.aiGenerated`
- `feedback`
- `feedback.helpful`
- `feedback.notHelpful`
- `feedback.thanks`
- `feedback.title`
- `quickLinks`
- `quickLinks.admin`
- `quickLinks.admin.description`
- `quickLinks.admin.tag`
- `quickLinks.admin.title`
- `quickLinks.contestant`
- `quickLinks.contestant.description`
- `quickLinks.contestant.tag`
- `quickLinks.contestant.title`
- `quickLinks.developer`
- `quickLinks.developer.description`
- `quickLinks.developer.tag`
- `quickLinks.developer.title`
- `quickLinks.student`
- `quickLinks.student.description`
- `quickLinks.student.tag`
- `quickLinks.student.title`
- `quickLinks.teacher`
- `quickLinks.teacher.description`
- `quickLinks.teacher.tag`
- `quickLinks.teacher.title`
- `search`
- `search.label`
- `search.matches`
- `search.noResults`
- `search.placeholder`
- `search.resultsCount`
- `search.searching`

**ko 缺失的 Key (35 個)**:
- `badge`
- `badge.aiGenerated`
- `feedback`
- `feedback.helpful`
- `feedback.notHelpful`
- `feedback.thanks`
- `feedback.title`
- `quickLinks`
- `quickLinks.admin`
- `quickLinks.admin.description`
- `quickLinks.admin.tag`
- `quickLinks.admin.title`
- `quickLinks.contestant`
- `quickLinks.contestant.description`
- `quickLinks.contestant.tag`
- `quickLinks.contestant.title`
- `quickLinks.developer`
- `quickLinks.developer.description`
- `quickLinks.developer.tag`
- `quickLinks.developer.title`
- `quickLinks.student`
- `quickLinks.student.description`
- `quickLinks.student.tag`
- `quickLinks.student.title`
- `quickLinks.teacher`
- `quickLinks.teacher.description`
- `quickLinks.teacher.tag`
- `quickLinks.teacher.title`
- `search`
- `search.label`
- `search.matches`
- `search.noResults`
- `search.placeholder`
- `search.resultsCount`
- `search.searching`

## 🔄 重複 Key 分析

發現 13 個出現在多個檔案中的 Key：

| Key | 出現位置 | 建議 |
|-----|----------|------|
| `message` | common.json, docs.json | 考慮整合至 common.json |
| `message.loading` | common.json, docs.json | 考慮整合至 common.json |
| `message.notFound` | common.json, docs.json | 考慮整合至 common.json |
| `nav` | common.json, docs.json | 考慮整合至 common.json |
| `page` | common.json, docs.json | 考慮整合至 common.json |
| `tabs` | problem.json, contest.json | 考慮整合至 common.json |
| `tabs.submissions` | problem.json, contest.json | 考慮整合至 common.json |
| `user` | common.json, admin.json | 考慮整合至 common.json |
| `user.role` | common.json, admin.json | 考慮整合至 common.json |
| `user.role.admin` | common.json, admin.json | 考慮整合至 common.json |
| `user.role.adminTA` | common.json, admin.json | 考慮整合至 common.json |
| `user.role.student` | common.json, admin.json | 考慮整合至 common.json |
| `user.role.teacher` | common.json, admin.json | 考慮整合至 common.json |

## 💡 改善建議
1. 同步缺失的翻譯 Key (共 70 個)
2. 考慮將 13 個重複的 Key 整合至 common.json
