# AI 模型部署配置設計

日期：2026-09-28
狀態：設計定案，實作計畫見 `docs/superpowers/plans/2026-09-28-ai-model-deployment-config.md`

## 1. 目標

### 要解決的問題

- 模型目錄寫死在 `ai-service/domain/model_registry.py` 與 `model_factory.py` 的 7 張表，所有機器看到同一份 6 個模型；沒有對應 key 的模型仍出現在 `/v1/models`，選了才在執行時失敗。
- 自架 endpoint 只能有一組 `VLLM_*`，`model_factory.py` 以 `model_id == "openai-gemma4-31b"` 特判；實驗機器要接其他自架模型必須改程式碼並 release。
- TPM／RPS 限流值取決於各機器的帳號等級，卻寫死在程式碼。
- 前端批改預設 `deepseek-v4-flash`、排除 `openai-nano`，Django `StartRunSerializer` 預設 `openai-nano`，`recursion_failure_handler.py` 固定用 `openai-nano`；機器沒有這些模型時直接壞掉。
- 模型載入失敗時前端沒有任何說明，只是選單變空或送出失敗。

### 決定

| 項目 | 決定 |
|---|---|
| 分工 | 程式碼持有內建 provider 的呼叫方式；每台機器以 `deploy/ai/models.yml` 決定啟用哪些模型與自架 endpoint |
| 內建 provider | `openai`、`deepseek`，不需配置 |
| 自架 endpoint | 一律 OpenAI 相容，只需 `base_url` |
| API key | 不寫進 yaml；env 名稱固定為 `<PROVIDER 名稱大寫，- 換成 _>_API_KEY`，放在 `deploy/ai/keys.env` |
| context 上限 | `max_input_tokens` 選填，依序取 yaml → LangChain 內建 profile → 自架 endpoint 的 `max_model_len` |
| 限流 | 移除 TPM gate 與 RPS limiter，只保留 SDK 對 429 的 `Retry-After` 重試 |
| 預設模型 | `default` 選填，未填取第一個可用模型；前端、Django、fallback 都改用目錄的預設 |
| 模型目錄 | ai-service 為唯一來源，`/v1/models` 只回傳本機可用的模型 |
| 設定錯誤 | ai-service 照常啟動但停用 AI 功能，前端顯示對應訊息；`qjudge upgrade` 在停機前先驗證並中止 |

### 不做

- Anthropic provider：本次不接。之後新增只需加一個 adapter 與 `langchain-anthropic` 依賴，yaml 格式不變。
- 資料庫儲存模型設定或管理頁面。
- 依用途（對話／批改）限制模型；批改預設即為目錄預設。
- 模型定價、credit 換算。
- 舊 `model_id` 的 data migration 或 alias。
- 在前端顯示設定錯誤的細節；細節只出現在 ai-service log 與驗證指令輸出。

## 2. 設定檔

AI 部署檔集中在 `deploy/ai/`，整個目錄以唯讀掛載到 `ai-service` 與 `ai-worker` 的 `/etc/qjudge-ai`。掛載目錄而不是單一檔案，是為了檔案不存在時容器仍能建立：`backend` 以 `service_healthy` 依賴 `ai-service`，AI 設定問題不能讓整個網站起不來。

| 檔案 | 版控 | 用途 |
|---|---|---|
| `deploy/ai/models.example.yml` | 是 | 範本，`qjudge init` 在 `models.yml` 不存在時複製 |
| `deploy/ai/models.yml` | 否 | 本機模型設定 |
| `deploy/ai/keys.env` | 否（`*.env`） | provider API key，compose 以 `env_file`（`required: false`）載入 |

### `deploy/ai/models.yml`

```yaml
default: deepseek-v4-flash      # 選填，未填取第一個可用模型

models:
  - id: gpt-5-nano
    provider: openai
  - id: deepseek-v4-flash
    provider: deepseek
    reasoning_effort: high
    max_input_tokens: 1000000
  - id: gemma4-31b
    provider: lab-vllm
    model: Gemma4-31B
    display_name: Gemma4-31B
    description: 校內 vLLM

endpoints:                      # 只有自架或需要覆蓋 URL 時才寫
  lab-vllm:
    base_url: http://10.0.0.5:8000/v1
```

