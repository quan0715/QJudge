# 評分準則

- 題目：列出同一行程（process）內多個執行緒（thread）之間「共享」與「不共享」的三項屬性。
- 滿分：6 分
- 參考答案：
  - 共享：記憶體空間、檔案描述元、全域變數
  - 不共享：Thread ID、暫存器、堆疊

## 給分原則

- 每個正確且明確的屬性 1 分，共 6 分。
- 必須分清楚是「共享」或「不共享」；分類錯誤不給分。
- 同義、等價表述可接受，例如：
  - memory space / address space / 位址空間
  - file descriptors / open files / 檔案描述元
  - global variables / 全域資料 / 共享的全域變數
  - thread ID / 執行緒識別碼
  - registers / CPU 暫存器
  - stack / 執行緒堆疊
- 若答案只寫概念但無法對應到具體屬性，視情況酌減。
- 若出現明顯錯誤（例如把 stack、registers、thread ID 說成共享），該項不給分。
- 超出三項以外的內容不加分，但可用來判斷是否有重複或混淆。
