# 批改準則

- 題目：簡述 `thread`、`process`、`program` 的概念與關係
- 滿分：3 分
- 參考重點：
  - program：靜態的程式碼/可執行檔
  - process：program 被載入後的執行實例
  - thread：process 內的執行單位
  - 關係：一個 process 可含多個 thread，threads 共享同一 process 資源

## 給分標準
- 3 分：三者定義正確，且有說清楚 process 與 program 的關係、thread 與 process 的關係。
- 2 分：大致正確，但缺一項關鍵關係或有輕微不完整。
- 1 分：只答對其中一、兩個概念，或關係描述很模糊。
- 0 分：明顯錯誤、空白、或完全未回答。

## 批改原則
- 以概念正確性為主。
- 若有部分正確但缺少關係描述，酌情扣分。
- 若提到多執行緒共享資源、process 為執行中的 program，皆可視為加分性正確內容。