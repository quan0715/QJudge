# 安全政策

## 支援版本

目前我們為以下版本提供安全更新：

| 版本  | 支援狀態  |
| ----- | --------- |
| 1.x   | ✅ 支援中 |
| < 1.0 | ❌ 不支援 |

---

## 回報漏洞

我們非常重視 QJudge 的安全性。如果您發現安全漏洞，請**不要**公開回報，而是遵循以下步驟：

### 回報流程

1. **Email 通報**

   - 發送郵件至專案維護者
   - 主旨格式：`[SECURITY] 簡短描述`

2. **提供詳細資訊**
   請在報告中包含以下資訊：

   - 漏洞類型（例如：XSS、SQL Injection、認證繞過等）
   - 受影響的元件/檔案/端點
   - 重現步驟
   - 潛在影響範圍
   - 可能的修復建議（如果有）

3. **等待回應**
   - 我們會在 **48 小時內**確認收到您的報告
   - 我們會在 **7 個工作日內**進行初步評估
   - 根據嚴重程度，我們會制定修復計畫

### 漏洞嚴重程度分類

| 等級         | 說明                               | 範例                    |
| ------------ | ---------------------------------- | ----------------------- |
| **Critical** | 可導致系統完全被控制或大量資料洩露 | RCE、認證繞過、SQL 注入 |
| **High**     | 嚴重影響系統安全或使用者資料       | XSS、敏感資料洩露       |
| **Medium**   | 中度影響，需要特定條件觸發         | CSRF、資訊洩露          |
| **Low**      | 低度影響，難以利用                 | 輕微資訊洩露、設定問題  |

---

## 安全設計

### 認證與授權

- **JWT 認證**：使用 `rest_framework_simplejwt` 實作
- **Token 黑名單**：登出時自動將 Token 加入黑名單
- **速率限制**：登入/註冊 API 實作速率限制，防止暴力破解
- **RBAC**：基於角色的存取控制（Admin/Teacher/Student）

### 程式碼執行安全（Judge Engine）

- **Docker 隔離**：所有使用者程式碼在獨立 Docker 容器中執行
- **網路禁用**：`network_disabled=True` 防止網路存取
- **資源限制**：
  - CPU 時間限制
  - 記憶體限制
  - PID 限制（防止 Fork Bomb）
- **Seccomp Profile**：限制系統呼叫
- **無特權執行**：移除所有 Linux Capabilities

### Web 安全

- **HTTPS**：生產環境強制使用 HTTPS
- **CORS**：嚴格的跨域資源共享設定
- **CSRF 保護**：Django CSRF 中介層
- **XSS 防護**：Django 預設自動跳脫
- **SQL 注入防護**：使用 Django ORM
- **安全 Headers**：生產環境設定安全相關 HTTP Headers

### 資料安全

- **密碼加密**：bcrypt 演算法
- **敏感資料**：環境變數管理（不存入程式碼）
- **資料庫 SSL**：雲端資料庫連線使用 SSL

### 考試模式安全

- **前端監控**：視窗失焦、Tab 切換、全螢幕退出偵測
- **後端心跳**：定期心跳檢查連線狀態
- **違規記錄**：ExamEvent 表記錄所有異常事件
- **自動鎖定**：超過警告次數自動鎖定

---

## 已知安全措施

### 已實作

- ✅ JWT Token 黑名單
- ✅ API 速率限制
- ✅ Docker 沙箱隔離
- ✅ Seccomp 系統呼叫過濾
- ✅ RBAC 角色管理
- ✅ 考試心跳監控
- ✅ HTTPS（生產環境）

### 建議額外措施

- 🔲 Web Application Firewall (WAF)
- 🔲 DDoS 防護
- 🔲 Intrusion Detection System (IDS)
- 🔲 Security Audit Log 中心化
- 🔲 Penetration Testing

---

## 安全更新

當發布安全更新時，我們會：

1. **發布安全公告**

   - 在 GitHub Releases 中標記
   - 更新 CHANGELOG.md

2. **通知方式**

   - GitHub Security Advisories
   - 郵件通知（針對重大漏洞）

3. **更新建議**
   - Critical/High：立即更新
   - Medium：在下次維護週期更新
   - Low：依照正常更新流程

---

## 最佳實務建議

如果您要部署 QJudge，請遵循以下安全建議：

### 環境設定

```bash
# .env 設定範例
SECRET_KEY=<使用強隨機字串>
DEBUG=False
ALLOWED_HOSTS=q-judge.com,localhost,127.0.0.1,backend
DJANGO_ENV=production

# 資料庫（使用強密碼）
DB_PASSWORD=<強密碼>
DB_SSLMODE=disable  # Docker 內部 postgres 不需要 SSL

# AI Service 內部驗證
HMAC_SECRET=<openssl rand -hex 32>
AI_SERVICE_INTERNAL_TOKEN=<openssl rand -hex 32>

# Redis
REDIS_URL=redis://redis:6379/0
```

### Nginx 設定

```nginx
# 安全 Headers
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;

# HTTPS 重定向
server {
    listen 80;
    return 301 https://$host$request_uri;
}
```

### 定期檢查

- [ ] 定期更新依賴套件
- [ ] 檢查 GitHub Security Alerts
- [ ] 檢視 Access Logs
- [ ] 審查使用者權限
- [ ] 備份驗證

---

## 聯絡資訊

- **安全問題**：發送郵件至專案維護者
- **一般問題**：GitHub Issues

感謝您幫助我們保持 QJudge 的安全！🔒
