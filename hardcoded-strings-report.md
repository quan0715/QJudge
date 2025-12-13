# 前端硬編碼字串掃描報告

## 📊 掃描摘要

- **包含硬編碼字串的檔案數**: 52
- **總共發現的硬編碼字串數**: 598

## 🔍 詳細清單

### 📄 domains/contest/pages/settings/ContestLogsPage.tsx

**發現 59 處硬編碼字串**

- **Line 165**: `data.push({ date, value: counts.violation, group: "違規事件" });`
- **Line 166**: `data.push({ date, value: counts.submission, group: "程式提交" });`
- **Line 167**: `data.push({ date, value: counts.lifecycle, group: "考試狀態" });`
- **Line 168**: `data.push({ date, value: counts.admin, group: "管理操作" });`
- **Line 182**: `title: "時間",`
- **Line 186**: `title: "事件數量",`
- **Line 195**: `違規事件: "#da1e28",`
- **Line 196**: `程式提交: "#0f62fe",`
- **Line 197**: `考試狀態: "#24a148",`
- **Line 198**: `管理操作: "#8a3ffc",`
- **Line 237**: `join: { label: "加入", type: "green" },`
- **Line 238**: `register: { label: "註冊", type: "green" },`
- **Line 239**: `unregister: { label: "取消註冊", type: "gray" },`
- **Line 240**: `enter_contest: { label: "進入競賽", type: "blue" },`
- **Line 241**: `leave: { label: "離開競賽", type: "gray" },`
- **Line 244**: `start_exam: { label: "開始考試", type: "cyan" },`
- **Line 245**: `end_exam: { label: "結束考試", type: "magenta" },`
- **Line 246**: `auto_submit: { label: "自動提交", type: "magenta" },`
- **Line 247**: `resume_exam: { label: "繼續考試", type: "cyan" },`
- **Line 248**: `reopen_exam: { label: "重新開放考試", type: "teal" },`
- **Line 249**: `pause_exam: { label: "暫停考試", type: "gray" },`
- **Line 252**: `submit: { label: "提交", type: "blue" },`
- **Line 253**: `submit_code: { label: "提交程式碼", type: "purple" },`
- **Line 256**: `tab_switch: { label: "切換分頁", type: "red" },`
- **Line 257**: `tab_hidden: { label: "隱藏分頁", type: "red" },`
- **Line 258**: `window_blur: { label: "離開視窗", type: "red" },`
- **Line 259**: `exit_fullscreen: { label: "退出全螢幕", type: "red" },`
- **Line 260**: `forbidden_focus_event: { label: "禁止焦點事件", type: "red" },`
- **Line 261**: `cheat_warning: { label: "違規警告", type: "red" },`
- **Line 264**: `lock: { label: "鎖定", type: "red" },`
- **Line 265**: `lock_user: { label: "鎖定用戶", type: "red" },`
- **Line 266**: `unlock: { label: "解鎖", type: "teal" },`
- **Line 267**: `unlock_user: { label: "解鎖用戶", type: "teal" },`
- **Line 270**: `ask_question: { label: "提問", type: "blue" },`
- **Line 271**: `reply_question: { label: "回覆提問", type: "blue" },`
- **Line 272**: `announce: { label: "發布公告", type: "magenta" },`
- **Line 275**: `update_contest: { label: "更新競賽設定", type: "cool-gray" },`
- **Line 276**: `update_problem: { label: "更新題目", type: "gray" },`
- **Line 277**: `update_participant: { label: "更新參與者", type: "gray" },`
- **Line 278**: `publish_problem_to_practice: { label: "發布到練習區", type: "cool-gray" },`
- **Line 279**: `other: { label: "其他", type: "outline" },`
- **Line 291**: `{ key: "timestamp", header: "時間" },`
- **Line 292**: `{ key: "userName", header: "使用者" },`
- **Line 293**: `{ key: "eventType", header: "事件類型" },`
- **Line 294**: `{ key: "reason", header: "詳細內容" },`
- **Line 316**: `title={notification.kind === "success" ? "成功" : "錯誤"}`
- **Line 329**: `title="事件時序圖"`
- **Line 335**: `labelA="隱藏"`
- **Line 336**: `labelB="顯示"`
- **Line 355**: `<span>📊 每 5 分鐘統計一次事件數量</span>`
- **Line 358**: `🕐 考試開始:{" "}`
- **Line 365**: `🏁 考試結束:{" "}`
- **Line 379**: `暫無事件資料可供視覺化`
- **Line 386**: `title="考試紀錄"`
- **Line 395**: `iconDescription="重新整理"`
- **Line 423**: `placeholder="搜尋事件..."`
- **Line 492**: `backwardText="上一頁"`
- **Line 493**: `forwardText="下一頁"`
- **Line 494**: `itemsPerPageText="每頁顯示"`

### 📄 domains/problem/components/ProblemForm.tsx

**發現 53 處硬編碼字串**

