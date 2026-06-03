# 評分準則：Distributed Systems Transparency Definitions

- **滿分**: 3 分
- **題型**: short_answer
- **題目**: Define Access Transparency, Location Transparency, and Replication Transparency in distributed systems.

## 配分結構（每項 1 分）

### 1. Access Transparency（1 分）
- **核心概念**: 本地與遠端資源使用**相同的操作/方式**存取。
- 給分標準:
  - 1 分：明確說出「identical operations / same operations / same method / 相同操作/方式」存取 local 與 remote 資源。
  - 0 分：未提及或概念錯誤（如只說「可以存取」但未強調操作一致性）。

### 2. Location Transparency（1 分）
- **核心概念**: 存取資源時**無需知道其實際物理位置**。
- 給分標準:
  - 1 分：明確提及「不需知道 actual location / physical location / 實際位置 / 實體位址」即可存取。
  - 0 分：未提及或概念錯誤。

### 3. Replication Transparency（1 分）
- **核心概念**: 系統存在多個資源副本/複本，**使用者/應用程式不會察覺或不需要知道**。
- 給分標準:
  - 1 分：提到「multiple copies/replicas/instances」且「user/application 不知情/透明/不影響」。
  - 0 分：未提及使用者不知情，或僅說「可複製」但缺少透明性面向。

## 評分政策
- **3/3（滿分）**: reason 留空（不寫評語）
- **0~2/3**: 必填 reason，簡述扣分原因