只接一台 vLLM 的實驗機器：

```yaml
models:
  - id: gemma4-31b
    provider: lab-vllm
    model: Gemma4-31B

endpoints:
  lab-vllm:
    base_url: http://10.0.0.5:8000/v1
```

### 欄位

| 欄位 | 必填 | 預設 | 說明 |
|---|---|---|---|
| `default` | 否 | 第一個可用模型 | 必須是 `models` 中的 `id` |
| `models[].id` | 是 | — | API、前端與歷史紀錄使用的 ID；不可重複；限小寫英數、`.`、`-`，最長 50 字元 |
| `models[].provider` | 是 | — | `openai`、`deepseek` 或 `endpoints` 中的名稱 |
| `models[].model` | 否 | `id` | 送給 provider 的模型名稱 |
| `models[].display_name` | 否 | `id` | |
| `models[].description` | 否 | 空字串 | |
| `models[].reasoning_effort` | 否 | 不設定 | `low`、`medium`、`high`；見第 3 節；自架 endpoint 不支援 |
| `models[].max_input_tokens` | 否 | 見第 4 節 | 正整數 |
| `endpoints.<name>.base_url` | 自架必填 | — | http(s) URL；名稱與內建 provider 相同時，覆蓋其官方 URL（例如公司 proxy） |

provider 與 endpoint 名稱限小寫英數與 `-`。

### API key：`deploy/ai/keys.env`

provider key 名稱由 yaml 決定、無法事先列在 compose，因此放在獨立檔案，只給 `ai-service` 與 `ai-worker` 載入，避免把 `.env` 的 DB 密碼等機密整份交給 AI 容器。

```
OPENAI_API_KEY=...
DEEPSEEK_API_KEY=...
LAB_VLLM_API_KEY=...        # vLLM 未開 --api-key 時可省略
```

| provider 類型 | key 未設定 |
|---|---|
| 內建（`openai`、`deepseek`） | 設定錯誤 |
| 自架 endpoint | 允許，送出 `EMPTY` |

`deploy/.env`、`qjudge_cli/schema.py` 與 `deploy/compose.yml` 移除 `OPENAI_*`、`DEEPSEEK_*`、`VLLM_*` 六個 key。

## 3. 內建 adapter

所有 adapter 預設 `max_retries=6`，由 SDK 依 `Retry-After` 退避。

| provider | 類別 | `reasoning_effort` |
|---|---|---|
| `openai` | `ChatOpenAI` | 設定時改走 Responses API：`reasoning={"effort": ..., "summary": "auto"}`、`output_version="responses/v1"` |
| `deepseek` | `ReasoningPreservingChatDeepSeek` | 設定時開 thinking 並帶入 `reasoning_effort`；未設定時 `thinking.type=disabled` 且使用一般 `ChatDeepSeek` |
| 自架 endpoint | `ChatOpenAI`（chat completions） | 不支援 |

## 4. 載入與解析

`ai-service` 與 `ai-worker` 在 process 內第一次需要模型目錄時讀 `/etc/qjudge-ai/models.yml`（`AI_MODELS_FILE` 可覆蓋），結果在 process 內快取；改設定後重啟兩個容器生效。

### 設定錯誤

以下任一情況視為設定錯誤，一次列出全部問題：

- 檔案不存在或 YAML 無法解析
- 未知欄位、欄位型別錯誤、`id` 重複或格式不符
- `provider` 既非內建也不在 `endpoints`
- `default` 不在 `models`
- 自架 endpoint 缺 `base_url` 或 URL 不是 http(s)，或其模型設定 `reasoning_effort`
- 內建 provider 的 key 未設定
- 內建 provider 的模型沒填 `max_input_tokens`，且 LangChain profile 也沒有

設定錯誤時：

- process 照常啟動，`/health/ready` 不受影響，其他功能正常。
- 以 ERROR 等級 log 全部問題（每個 process 一次）。
- `GET /v1/models` 與開始 run 回傳 503 `MODEL_CONFIG_INVALID`，前端顯示對應訊息（第 5 節）。
- `python -m infrastructure.agent.model_config` 印出全部問題並以非 0 結束，供維運與 `qjudge upgrade` 使用。