- **Line 351**: `title="錯誤"`
- **Line 360**: `title="成功"`
- **Line 377**: `<Switch name="basic" text="基本資訊" />`
- **Line 378**: `<Switch name="content" text="題目內容" />`
- **Line 379**: `<Switch name="testcases" text="測試案例" />`
- **Line 380**: `<Switch name="languages" text="語言設定" />`
- **Line 381**: `<Switch name="restrictions" text="程式碼限制" />`
- **Line 382**: `<Switch name="preview" text="預覽" />`
- **Line 390**: `匯入 YAML`
- **Line 401**: `labelText="題目標題 (全局) *"`
- **Line 402**: `placeholder="輸入題目標題..."`
- **Line 412**: `titleText="難度"`
- **Line 413**: `label="選擇難度"`
- **Line 415**: `{ id: 'easy', label: '簡單' },`
- **Line 416**: `{ id: 'medium', label: '中等' },`
- **Line 417**: `{ id: 'hard', label: '困難' }`
- **Line 421**: `{ id: 'easy', label: '簡單' },`
- **Line 422**: `{ id: 'medium', label: '中等' },`
- **Line 423**: `{ id: 'hard', label: '困難' }`
- **Line 432**: `label="時間限制 (ms)"`
- **Line 443**: `label="記憶體限制 (MB)"`
- **Line 455**: `labelText="題目可見性"`
- **Line 456**: `labelA="隱藏"`
- **Line 457**: `labelB="可見"`
- **Line 472**: `titleText="標籤"`
- **Line 473**: `placeholder="搜尋或建立標籤..."`
- **Line 483**: `語言版本 / Language Versions`
- **Line 486**: `展開下方的區塊來編輯各語言版本的題目內容`
- **Line 491**: `<AccordionItem title="中文 (繁體)" open>`
- **Line 496**: `labelText="題目標題 *"`
- **Line 497**: `placeholder="輸入標題..."`
- **Line 505**: `labelText="題目描述 (Markdown)"`
- **Line 515**: `labelText="輸入說明 (Markdown)"`
- **Line 525**: `labelText="輸出說明 (Markdown)"`
- **Line 535**: `labelText="提示 (Markdown)"`
- **Line 606**: `設定題目的測試案例。公開的測資會顯示給學生作為範例，隱藏的測資用於評分。`
- **Line 630**: `<h4 style={{ marginBottom: '1rem', fontWeight: 600 }}>允許的程式語言</h4>`
- **Line 640**: `labelA="停用"`
- **Line 641**: `labelB="啟用"`
- **Line 658**: `範本程式碼`
- **Line 694**: `<h4 style={{ marginBottom: '1rem', fontWeight: 600 }}>程式碼關鍵字限制</h4>`
- **Line 696**: `設定學生提交的程式碼必須包含或禁止使用的關鍵字。常用於要求特定函式簽名或禁用標準庫函式。`
- **Line 702**: `必須包含的關鍵字`
- **Line 705**: `程式碼中必須包含這些字串（子字串匹配）。例如：特定函式簽名 <code>void printRectangle(int w, int h, char c)</code>`
- **Line 712**: `placeholder="輸入必須關鍵字..."`
- **Line 735**: `新增`
- **Line 776**: `禁止使用的關鍵字`
- **Line 779**: `程式碼中不可包含這些字串。例如：禁用 <code>sort</code>、<code>qsort</code> 等標準庫函式`
- **Line 786**: `placeholder="輸入禁用關鍵字..."`
- **Line 809**: `新增`
- **Line 892**: `刪除題目`
- **Line 898**: `<Button kind="secondary" onClick={onCancel}>取消</Button>`
- **Line 904**: `{loading ? '儲存中...' : (isEditMode ? '更新題目' : '建立題目')}`

### 📄 domains/contest/pages/settings/ContestParticipantsPage.tsx

**發現 51 處硬編碼字串**

- **Line 67**: `{ id: "not_started", label: "未開始" },`
- **Line 68**: `{ id: "in_progress", label: "進行中" },`
- **Line 69**: `{ id: "paused", label: "已暫停" },`
- **Line 70**: `{ id: "locked", label: "已鎖定" },`
- **Line 71**: `{ id: "submitted", label: "已交卷" },`
- **Line 76**: `{ id: "all", label: "全部狀態" },`
- **Line 99**: `setNotification({ kind: "error", message: "無法載入參賽者列表" });`
- **Line 108**: `setNotification({ kind: "success", message: "參賽者已新增" });`
- **Line 112**: `message: error.message || "新增參賽者失敗",`
- **Line 119**: `if (!contestId || !confirm("確定要解除此學生的鎖定嗎？")) return;`
- **Line 123**: `setNotification({ kind: "success", message: "已解除鎖定" });`
- **Line 127**: `message: error.message || "解除鎖定失敗",`
- **Line 149**: `setNotification({ kind: "success", message: "參賽者狀態已更新" });`
- **Line 151**: `setNotification({ kind: "error", message: error.message || "更新失敗" });`
- **Line 158**: `if (!contestId || !confirm("確定要重新開放此學生考試嗎？")) return;`
- **Line 162**: `setNotification({ kind: "success", message: "已重新開放考試" });`
- **Line 166**: `message: error.message || "重新開放失敗",`
- **Line 172**: `if (!contestId || !confirm(`確定要移除參賽者 ${username} 嗎？`)) return;`
- **Line 176**: `setNotification({ kind: "success", message: "參賽者已移除" });`
- **Line 180**: `message: error.message || "移除參賽者失敗",`
- **Line 187**: `{ key: "username", header: "使用者" },`
- **Line 188**: `{ key: "joinedAt", header: "加入時間" },`
- **Line 189**: `{ key: "status", header: "狀態" },`
- **Line 190**: `{ key: "lockReason", header: "鎖定原因" },`
- **Line 191**: `{ key: "actions", header: "操作" },`
- **Line 225**: `title={notification.kind === "success" ? "成功" : "錯誤"}`
- **Line 233**: `title="參賽者列表"`
- **Line 243**: `iconDescription="重新整理"`
- **Line 250**: `新增`
- **Line 267**: `titleText="篩選狀態"`
- **Line 268**: `label="選擇狀態"`
- **Line 287**: `顯示 {filteredParticipants.length} / {participants.length}{" "}`
- **Line 288**: `位參賽者`
- **Line 348**: `已鎖定`
- **Line 353**: `已交卷`
- **Line 358**: `進行中`
- **Line 363**: `已暫停`
- **Line 369**: `未開始`
- **Line 382**: `iconDescription="解除鎖定"`
- **Line 392**: `iconDescription="重新開放考試"`
- **Line 403**: `iconDescription="編輯狀態"`
- **Line 411**: `iconDescription="移除參賽者"`
- **Line 432**: `backwardText="上一頁"`
- **Line 433**: `forwardText="下一頁"`
- **Line 434**: `itemsPerPageText="每頁顯示"`
- **Line 455**: `modalHeading={`編輯參賽者: ${editingParticipant?.username}`}`
- **Line 456**: `primaryButtonText={saving ? "儲存中..." : "儲存變更"}`
- **Line 457**: `secondaryButtonText="取消"`
- **Line 467**: `titleText="考試狀態"`
- **Line 468**: `label="選擇狀態"`
- **Line 482**: `labelText="鎖定原因"`

