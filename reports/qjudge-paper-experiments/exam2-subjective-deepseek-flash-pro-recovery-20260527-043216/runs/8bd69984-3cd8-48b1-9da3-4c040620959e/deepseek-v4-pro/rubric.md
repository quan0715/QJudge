# Rubric: Master-Slave Architecture for Multiprocessors

**題目**: Provide two advantages and two disadvantages of a Master-Slave architecture for multiprocessors.

**滿分**: 4 分（每項 1 分）

## 評分項目（共四項，每項 1 分）

### Advantages（2 分）
| # | 標準答案要點 | 可接受說法 |
|---|---|---|
| A1 | Easier to design and manage | 設計簡單、易於管理、容易實作、single OS copy 簡化、只需管理 master |
| A2 | Efficient resource allocation / load balancing | 資源分配有效率、自動負載平衡、master 統一分派工作、no unbalanced workload |

### Disadvantages（2 分）
| # | 標準答案要點 | 可接受說法 |
|---|---|---|
| D1 | Limited scalability (master becomes bottleneck) | 擴展性差、master 成為效能瓶頸、難以 scale up |
| D2 | Single point of failure | 單點故障、master 壞掉整個系統癱瘓 |

## 給分原則

- **4 分**: 四項全對，概念正確且涵蓋參考答案要點。
- **3 分**: 缺一項或一項明顯錯誤／偏離主題。
- **2 分**: 缺兩項或兩項明顯錯誤／偏離主題。
- **1 分**: 缺三項，僅有一項正確且涵蓋要點。
- **0 分**: 完全空白、答非所問、或多項皆錯誤且無可取之處。

## 常見邊界案例

- 優缺點寫顛倒（把優點寫在缺點欄、缺點寫在優點欄）：以實際內容判斷歸屬，不因此扣分。
- 同一概念拆成兩點（如「設計簡單」與「容易實作」視為同一項）：只給一次分。
- 回答模糊（如只寫「好管理」、「不好」而無具體說明）：酌情給分，若無法對應到要點則不給分。
- 超出兩項者：取最佳兩項計分。
- 回答不完整（例如只寫了優點沒寫缺點）：只依有寫的部分給分。
