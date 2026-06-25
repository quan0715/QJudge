# 評分準則：TSL bus contention 緩解方法

## 題目
> While using the Test-and-Set-Lock (TSL) instruction for mutex locks in MPs may cause system bus contention, please suggest two ways to mitigate it.

## 滿分：2 分

## 參考答案
1. **Read before TSL (TTAS)**：先以普通 read 檢查 lock 狀態（read 可被 cache），lock 有空才執行 TSL，減少 bus 鎖定。
2. **TSL with back-off**：TSL 若失敗，等待一段時間再重試（可搭配指數退避），降低連續鎖住 bus 的頻率。

## 給分規則
- 每答對一個方式得 **1 分**，滿分 **2 分**。
- **方式一（Read before TSL / TTAS）**：
  - 有提到 read before TSL、TTAS、先 read 再 TSL、或概念上等於先讀取 lock 狀態再執行原子操作 → 1 分。
  - 有正確名稱或意義即給分，不需完整描述。
- **方式二（TSL with back-off）**：
  - 有提到 back-off、退避、等待重試、指數延遲、或「失敗後等一段時間再試」的概念 → 1 分。
  - 有正確名稱或意義即給分，不需完整描述。
- 若兩個方法名稱顛倒（把方式二寫在第一個），仍算答對。
- 若提出的方法不在參考答案範圍內且無法合理緩解 bus contention → 不給該項目分數。

## Reason 政策
- **滿分（2 分）**：reason 留空。
- **非滿分**：必填 reason，簡短說明扣分原因。
