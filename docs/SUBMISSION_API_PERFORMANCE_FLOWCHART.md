# Submission API 性能問題流程圖

本文件使用流程圖視覺化說明性能問題和優化方案。

## 當前問題流程

```mermaid
graph TD
    A[使用者開啟提交記錄頁面] --> B[前端發送 API 請求]
    B --> C{有過濾條件嗎?}
    C -->|沒有| D[載入所有類型的 submission]
    C -->|有| E[載入特定條件]
    
    D --> F[Django ViewSet 接收請求]
    E --> F
    
    F --> G[執行資料庫查詢]
    G --> H{有適當的索引嗎?}
    
    H -->|沒有| I[全表掃描 - 非常慢!]
    H -->|有| J[使用索引查詢]
    
    I --> K[載入完整的記錄包含 code]
    J --> K
    
    K --> L[Serializer 序列化]
    L --> M{使用嵌套 Serializer?}
    
    M -->|是| N[觸發 N+1 查詢問題]
    M -->|否| O[直接序列化]
    
    N --> P[回傳大量資料 500KB+]
    O --> P
    
    P --> Q[前端接收並渲染]
    Q --> R[使用者等待 3-5 秒]
    
    style I fill:#ff6b6b
    style N fill:#ff6b6b
    style P fill:#ff6b6b
    style R fill:#ff6b6b
```

## 優化後流程

```mermaid
graph TD
    A[使用者開啟提交記錄頁面] --> B[前端發送 API 請求]
    B --> B1[加入 source_type='practice']
    
    B1 --> C{React Query 有快取?}
    C -->|有| D[直接使用快取資料 - 即時!]
    C -->|沒有| E[發送到後端]
    
    E --> F[Django ViewSet 接收]
    F --> F1[使用 select_related 和 only]
    
    F1 --> G[執行優化的查詢]
    G --> H[使用複合索引]
    
    H --> I[快速查詢 - 0.1秒]
    I --> J[只載入必要欄位]
    
    J --> K[Serializer 精簡序列化]
    K --> L[回傳小量資料 100KB]
    
    L --> M[前端接收]
    M --> N[React Query 快取結果]
    N --> O[渲染頁面]
    
    O --> P[使用者等待 0.3-0.5 秒]
    P --> Q[預載入下一頁]
    
    style D fill:#51cf66
    style H fill:#51cf66
    style I fill:#51cf66
    style L fill:#51cf66
    style P fill:#51cf66
```

## 優化點對比

```mermaid
graph LR
    subgraph "優化前"
    A1[無過濾條件] --> A2[全表掃描]
    A2 --> A3[載入所有欄位]
    A3 --> A4[N+1 查詢]
    A4 --> A5[大量資料傳輸]
    A5 --> A6[3-5秒]
    end
    
    subgraph "優化後"
    B1[預設過濾] --> B2[索引查詢]
    B2 --> B3[只載入必要欄位]
    B3 --> B4[單一查詢]
    B4 --> B5[精簡資料]
    B5 --> B6[0.3-0.5秒]
    end
    
    style A6 fill:#ff6b6b
    style B6 fill:#51cf66
```

## 資料庫查詢優化

```mermaid
graph TD
    subgraph "優化前: 慢查詢"
    A[SELECT *] --> B[FROM submissions]
    B --> C[WHERE source_type='practice']
    C --> D[ORDER BY created_at DESC]
    D --> E[Sequential Scan]
    E --> F[掃描 100,000 筆記錄]
    F --> G[排序所有記錄]
    G --> H[返回前 20 筆]
    H --> I[花費 2-5 秒]
    end
    
    subgraph "優化後: 快查詢"
    J[SELECT id, user_id, ...] --> K[FROM submissions]
    K --> L[WHERE source_type='practice' AND is_test=false]
    L --> M[ORDER BY created_at DESC]
    M --> N[Index Scan using sub_src_test_created_idx]
    N --> O[只掃描必要記錄]
    O --> P[索引已排序]
    P --> Q[直接返回前 20 筆]
    Q --> R[花費 0.1-0.2 秒]
    end
    
    style I fill:#ff6b6b
    style R fill:#51cf66
```

## N+1 查詢問題

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant DB
    
    Note over Client,DB: 優化前 - N+1 查詢問題
    
    Client->>API: GET /api/v1/submissions/
    API->>DB: SELECT * FROM submissions (1)
    DB-->>API: 20 筆 submissions
    
    loop 每個 submission
        API->>DB: SELECT * FROM users WHERE id=? (2)
        DB-->>API: user data
        API->>DB: SELECT * FROM problems WHERE id=? (3)
        DB-->>API: problem data
        API->>DB: SELECT * FROM contests WHERE id=? (4)
        DB-->>API: contest data
    end
    
    Note over API,DB: 總共 1 + 20*3 = 61 個查詢!
    
    API-->>Client: Response (3-5秒)
```

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant DB
    
    Note over Client,DB: 優化後 - 使用 select_related
    
    Client->>API: GET /api/v1/submissions/
    API->>DB: SELECT ... FROM submissions<br/>JOIN users ON ...<br/>JOIN problems ON ...<br/>JOIN contests ON ...
    DB-->>API: 20 筆完整資料
    
    Note over API,DB: 只需要 1 個查詢!
    
    API-->>Client: Response (0.3-0.5秒)
```

## React Query 快取策略