`models` 為空清單是合法設定：AI 功能停用，`/v1/models` 回傳空清單。

### `max_input_tokens` 解析順序

1. yaml 有填就用。
2. 內建 provider：LangChain 的 `model.profile["max_input_tokens"]`。
3. 自架 endpoint：`GET {base_url}/models`，取對應模型的 `max_model_len`。

自架 endpoint 查詢失敗（連不到、找不到模型、沒有 `max_model_len`）時，該模型標為不可用並記錄 WARNING，其他模型照常運作。不可用的模型在目錄被讀取時重新查詢，同一 endpoint 間隔至少 60 秒。

### 其他常數

`SUMMARIZATION_TRIGGER_FRACTION = 0.70` 與摘要 trim 12000 tokens 改為程式碼常數，不再逐模型設定。

## 5. API 與前端

### 錯誤碼

| code | HTTP | 時機 |
|---|---|---|
| `MODEL_CONFIG_INVALID` | 503 | 設定錯誤時的 `/v1/models` 與開始 run |
| `MODEL_NOT_AVAILABLE` | 422 | 開始 run 指定的模型不在可用目錄，或目錄為空 |

Django BFF 原樣轉送 code（`safe_upstream_error` 既有行為）；ai-service 連不到時維持既有的 `AI_SERVICE_UNAVAILABLE`。

### 前端訊息

AI 助教輸入框與 AI 批改畫面依模型目錄狀態顯示 Carbon `InlineNotification`：

| 狀態 | 訊息（zh-TW） | 可否送出 |
|---|---|---|
| 目錄回傳 `MODEL_CONFIG_INVALID` | AI 模型設定有誤，AI 功能暫時無法使用。請聯絡站台管理員檢查 AI 模型設定。 | 否 |
| 目錄載入失敗（其他原因） | 沿用 `aiServiceUnavailable` | 否 |
| 目錄為空 | 此站台尚未設定 AI 模型，請聯絡站台管理員。 | 否 |
| 送出回傳 `MODEL_NOT_AVAILABLE` | 所選模型目前無法使用，模型清單已重新整理，請改選其他模型後再送出。 | 是（重新整理目錄） |

### 使用端改動

| 位置 | 改動 |
|---|---|
| `ai-service` `GET /v1/models` | 只回傳可用模型；`is_default` 標在有效預設（`default` 可用時用它，否則第一個可用模型） |
| `ai-service` `StartRunRequest.model_id` | 改為選填；未帶時用有效預設 |
| `recursion_failure_handler.py`、`deepagent_adapter.py` repair model | 改用有效預設；沒有可用模型時走既有 fallback 或略過 |
| Django `StartRunSerializer.model_id` | 移除 `default`；未帶就轉送 `null` |
| 前端批改 | 移除 `AI_GRADING_DEFAULT_MODEL_ID` 與 `EXCLUDED_MODEL_IDS`，預設取目錄的 `is_default` |
| 前端模型選單 | 記住的選擇不在目錄時改用預設（`chooseModelId` 既有行為） |
| 歷史紀錄 | 不在目錄的 `model_id` 顯示原始 ID |

## 6. 移除

- `domain/model_registry.py`
- `model_factory.py` 的 `_MODEL_MAP`、`_OPENAI_REASONING_EFFORT`、`_OPENAI_RATE_LIMIT_RPS`、`_OPENAI_TPM_LIMIT`、`_OPENAI_MAX_RETRIES`、`MODEL_MAX_INPUT_TOKENS`、`MODEL_SUMMARY_TRIM_TOKENS`、`_DEEPSEEK_THINKING_MODEL_IDS`、`_DEFAULT_MODEL_ID` 與 Gemma 特判
- `infrastructure/agent/tpm_gate.py` 與 `TpmGatedChatOpenAI`
- `config.py` 的 `openai_*`、`deepseek_*`、`vllm_*` 設定
- `deepagent_adapter.py` 中 `gpt-5` 前綴推測 400k 的 fallback