### 📄 domains/contest/components/ContestClarifications.tsx

**發現 43 處硬編碼字串**

- **Line 121**: `showError('發布失敗，請檢查輸入內容');`
- **Line 139**: `showError('發布公告失敗');`
- **Line 159**: `if (!confirm('確定要刪除此提問？')) return;`
- **Line 170**: `if (!confirm('確定要刪除此公告？')) return;`
- **Line 187**: `return <div>載入中...</div>;`
- **Line 194**: `title="公告"`
- **Line 196**: `label: "發布公告",`
- **Line 207**: `目前沒有任何公告`
- **Line 230**: `iconDescription="刪除公告"`
- **Line 258**: `title="學生提問與討論"`
- **Line 260**: `label: "提出問題",`
- **Line 270**: `目前還沒有任何提問`
- **Line 293**: `<Tag type="green" size="sm">公開</Tag>`
- **Line 295**: `<Tag type="gray" size="sm">私密</Tag>`
- **Line 297**: `{clar.answer && <Tag type="purple" size="sm">已回覆</Tag>}`
- **Line 308**: `回覆`
- **Line 315**: `iconDescription="刪除"`
- **Line 329**: `提問者: {clar.authorUsername} · {new Date(clar.createdAt).toLocaleString()}`
- **Line 348**: `<span>回覆:</span>`
- **Line 350**: `<Tag type="green" size="sm">公開回覆</Tag>`
- **Line 352**: `<Tag type="gray" size="sm">僅提問者可見</Tag>`
- **Line 360**: `回覆者: {clar.answeredBy}`
- **Line 375**: `modalHeading="提出問題"`
- **Line 376**: `primaryButtonText="送出"`
- **Line 377**: `secondaryButtonText="取消"`
- **Line 384**: `labelText="問題內容"`
- **Line 387**: `placeholder="請清楚描述您的問題..."`
- **Line 394**: `labelText="相關題目（選填）"`
- **Line 398**: `<SelectItem value="" text="一般提問" />`
- **Line 413**: `modalHeading="發布公告"`
- **Line 414**: `primaryButtonText="發布"`
- **Line 415**: `secondaryButtonText="取消"`
- **Line 422**: `labelText="公告標題"`
- **Line 425**: `placeholder="輸入標題..."`
- **Line 431**: `labelText="公告內容"`
- **Line 434**: `placeholder="輸入內容..."`
- **Line 443**: `modalHeading="回覆提問"`
- **Line 444**: `primaryButtonText="送出回覆"`
- **Line 445**: `secondaryButtonText="取消"`
- **Line 452**: `labelText="回覆內容"`
- **Line 455**: `placeholder="輸入回覆..."`
- **Line 461**: `labelText="公開回覆（所有參賽者可見）"`
- **Line 470**: `modalHeading="錯誤"`

### 📄 domains/problem/components/common/TestCaseList.tsx

**發現 36 處硬編碼字串**

- **Line 105**: `setAddError('輸入不得為空');`
- **Line 109**: `setAddError('預期輸出不得為空');`
- **Line 169**: `新增測資`
- **Line 177**: `modalHeading="新增測試案例"`
- **Line 178**: `primaryButtonText="儲存"`
- **Line 179**: `secondaryButtonText="取消"`
- **Line 185**: `<FormLabel>輸入 (Input) *</FormLabel>`
- **Line 194**: `placeholder="請輸入測試資料..."`
- **Line 195**: `invalid={addError.includes('輸入')}`
- **Line 200**: `<FormLabel>預期輸出 (Expected Output) *</FormLabel>`
- **Line 209**: `placeholder="請輸入預期輸出..."`
- **Line 210**: `invalid={addError.includes('輸出')}`
- **Line 218**: `label="分數 (Score)"`
- **Line 233**: `labelText="測資可見性"`
- **Line 234**: `labelA="公開 (學生可見)"`
- **Line 235**: `labelB="隱藏 (學生不可見)"`
- **Line 258**: `無測試案例`
- **Line 287**: `{item.score ?? 0} 分`
- **Line 298**: `{item.isHidden ? '隱藏' : '公開'}`
- **Line 308**: `{item.source === 'public' ? '公開測資' : '自訂測資'}`
- **Line 343**: `labelText="可見性"`
- **Line 344**: `labelA="隱藏"`
- **Line 345**: `labelB="公開"`
- **Line 354**: `labelText="範例測資"`
- **Line 355**: `labelA="否"`
- **Line 356**: `labelB="是"`
- **Line 373**: `編輯`
- **Line 383**: `刪除`
- **Line 408**: `<FormLabel style={{ marginBottom: '0.25rem' }}>輸入 (Input)</FormLabel>`
- **Line 417**: `<FormLabel style={{ marginBottom: '0.25rem' }}>預期輸出 (Expected Output)</FormLabel>`
- **Line 429**: `label="分數 (Score)"`
- **Line 437**: `<Button kind="secondary" size="sm" onClick={cancelEdit}>取消</Button>`
- **Line 462**: `<Locked size={16} /> 這是隱藏測資，無法查看詳細內容`
- **Line 475**: `<FormLabel style={{ marginBottom: '0.25rem' }}>輸入 (Input)</FormLabel>`
- **Line 494**: `<FormLabel style={{ marginBottom: '0.25rem' }}>預期輸出 (Expected Output)</FormLabel>`
- **Line 514**: `<FormLabel style={{ marginBottom: '0.25rem' }}>實際輸出 (Actual Output)</FormLabel>`

### 📄 domains/problem/components/solver/ProblemStatsTab.tsx

**發現 32 處硬編碼字串**