```mermaid
graph TD
    A[使用者首次載入] --> B[React Query: 查詢資料]
    B --> C[發送 API 請求]
    C --> D[收到資料]
    D --> E[快取資料 30 秒]
    
    E --> F{使用者操作}
    F -->|切換到其他頁面| G[保留快取]
    F -->|30秒內切回| H{快取仍有效?}
    
    H -->|是| I[直接使用快取 - 即時!]
    H -->|否| J[重新請求]
    
    G --> K[使用者切回提交頁面]
    K --> H
    
    F -->|點擊下一頁| L[預載入已完成?]
    L -->|是| M[即時顯示]
    L -->|否| N[快速載入]
    
    style I fill:#51cf66
    style M fill:#51cf66
```

## 優化實作流程

```mermaid
graph TD
    Start[開始優化] --> Step1[執行診斷腳本]
    
    Step1 --> Step2{確認問題}
    Step2 -->|索引缺失| Step3[建立 Migration]
    Step2 -->|查詢未優化| Step4[優化 ViewSet]
    Step2 -->|資料過多| Step5[優化 Serializer]
    
    Step3 --> Step3a[新增 5 個複合索引]
    Step3a --> Test1[測試環境驗證]
    
    Step4 --> Step4a[使用 select_related]
    Step4a --> Step4b[使用 only]
    Step4b --> Test1
    
    Step5 --> Step5a[精簡欄位]
    Step5a --> Step5b[移除 code 欄位]
    Step5b --> Test1
    
    Test1 --> Test2{性能改善?}
    Test2 -->|是| Deploy[部署到 Production]
    Test2 -->|否| Debug[除錯分析]
    
    Debug --> Step1
    
    Deploy --> Monitor[監控性能]
    Monitor --> Step6{達到目標?}
    
    Step6 -->|是| Done[完成 ✅]
    Step6 -->|否| Step7[進行第二階段優化]
    
    Step7 --> Step8[實作 React Query]
    Step8 --> Step9[實作後端快取]
    Step9 --> Monitor
    
    style Done fill:#51cf66
    style Test2 fill:#ffd43b
    style Step6 fill:#ffd43b
```

## 索引使用對比

```mermaid
graph LR
    subgraph "無索引"
    A1[全表掃描] --> A2[讀取 100,000 筆]
    A2 --> A3[過濾條件]
    A3 --> A4[排序結果]
    A4 --> A5[返回 20 筆]
    A5 --> A6[2-5 秒]
    end
    
    subgraph "有索引"
    B1[索引掃描] --> B2[直接定位]
    B2 --> B3[已過濾已排序]
    B3 --> B4[讀取 20 筆]
    B4 --> B5[0.1-0.2 秒]
    end
    
    style A6 fill:#ff6b6b
    style B5 fill:#51cf66
```

## 資料傳輸大小對比

```mermaid
graph TD
    subgraph "優化前"
    A1[20 筆 Submission] --> A2[每筆包含 code 10KB]
    A2 --> A3[包含完整 user 物件]
    A3 --> A4[包含完整 problem 物件]
    A4 --> A5[總大小 500KB]
    end
    
    subgraph "優化後"
    B1[20 筆 Submission] --> B2[不包含 code]
    B2 --> B3[只有 user.username]
    B3 --> B4[只有 problem.title]
    B4 --> B5[總大小 100KB]
    end
    
    A5 --> C{對比}
    B5 --> C
    C --> D[節省 80% 頻寬]
    
    style D fill:#51cf66
```

## 完整優化路徑圖

```mermaid
mindmap
  root((Submission API<br/>性能優化))
    資料庫層
      新增索引
        source_type + created_at
        contest + source_type
        problem + created_at
        status + created_at
      查詢優化
        select_related
        only()
        prefetch_related
    後端 API 層
      Serializer
        精簡欄位
        移除 code
        扁平化結構
      ViewSet
        智能查詢
        條件過濾
        分頁優化
      快取
        Redis
        查詢結果快取
        TTL 策略
    前端層
      React Query
        自動快取
        背景更新
        重試機制
      預設過濾
        source_type
        分頁大小
      預載入
        下一頁
        Prefetch
      使用者體驗
        Loading 狀態
        Skeleton 載入
        錯誤處理
```

## 效能改善時間軸

```mermaid
gantt
    title 性能優化實作時程
    dateFormat  YYYY-MM-DD
    section 第一階段
    執行診斷           :done, diag, 2025-12-10, 1d
    建立索引 Migration  :done, idx1, after diag, 1d
    優化 Serializer    :done, ser1, after idx1, 1d
    優化 ViewSet       :done, view1, after ser1, 1d
    測試驗證           :active, test1, after view1, 1d
    部署 Production    :deploy1, after test1, 1d
    
    section 第二階段
    安裝 React Query   :rq1, after deploy1, 1d
    建立 Hooks        :rq2, after rq1, 2d
    更新頁面          :rq3, after rq2, 2d
    測試驗證          :test2, after rq3, 1d
    部署             :deploy2, after test2, 1d
    
    section 監控
    持續監控          :crit, monitor, after deploy1, 14d
```

---

## 使用說明

以上流程圖可以在支援 Mermaid 的環境中顯示，例如：
- GitHub
- GitLab
- VS Code (with Mermaid extension)
- Markdown 編輯器

如果你的環境不支援 Mermaid，建議使用線上工具：
- https://mermaid.live/
- https://mermaid.ink/

---

**相關文件**:
- [執行摘要](./SUBMISSION_API_EXECUTIVE_SUMMARY.md)
- [詳細分析](./SUBMISSION_API_PERFORMANCE_ANALYSIS.md)
- [實作指南](./SUBMISSION_API_OPTIMIZATION_GUIDE.md)