## 7. 現有部署轉換

dcslab 沿用現有 ID，歷史紀錄不需改寫。自架 endpoint 命名為 `vllm`，key 名稱恰為原本的 `VLLM_API_KEY`。

```yaml
default: openai-nano

models:
  - id: openai-nano
    provider: openai
    model: gpt-5-nano
    display_name: gpt-5-nano
    description: 快速且成本低，適合日常教學互動
  - id: openai-gemma4-31b
    provider: vllm
    model: Gemma4-31B
    display_name: Gemma4-31B
    description: 自架 vLLM Gemma4-31B，適合校內部署與批改
    max_input_tokens: 131072
  - id: openai-mini
    provider: openai
    model: gpt-5.4-mini
    display_name: gpt-5.4-mini (low)
    description: OpenAI 推理模型，低思考強度，平衡速度與品質
    reasoning_effort: low
    max_input_tokens: 272000
  - id: openai-mini-medium
    provider: openai
    model: gpt-5.4-mini
    display_name: gpt-5.4-mini (medium)
    description: OpenAI 推理模型，中等思考強度，適合複雜批改與推理
    reasoning_effort: medium
    max_input_tokens: 272000
  - id: deepseek-v4-flash
    provider: deepseek
    description: DeepSeek V4 Flash，1M context，thinking enabled，適合大量批改與日常推理
    reasoning_effort: high
    max_input_tokens: 1000000
  - id: deepseek-v4-pro
    provider: deepseek
    description: DeepSeek V4 Pro，1M context，thinking enabled，適合高品質批改與複雜推理
    reasoning_effort: high
    max_input_tokens: 1000000

endpoints:
  vllm:
    base_url: <原 VLLM_BASE_URL>
```

步驟：

1. 建立 `deploy/ai/models.yml`（如上）與 `deploy/ai/keys.env`，把 `.env` 中的 `OPENAI_API_KEY`、`DEEPSEEK_API_KEY`、`VLLM_API_KEY` 搬過去。
2. 刪除 `.env` 的六個 AI key；若原本設了 `OPENAI_BASE_URL` 或 `DEEPSEEK_BASE_URL`，改寫成 `endpoints.openai.base_url` 或 `endpoints.deepseek.base_url`。
3. 執行 `qjudge upgrade`；模型設定有誤時會在停機前中止。

`qjudge check` 對仍留在 `.env` 的舊 key 回報錯誤，並提示搬到 `deploy/ai/`。

dev 使用同一份 `deploy/ai/`；缺檔時 AI 功能顯示設定錯誤訊息，其他服務照常。CI E2E 掛載 `ci/ai/`，指向 fake adapter。

## 8. 部署檢查

- `qjudge check`（只用標準函式庫，不解析 YAML）：舊 AI key 仍在 `.env` 時報錯。
- `qjudge upgrade`：build 後、停機與備份前，以新 image 執行 `python -m infrastructure.agent.model_config`；失敗即中止，服務維持舊版。驗證規則與 ai-service 執行時共用同一份程式碼。
- 不連線查詢自架 endpoint；連線狀態由 ai-service 的 log 與 `/v1/models` 反映。

## 9. 驗證

- 設定載入：欄位預設值、key 名稱規則、第 4 節各設定錯誤。
- `max_input_tokens` 三段解析，含自架 endpoint 查詢失敗後標為不可用與 60 秒重查。
- 各 adapter 對 `reasoning_effort` 的對應。
- `/v1/models` 只回傳可用模型與有效預設；設定錯誤時的 503；`StartRunRequest` 未帶 `model_id` 與不可用 ID 的行為。
- 前端四種訊息狀態與送出停用；批改預設取自目錄。
- `qjudge upgrade` 在模型設定錯誤時於停機前中止。
- 真實 provider smoke test 需明確授權與可用 key。

## 10. 連帶更新

- `.codex/skills/qjudge-ai-model-registry/`：改寫為「程式碼 adapter／`deploy/ai/models.yml`」的分工與新增 provider 的流程。
- `docs/operations/production-configuration.md`：AI provider 設定改指向 `deploy/ai/`。