- **Line 57**: `if (ac > 0) outer.push({ group: "通過 (AC)", value: ac });`
- **Line 58**: `if (nonAc > 0) outer.push({ group: "未通過", value: nonAc });`
- **Line 62**: `if (ac > 0) inner.push({ group: "通過 (AC)", value: ac });`
- **Line 63**: `if (wa > 0) inner.push({ group: "答案錯誤 (WA)", value: wa });`
- **Line 64**: `if (tle > 0) inner.push({ group: "時間超限 (TLE)", value: tle });`
- **Line 65**: `if (mle > 0) inner.push({ group: "記憶體超限 (MLE)", value: mle });`
- **Line 66**: `if (re > 0) inner.push({ group: "執行錯誤 (RE)", value: re });`
- **Line 67**: `if (ce > 0) inner.push({ group: "編譯錯誤 (CE)", value: ce });`
- **Line 124**: `group: "提交次數",`
- **Line 141**: `"通過 (AC)": "#24a148",`
- **Line 142**: `未通過: "#da1e28",`
- **Line 143**: `"答案錯誤 (WA)": "#fa4d56",`
- **Line 144**: `"時間超限 (TLE)": "#f1c21b",`
- **Line 145**: `"記憶體超限 (MLE)": "#ff832b",`
- **Line 146**: `"執行錯誤 (RE)": "#a56eff",`
- **Line 147**: `"編譯錯誤 (CE)": "#0f62fe",`
- **Line 157**: `label: "通過率",`
- **Line 183**: `label: "通過率",`
- **Line 208**: `{ key: "rank", header: "排名" },`
- **Line 209**: `{ key: "username", header: "使用者" },`
- **Line 210**: `{ key: "language", header: "語言" },`
- **Line 211**: `{ key: "execTime", header: "執行時間" },`
- **Line 229**: `title="提交結果分佈"`
- **Line 236**: `label={showDetailedView ? "簡化視圖" : "詳細分析"}`
- **Line 283**: `{acceptedCount} / {submissionCount} 次通過`
- **Line 298**: `尚無提交資料`
- **Line 312**: `<span>排行榜</span>`
- **Line 431**: `尚無通過記錄`
- **Line 439**: `<ContainerCard title="最近提交趨勢" style={{ minHeight: "300px" }}>`
- **Line 465**: `title: "提交數",`
- **Line 472**: `scale: { 提交次數: "#0f62fe" },`
- **Line 491**: `尚無提交資料`

### 📄 domains/submission/components/SubmissionTable.tsx

**發現 22 處硬編碼字串**

- **Line 36**: `{ id: "all", label: "全部狀態" },`
- **Line 37**: `{ id: "AC", label: "通過 (AC)" },`
- **Line 38**: `{ id: "WA", label: "答案錯誤 (WA)" },`
- **Line 39**: `{ id: "TLE", label: "超時 (TLE)" },`
- **Line 40**: `{ id: "MLE", label: "記憶體超限 (MLE)" },`
- **Line 41**: `{ id: "RE", label: "執行錯誤 (RE)" },`
- **Line 42**: `{ id: "CE", label: "編譯錯誤 (CE)" },`
- **Line 125**: `{ key: "status", header: "狀態" },`
- **Line 129**: `headers.push({ key: "problem", header: "題目" });`
- **Line 133**: `headers.push({ key: "username", header: "用戶" });`
- **Line 136**: `headers.push({ key: "language", header: "語言" });`
- **Line 139**: `headers.push({ key: "score", header: "得分" });`
- **Line 143**: `{ key: "time", header: "時間" },`
- **Line 144**: `{ key: "created_at", header: "提交時間" },`
- **Line 145**: `{ key: "actions", header: "操作" }`
- **Line 165**: `iconDescription="查看詳情"`
- **Line 177**: `iconDescription="無權限查看"`
- **Line 241**: `label="狀態篩選"`
- **Line 270**: `labelA="全部"`
- **Line 271**: `labelB="我的"`
- **Line 293**: `iconDescription="重新整理"`
- **Line 295**: `{isRefreshing ? "更新中..." : "重新整理"}`

### 📄 domains/problem/components/ProblemTable.tsx

**發現 20 處硬編碼字串**

- **Line 84**: `{ key: "tags", header: "標籤" },`
- **Line 85**: `{ key: "difficulty", header: "難度" },`
- **Line 86**: `{ key: "acceptance_rate", header: "通過率" },`
- **Line 91**: `{ key: "label", header: "標號" },`
- **Line 93**: `{ key: "difficulty", header: "難度" },`
- **Line 94**: `{ key: "tags", header: "標籤" },`
- **Line 95**: `{ key: "score", header: "分數" },`
- **Line 104**: `{ key: "title", header: "題目" },`
- **Line 105**: `{ key: "difficulty", header: "難度" },`
- **Line 106**: `{ key: "tags", header: "標籤" },`
- **Line 107**: `{ key: "visibility", header: "狀態" },`
- **Line 140**: `placeholder="搜尋題目..."`
- **Line 148**: `匯入 YAML`
- **Line 153**: `新增題目`
- **Line 260**: `iconDescription="往上移動"`
- **Line 272**: `iconDescription="往下移動"`
- **Line 297**: `移除`
- **Line 461**: `<Tag type="green">可見</Tag>`
- **Line 463**: `<Tag type="gray">隱藏</Tag>`
- **Line 476**: `編輯`

### 📄 domains/contest/pages/ContestCreatePage.tsx

**發現 20 處硬編碼字串**

