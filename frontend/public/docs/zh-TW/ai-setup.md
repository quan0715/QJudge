# 配置 AI 模型與服務

QJudge 提供 AI 助教與輔助批改功能，協助教師在建立題目、設計評分標準或提供學生解題引導時獲得建議。這是一項**選用功能**：如果主機尚未設定 AI，所有基本的程式碼評測、教室名冊與考試功能依然可以完全正常運作。

如果你使用的是學校伺服器或雲端 VM，請先透過 SSH 連上主機，切換到 QJudge 專案目錄。AI 的模型目錄與 API 金鑰都是在這台主機上設定，不需在網頁後台手動輸入。

## 兩個核心設定檔

QJudge 將 AI 設定拆分為兩個檔案，兼顧版控管理與金鑰安全：

| 檔案路徑 | 用途說明 |
| :--- | :--- |
| `deploy/ai/models.yml` | 定義這台主機開放哪些模型、預設使用哪一個，以及自架端點網址 |
| `deploy/ai/keys.env` | 保存各模型提供者的 API 金鑰，獨立於程式碼與版本控制之外 |

## 第 1 步：挑選與配置模型（models.yml）

如果目錄下還沒有 `models.yml`，可以先從範本複製一份：

```bash
cp deploy/ai/models.example.yml deploy/ai/models.yml
```

打開 `deploy/ai/models.yml` 進行編輯。以下是常見欄位的白話說明：

- `default`：使用者進入系統時，介面預設為其選取的模型 ID。
- `models`：這台主機對外提供的模型清單。每個模型可設定：
  - `id`：模型代號，系統內部識別與歷史紀錄使用（如 `deepseek-flash`、`gpt-6-luna`）。
  - `provider`：提供者名稱。內建支援 `openai` 與 `deepseek`；若是自架模型，填寫底下 `endpoints` 定義的名稱。
  - `display_name`：在網頁選單中呈現給老師與學生看的名稱（如 `DeepSeek V4.1 Flash`）。
  - `model`：實際送出給 API 的模型名稱（若與 `id` 相同可省略）。
  - `max_input_tokens`：上下文長度上限（建議填寫，避免超長文本導致報錯）。
  - `reasoning_effort`：推論思考深度（可設 `low`、`medium` 或 `high`，適用於支援思考特性的模型）。
- `endpoints`：若使用學校或實驗室自架的 API 端點，在此指定其服務基礎網址。

### 常見情境範例

#### 情境 A：使用商用雲端模型（DeepSeek 或 OpenAI）

最常見的方式是直接串接商業 API：

```yaml
default: deepseek-flash
models:
  - id: deepseek-flash
    provider: deepseek
    display_name: DeepSeek V4.1 Flash
    reasoning_effort: high
    max_input_tokens: 1000000
  - id: gpt-6-luna
    provider: openai
    display_name: GPT-6 Luna
    reasoning_effort: medium
    max_input_tokens: 272000
```

#### 情境 B：使用學校或地端自架端點（vLLM / Ollama）

如果學校有機房顯卡伺服器，並以 vLLM 或 Ollama 啟動了相容 OpenAI API 規格的服務：

```yaml
default: campus-gemma
models:
  - id: campus-gemma
    provider: campus-vllm
    model: Gemma4-31B
    display_name: 校園自架 Gemma 31B
    max_input_tokens: 131072
endpoints:
  campus-vllm:
    base_url: http://10.0.0.5:8000/v1
```

> **提示**：任何支援 OpenAI 相容規格（包含 `/v1/chat/completions`）的推論框架（例如 vLLM、TGI、Ollama、LocalAI、LiteLLM）都可以作為自架端點。

#### 情境 C：完全停用 AI 功能

如果你希望徹底關閉站台的 AI 功能，不提供任何模型：

```yaml
models: []
```

## 第 2 步：設定 API 金鑰（keys.env）

API 金鑰統一集中在 `deploy/ai/keys.env`，請勿直接寫進 `models.yml` 中。

金鑰的環境變數命名規則為：**`<PROVIDER>_API_KEY`**（提供者名稱轉大寫，破折號 `-` 改為底線 `_`）。

建立或編輯 `deploy/ai/keys.env`：

```env
# 內建商用 Provider 金鑰
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxx

# 自架端點金鑰（若自架服務未開啟認證，可不填）
CAMPUS_VLLM_API_KEY=your-token-if-needed
```

## 第 3 步：測試設定並重新啟動

編輯完成後，請先在主機上執行語法檢查指令，確認 YAML 格式與欄位無誤：

```bash
docker compose -p qjudge exec ai-service python -m infrastructure.agent.model_config
```

如果終端機沒有報錯，表示配置正確。接著重新啟動 AI 相關容器即可立即生效（主系統不需停機）：

```bash
docker compose -p qjudge restart ai-service ai-worker
```

如果日後更新站台版本，執行 `deploy/qjudge upgrade` 時也會自動檢驗此設定。

## 第 4 步：在平台上驗證

1. 以教師或管理員帳號登入 QJudge 網頁。
2. 進入題目建立、編輯頁面，或打開右側的 AI 助教面版。
3. 檢查模型選單中是否正確列出剛才設定的 `display_name`。
4. 試著發送一則測試訊息（例如「請說明二元搜尋的時間複雜度」），確認 AI 能正常生成回覆。

如果介面顯示模型無法連線或設定錯誤，可透過以下指令查看容器紀錄排查問題：

```bash
docker compose -p qjudge logs ai-service --tail=50
```

[上一步：加入選用功能](#/docs/deployment-options) · [下一步：配置 MCP 工具連線](#/docs/mcp-setup)
