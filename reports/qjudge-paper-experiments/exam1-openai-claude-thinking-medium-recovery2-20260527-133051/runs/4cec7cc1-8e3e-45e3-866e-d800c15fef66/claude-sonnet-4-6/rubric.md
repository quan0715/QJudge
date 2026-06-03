# Rubric: Thread / Process / Program

**題目**：Briefly describe the concepts of "thread," "process," and "program." How do they relate?

**滿分**：3 分

## 參考答案
- **Program**：靜態的程式碼檔案（尚未執行）。
- **Process**：程式的一個執行中實例（active execution instance）。
- **Thread**：Process 內的一個執行單元；一個 Process 可包含多個 Thread，彼此共享同一份資源。

---

## 評分標準

| 得分 | 條件 |
|------|------|
| **3** | 三個概念均正確說明，且清楚描述彼此關係（Process 是 Program 的執行實例；Thread 是 Process 內的執行單元，可共享資源）。 |
| **2** | 三個概念基本正確，但關係說明不完整（例如：僅說明兩組關係之一，或缺少「共享資源」描述）；或關係說明完整但某一概念說明稍有瑕疵。 |
| **1** | 僅說明 1–2 個概念，或概念有明顯錯誤；關係說明缺漏較多。 |
| **0** | 完全錯誤、空白、或答非所問。 |

## 評分細則
- 只要核心定義正確（Program = 靜態檔案、Process = 執行實例、Thread = Process 內執行單元），措辭可接受各種合理說法。
- 未明確提及「共享資源（shared resources/memory）」最多扣 0.5–1 分（依整體完整度決定）。
- 英文、中文或中英混合作答皆可接受。
- 分數為整數（0、1、2、3）。