- **Line 30**: `setError('請輸入競賽名稱');`
- **Line 35**: `setError('私人競賽需要設定密碼');`
- **Line 61**: `setError(err.message || '建立競賽失敗');`
- **Line 69**: `<h1 style={{ marginBottom: '2rem' }}>建立新競賽</h1>`
- **Line 77**: `title="錯誤"`
- **Line 86**: `title="提示"`
- **Line 87**: `subtitle="建立競賽時只需填寫基本資訊，其餘設定（開始/結束時間、題目等）可在建立後編輯"`
- **Line 93**: `labelText="競賽名稱"`
- **Line 94**: `placeholder="輸入競賽名稱"`
- **Line 102**: `labelText="競賽敘述"`
- **Line 103**: `placeholder="輸入競賽敘述"`
- **Line 110**: `labelText="競賽規則 (支援 Markdown)"`
- **Line 111**: `placeholder="輸入競賽規則"`
- **Line 118**: `legendText="可見性"`
- **Line 125**: `labelText="公開 - 所有人都可以看到並加入此競賽"`
- **Line 130**: `labelText="私人 - 需要密碼才能加入此競賽"`
- **Line 140**: `labelText="競賽密碼"`
- **Line 144**: `placeholder="請輸入密碼"`
- **Line 153**: `{creating ? '建立中...' : '建立競賽'}`
- **Line 160**: `取消`

### 📄 domains/contest/pages/settings/ContestProblemsPage.tsx

**發現 19 處硬編碼字串**

- **Line 87**: `setNotification({ kind: 'success', message: '題目已新增' });`
- **Line 90**: `setNotification({ kind: 'error', message: '新增題目失敗，請確認 ID 或標題正確' });`
- **Line 97**: `if (!contestId || !confirm('確定要從競賽中移除此題目嗎？')) return;`
- **Line 101**: `setNotification({ kind: 'success', message: '題目已移除' });`
- **Line 104**: `setNotification({ kind: 'error', message: '移除題目失敗' });`
- **Line 113**: `title="題目管理"`
- **Line 114**: `subtitle="管理競賽題目，您可以從現有題庫新增或建立新題目"`
- **Line 119**: `匯入 YAML`
- **Line 122**: `新增題目`
- **Line 132**: `title={notification.kind === 'success' ? '成功' : '錯誤'}`
- **Line 157**: `setNotification({ kind: 'error', message: '調整順序失敗' });`
- **Line 170**: `modalHeading="新增競賽題目"`
- **Line 171**: `primaryButtonText={adding ? "新增中..." : "新增"}`
- **Line 172**: `secondaryButtonText="取消"`
- **Line 179**: `請輸入題目 ID (從題庫加入) 或 題目標題 (建立新題目)。`
- **Line 185**: `titleText="從題庫與範本選擇 (Clone)"`
- **Line 186**: `placeholder="搜尋題目 ID 或標題..."`
- **Line 203**: `labelText="或者建立空白新題目"`
- **Line 204**: `placeholder="輸入新題目名稱"`

### 📄 domains/contest/pages/settings/ContestAdminsPage.tsx

**發現 16 處硬編碼字串**

- **Line 56**: `setNotification({ kind: "error", message: "無法載入管理員列表" });`
- **Line 67**: `message: `成功新增管理員: ${username}`,`
- **Line 72**: `setNotification({ kind: "error", message: error.message || "新增失敗" });`
- **Line 79**: `if (!confirm(`確定要移除管理員 ${admin.username}？`)) return;`
- **Line 85**: `message: `已移除管理員: ${admin.username}`,`
- **Line 89**: `setNotification({ kind: "error", message: error.message || "移除失敗" });`
- **Line 101**: `{ key: "username", header: "用戶名" },`
- **Line 102**: `{ key: "actions", header: "操作" },`
- **Line 118**: `title={notification.kind === "success" ? "成功" : "錯誤"}`
- **Line 126**: `title="競賽管理員"`
- **Line 136**: `iconDescription="重新整理"`
- **Line 143**: `新增`
- **Line 163**: `擁有者 (Owner)`
- **Line 166**: `{contest?.permissions?.canEditContest ? "您" : "N/A"}`
- **Line 179**: `尚無其他管理員`
- **Line 220**: `iconDescription="移除"`

### 📄 domains/submission/components/SubmissionDetailModal.tsx

**發現 13 處硬編碼字串**

- **Line 166**: `<h2 style={{ marginBottom: '1rem' }}>權限不足</h2>`
- **Line 168**: `您沒有權限查看此提交的詳細內容。`
- **Line 173**: `<p>提交不存在或無法載入</p>`
- **Line 193**: `<span>提交 #{submission.id}</span>`
- **Line 225**: `...<DataCard title="提交狀態" value={getStatusCo...`
- **Line 228**: `<DataCard title="得分" value={submission.score || 0} unit="分" description={`題目總得分`}/>`
- **Line 229**: `<DataCard title="執行時間" value={submission.execTime || 0} unit="ms" description={`題目總執行時間`}/>`
- **Line 230**: `<DataCard title="記憶體使用" value={submission.memoryUsage || 0} unit="MB" description={`題目總記憶體使用`}/>`
- **Line 237**: `錯誤訊息`
- **Line 259**: `<Tab>程式碼</Tab>`
- **Line 260**: `<Tab>測試結果</Tab>`
- **Line 292**: `iconDescription={isCopied ? '已複製' : '複製程式碼'}`
- **Line 359**: `暫無測試結果`

### 📄 domains/problem/components/ProblemImportModal.tsx

**發現 12 處硬編碼字串**

- **Line 187**: `— 或 —`
- **Line 229**: `title="解析中..."`
- **Line 230**: `subtitle="請稍候，正在驗證您的文件"`
- **Line 238**: `title="驗證錯誤"`
- **Line 239**: `subtitle={`在 YAML 文件中發現 ${errors.length} 個錯誤`}`
- **Line 256**: `title="匯入成功"`
- **Line 257**: `subtitle="題目已成功創建，正在跳轉到題目預覽..."`
- **Line 265**: `<h4 style={{ marginBottom: "1rem" }}>預覽</h4>`
- **Line 376**: `分數: {tc.score} | 順序: {tc.order}`
- **Line 387**: `... 還有 {parsedData.test_cases.length - 5} 個`
- **Line 396**: `title={`程式語言模板 (${parsedData.language_configs.length})`}`
- **Line 414**: `啟用`

### 📄 domains/contest/components/ContestSidebar.tsx

**發現 12 處硬編碼字串**

- **Line 72**: `返回題目列表`
- **Line 91**: `剩餘時間`
- **Line 108**: `{contest.problems?.length || 0} 題`
- **Line 124**: `個人進度`
- **Line 136**: `已完成`
- **Line 144**: `總分`
- **Line 161**: `<span>完成率</span>`
- **Line 195**: `題目列表`
- **Line 247**: `<span>{problem.score} 分</span>`
- **Line 263**: `暫無題目`
- **Line 284**: `最新公告`
- **Line 302**: `暫無公告`

### 📄 domains/contest/pages/settings/ContestAdminOverview.tsx

**發現 11 處硬編碼字串**

- **Line 35**: `<User /> 參賽者`
- **Line 40**: `管理參賽者 <ArrowRight />`
- **Line 52**: `<Folder /> 題目數量`
- **Line 57**: `管理題目 <ArrowRight />`
- **Line 67**: `<h6 style={{ marginBottom: '0.5rem', color: 'var(--cds-text-secondary)' }}>競賽時間</h6>`
- **Line 70**: `<div style={{ fontSize: '0.875rem' }}>開始時間</div>`
- **Line 76**: `<div style={{ fontSize: '0.875rem' }}>結束時間</div>`
- **Line 85**: `修改設定 <ArrowRight />`
- **Line 94**: `<ContainerCard title="最近活動 (Recent Activity)" noPadding>`
- **Line 98**: `尚無活動紀錄`
- **Line 130**: `查看所有紀錄 <ArrowRight />`

### 📄 domains/problem/components/solver/ProblemTabsContent.tsx

**發現 10 處硬編碼字串**

- **Line 21**: `title="題目"`
- **Line 145**: `title: "更新成功",`
- **Line 146**: `subtitle: "題目已成功更新",`
- **Line 155**: `title: "更新失敗",`
- **Line 156**: `subtitle: error.message || "請稍後再試",`
- **Line 164**: `if (!confirm(`確定要刪除題目「${problem.title}」嗎？此操作無法復原。`)) {`
- **Line 172**: `title: "刪除成功",`
- **Line 173**: `subtitle: "正在跳轉...",`
- **Line 180**: `title: "刪除失敗",`
- **Line 181**: `subtitle: error.message || "請稍後再試",`

### 📄 app/pages/ServerErrorPage.tsx

**發現 10 處硬編碼字串**

- **Line 36**: `return "內部伺服器錯誤";`
- **Line 38**: `return "閘道錯誤";`
- **Line 40**: `return "服務暫時無法使用";`
- **Line 42**: `return "閘道逾時";`
- **Line 44**: `return "伺服器錯誤";`
- **Line 121**: `伺服器暫時無法處理您的請求，`
- **Line 123**: `請稍後再試或聯繫系統管理員。`
- **Line 140**: `重新整理`
- **Line 149**: `返回首頁`
- **Line 163**: `錯誤時間：{state.timestamp}`

### 📄 core/config/statusConfig.ts

**發現 10 處硬編碼字串**

- **Line 10**: `'AC': { color: 'green', label: '通過', type: 'green' },`
- **Line 11**: `'WA': { color: 'red', label: '答案錯誤', type: 'red' },`
- **Line 12**: `'TLE': { color: 'purple', label: '超時', type: 'purple' },`
- **Line 13**: `'MLE': { color: 'purple', label: '記憶體超限', type: 'purple' },`
- **Line 14**: `'RE': { color: 'red', label: '執行錯誤', type: 'red' },`
- **Line 15**: `'CE': { color: 'red', label: '編譯錯誤', type: 'red' },`
- **Line 16**: `'NS': { color: 'gray', label: '未提交', type: 'gray' },`
- **Line 17**: `'pending': { color: 'gray', label: '等待中', type: 'gray' },`
- **Line 18**: `'judging': { color: 'blue', label: '評測中', type: 'blue' },`
- **Line 19**: `'SE': { color: 'red', label: '系統錯誤', type: 'red' },`

### 📄 domains/contest/components/ExamEventStats.tsx

**發現 9 處硬編碼字串**

- **Line 61**: `{ key: "userName", header: "參賽者" },`
- **Line 62**: `{ key: "tabHiddenCount", header: "切換分頁" },`
- **Line 63**: `{ key: "windowBlurCount", header: "視窗失焦" },`
- **Line 64**: `{ key: "exitFullscreenCount", header: "退出全螢幕" },`
- **Line 65**: `{ key: "totalViolations", header: "總違規次數" },`
- **Line 78**: `return <div>載入中...</div>;`
- **Line 85**: `title="暫無事件記錄"`
- **Line 86**: `subtitle="目前沒有記錄到任何考試違規事件"`
- **Line 95**: `<TableContainer title="考試事件統計">`

### 📄 domains/problem/components/ProblemSubmissionHistory.tsx

**發現 8 處硬編碼字串**

- **Line 61**: `{ key: "status", header: "狀態" },`
- **Line 62**: `{ key: "language", header: "語言" },`
- **Line 63**: `{ key: "score", header: "得分" },`
- **Line 64**: `{ key: "time", header: "時間" },`
- **Line 65**: `{ key: "created_at", header: "提交時間" },`
- **Line 142**: `backwardText="上一頁"`
- **Line 143**: `forwardText="下一頁"`
- **Line 144**: `itemsPerPageText="每頁顯示"`

### 📄 domains/contest/pages/ContestListPage.tsx

**發現 8 處硬編碼字串**

- **Line 73**: `{ key: "userStatus", header: "您的狀態" },`
- **Line 177**: `{!contest.isRegistered && <Tag type="gray">未報名</Tag>}`
- **Line 189**: `查看詳情`
- **Line 254**: `subtitle="參加競賽，與其他同學切磋程式解題技巧。"`
- **Line 261**: `管理競賽`
- **Line 284**: `: renderEmptyState("目前並沒有可報名的競賽")}`
- **Line 291**: `: renderEmptyState("沒有即將開始的競賽")}`
- **Line 298**: `: renderEmptyState("沒有已結束的競賽")}`

### 📄 domains/problem/pages/ProblemDetail.tsx

**發現 7 處硬編碼字串**

- **Line 93**: `<Tab disabled>題目描述</Tab>`
- **Line 94**: `<Tab disabled>程式碼</Tab>`
- **Line 95**: `<Tab disabled>提交紀錄</Tab>`
- **Line 96**: `<Tab disabled>統計</Tab>`
- **Line 160**: `setError("無法載入題目資料");`
- **Line 189**: `throw new Error(err.message || "提交失敗，請檢查輸入並稍後再試");`
- **Line 226**: `題目不存在`

### 📄 domains/contest/pages/ContestProblemPage.tsx

**發現 7 處硬編碼字串**

- **Line 106**: `throw new Error(err.message || "提交失敗");`
- **Line 114**: `<h3>錯誤</h3>`
- **Line 120**: `返回競賽`
- **Line 124**: `if (!problem) return <div>題目不存在</div>;`
- **Line 138**: `<h3>無法查看題目</h3>`
- **Line 139**: `<p>比賽尚未開始、已結束，或您已被鎖定。</p>`
- **Line 144**: `返回競賽大廳`

### 📄 domains/contest/components/layout/ContestLayout.tsx

**發現 7 處硬編碼字串**

- **Line 89**: `e.returnValue = "考試進行中，離開或刷新頁面將自動交卷。";`
- **Line 251**: `showError(error.message || "無法加入競賽，請檢查密碼或稍後再試");`
- **Line 257**: `if (!confirm("確定要退出此競賽嗎？")) return;`
- **Line 263**: `showError("無法退出競賽，請稍後再試");`
- **Line 301**: `"無法開始考試，請稍後再試";`
- **Line 314**: `showError("無法交卷，請稍後再試");`
- **Line 346**: `showError("無法離開競賽，請稍後再試");`

### 📄 domains/problem/components/DraggableProblemList.tsx

**發現 6 處硬編碼字串**

- **Line 96**: `iconDescription="移除題目"`
- **Line 207**: `<div>標號</div>`
- **Line 208**: `<div>標題</div>`
- **Line 209**: `<div>難度</div>`
- **Line 210**: `<div>分數</div>`
- **Line 240**: `尚無題目，請新增題目`

### 📄 domains/problem/components/common/TagSelect.tsx

**發現 6 處硬編碼字串**

- **Line 40**: `titleText = '標籤',`
- **Line 41**: `placeholder = '搜尋並選擇標籤...'`
- **Line 163**: `title="新標籤（儲存時建立）"`
- **Line 245**: `建立新標籤：「{searchText}」`
- **Line 299**: `{searchText ? '找不到符合的標籤' : '沒有可用的標籤'}`
- **Line 314**: `綠色標籤為新增標籤，將在儲存時建立`

### 📄 domains/contest/components/modals/AddAdminModal.tsx

**發現 6 處硬編碼字串**

- **Line 42**: `modalHeading="新增管理員"`
- **Line 43**: `primaryButtonText={adding ? "新增中..." : "新增"}`
- **Line 44**: `secondaryButtonText="取消"`
- **Line 51**: `labelText="用戶名"`
- **Line 52**: `placeholder="輸入用戶名"`
- **Line 58**: `管理員可以管理競賽設定、參賽者和題目，但無法新增或移除其他管理員。`

### 📄 domains/docs/components/DocsSearchDropdown.tsx

**發現 6 處硬編碼字串**

- **Line 80**: `placeholder={t("search.placeholder", "搜尋文檔內容...")}`
- **Line 81**: `labelText={t("search.label", "搜尋文檔")}`
- **Line 134**: `{t("search.searching", "搜尋中...")}`
- **Line 148**: `defaultValue: `找到 ${results.length} 個結果`,`
- **Line 201**: `{t("search.matches", { defaultValue: "處符合" })}`
- **Line 244**: `{t("search.noResults", "找不到符合的內容")}`

### 📄 ui/components/ErrorBoundary.tsx

**發現 6 處硬編碼字串**

- **Line 131**: `Oops! 發生錯誤`
- **Line 141**: `很抱歉，應用程式遇到了意外錯誤。請嘗試重新整理頁面或返回首頁。`
- **Line 146**: `title="錯誤詳情"`
- **Line 147**: `subtitle={this.state.error?.message || "未知錯誤"}`
- **Line 200**: `重新整理`
- **Line 208**: `返回首頁`

### 📄 models/contest.ts

**發現 5 處硬編碼字串**

- **Line 264**: `return '即將開始';`
- **Line 266**: `return '進行中';`
- **Line 268**: `return '已結束';`
- **Line 270**: `return '未開放';`
- **Line 272**: `return '未知';`

### 📄 domains/problem/components/solver/ProblemCodingTab.tsx

**發現 5 處硬編碼字串**

- **Line 54**: `title="程式碼編輯器"`
- **Line 84**: `繳交`
- **Line 101**: `title="測試案例"`
- **Line 110**: `新增測資`
- **Line 119**: `{running ? '執行中...' : '執行測試'}`

### 📄 domains/problem/components/layout/ProblemTabs.tsx

**發現 5 處硬編碼字串**

- **Line 25**: `{ label: "題目", key: "description" },`
- **Line 26**: `{ label: "解題與提交", key: "solver" },`
- **Line 27**: `{ label: "提交記錄", key: "history" },`
- **Line 28**: `{ label: "解題統計", key: "stats" },`
- **Line 32**: `tabs.push({ label: "設定題目", key: "settings" });`

### 📄 domains/contest/components/ContestScoreboard.tsx

**發現 5 處硬編碼字串**

- **Line 76**: `{ key: "rank", header: "排名" },`
- **Line 77**: `{ key: "user", header: "參與者" },`
- **Line 78**: `{ key: "solved", header: "解題數" },`
- **Line 79**: `{ key: "total_score", header: "總分" },`
- **Line 80**: `{ key: "time", header: "罰時" },`

### 📄 domains/contest/components/modals/AddParticipantModal.tsx

**發現 5 處硬編碼字串**

- **Line 42**: `modalHeading="新增參賽者"`
- **Line 43**: `primaryButtonText={adding ? "新增中..." : "新增"}`
- **Line 44**: `secondaryButtonText="取消"`
- **Line 51**: `labelText="使用者名稱 (Username)"`
- **Line 52**: `placeholder="輸入要加入的使用者名稱"`

### 📄 app/pages/NotFoundPage.tsx

**發現 5 處硬編碼字串**

- **Line 88**: `頁面不存在`
- **Line 99**: `您要找的頁面可能已被移除、名稱已更改，`
- **Line 101**: `或是暫時無法使用。`
- **Line 118**: `返回首頁`
- **Line 127**: `上一頁`

### 📄 ui/components/DatabaseSwitcher.tsx

**發現 5 處硬編碼字串**

- **Line 56**: `setSuccessMessage("同步資料庫中...");`
- **Line 60**: `setSuccessMessage("切換資料庫中...");`
- **Line 64**: ``已切換至 ${targetDb === "cloud" ? "雲端" : "本地"} 資料庫``
- **Line 87**: `<InlineLoading description="載入中..." />`
- **Line 184**: `<InlineLoading description={successMessage || "處理中..."} />`

### 📄 core/entities/contest.entity.ts

**發現 5 處硬編碼字串**

- **Line 244**: `return "即將開始";`
- **Line 246**: `return "進行中";`
- **Line 248**: `return "已結束";`
- **Line 250**: `return "未開放";`
- **Line 252**: `return "未知";`

### 📄 core/config/contestStateConfig.ts

**發現 4 處硬編碼字串**

- **Line 10**: `'active': { color: 'green', label: '進行中', type: 'green' },`
- **Line 11**: `'inactive': { color: 'blue', label: '未開始', type: 'blue' },`
- **Line 12**: `'ended': { color: 'gray', label: '已結束', type: 'gray' },`
- **Line 13**: `'archived': { color: 'purple', label: '已封存', type: 'purple' },`

### 📄 domains/admin/pages/EnvironmentPage.tsx

**發現 3 處硬編碼字串**

- **Line 581**: `<h4 style={{ marginBottom: "1rem" }}>資料庫同步</h4>`
- **Line 589**: `將資料從一個資料庫同步到另一個。同步前會自動執行目標資料庫的遷移。注意：此操作會覆蓋目標資料庫的資料。`
- **Line 605**: `本地 → 雲端`

### 📄 domains/admin/pages/ProblemFormPage.tsx

**發現 3 處硬編碼字串**

- **Line 45**: `setSuccess('題目更新成功！');`
- **Line 48**: `setSuccess('題目建立成功！');`
- **Line 53**: `setError(err.message || '操作失敗');`

### 📄 domains/docs/pages/DocumentationPage.tsx

**發現 3 處硬編碼字串**

- **Line 186**: `{t("nav.productLabel", "使用說明")}`
- **Line 277**: `label={t("nav.back", "返回")}`
- **Line 305**: `{t("nav.lastUpdated", "前次更新")} {formatDate(lastUpdated)}`

### 📄 domains/docs/components/MobileDocsMenu.tsx

**發現 3 處硬編碼字串**

- **Line 38**: `aria-label={t("nav.menu", "選單")}`
- **Line 40**: `{t("nav.menu", "選單")}`
- **Line 46**: `modalHeading={t("nav.productLabel", "使用說明")}`

### 📄 domains/docs/components/DocsHeader.tsx

**發現 3 處硬編碼字串**

- **Line 111**: `aria-label={t("header.menu", "選單")}`
- **Line 129**: `aria-label={tDocs("nav.productLabel", "使用說明")}`
- **Line 143**: `{tDocs("nav.productLabel", "使用說明")}`

### 📄 core/config/difficultyConfig.ts

**發現 3 處硬編碼字串**

- **Line 10**: `'easy': { color: 'green', label: '簡單', type: 'green' },`
- **Line 11**: `'medium': { color: 'cyan', label: '中等', type: 'cyan' },`
- **Line 12**: `'hard': { color: 'red', label: '困難', type: 'red' },`

### 📄 services/contest/index.ts

**發現 2 處硬編碼字串**

- **Line 546**: `throw new Error("權限不足");`
- **Line 548**: `throw new Error("匯出失敗");`

### 📄 ui/components/GlobalHeader.tsx

**發現 2 處硬編碼字串**

- **Line 51**: `aria-label={t("header.menu", "選單")}`
- **Line 96**: `aria-label={t("header.sideNav", "側邊導航")}`

### 📄 i18n/index.ts

**發現 2 處硬編碼字串**

- **Line 65**: `{ id: "zh-TW", label: "繁體中文", shortLabel: "中" },`
- **Line 67**: `{ id: "ja", label: "日本語", shortLabel: "日" },`

### 📄 services/api/httpClient.ts

**發現 1 處硬編碼字串**

- **Line 67**: `dispatchServerError(response.status, `伺服器錯誤 (${response.status})`);`

### 📄 domains/contest/components/modals/ContestDownloadModal.tsx

**發現 1 處硬編碼字串**

- **Line 46**: `{ id: "zh-TW", label: "中文 (繁體)" },`

### 📄 domains/docs/components/AIGeneratedBadge.tsx

**發現 1 處硬編碼字串**

- **Line 24**: `{t("badge.aiGenerated", "AI 生成")}`

### 📄 domains/docs/components/DocTableOfContents.tsx

**發現 1 處硬編碼字串**

- **Line 104**: `{t("nav.onThisPage", "在此頁面")}`

### 📄 ui/components/common/MarkdownRenderer.tsx

**發現 1 處硬編碼字串**

- **Line 167**: `label={copied ? "已複製" : "複製程式碼"}`

## 💡 建議

1. 將硬編碼的中文字串移至對應的翻譯 JSON 檔案
2. 使用 `t()` 函數或 `useTranslation()` hook 來引用翻譯
3. 為新增的翻譯 key 選擇適當的命名空間（common, problem, contest, admin, docs）
