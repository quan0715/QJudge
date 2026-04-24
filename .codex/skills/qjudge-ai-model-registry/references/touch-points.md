# Model Registry Touch Points

> 每一欄的操作都要一次到位。**ADD**＝新增一個 canonical id；**UPDATE**＝改 pricing/context/display；**REMOVE**＝下架該 id。

## 1. ai-service（LLM 執行端）

### `ai-service/services/model_factory.py`

| Symbol | ADD | UPDATE | REMOVE |
|---|---|---|---|
| `_MODEL_MAP` | 新增 `"<id>": "<provider-string>"` | 若改 upstream model 才動 | 刪除該 entry |
| `_OPENAI_REASONING_EFFORT` | 新增（僅 openai reasoning 系列）| 視 effort 調整 | 刪除 |
| `_OPENAI_RATE_LIMIT_RPS` | 若有 TPM 風險才加 | 視限額調整 | 刪除 |
| `_OPENAI_TPM_LIMIT` | 同上 | 同上 | 刪除 |
| `_OPENAI_MAX_RETRIES` | 若 429 多才加 | 視情況 | 刪除 |
| `MODEL_MAX_INPUT_TOKENS` | **必加** | context 變動時 | 刪除 |
| `MODEL_SUMMARY_TRIM_TOKENS` | **必加** | 視 context 比例 | 刪除 |
| `PRICING` | **必加**（cents/1M） | **必改** | 刪除 |
| `MODEL_INFO` | **必加**（UI 顯示） | display 變動 | 刪除 |
| `_DEFAULT_MODEL_ID` | 若設為預設才動 | — | 若原本是預設要改指 |
| `_SUMMARIZATION_MODEL_ID` | 若設為 summarization 才動 | — | 若原本是 summarization 要改指 |
| `create_model()` provider branch | 若是新 provider 家族需擴 `if model_id.startswith(...)` 分支；同家族不用 | 特殊 kwarg（如 `reasoning_effort`、`extra_body`）可能要改 | — |

### `ai-service/services/deepagent_runner.py`

- 3 個方法 `run_stream` / `resume_stream` / `answer_stream` 的 `model_id: str = "<id>"` 參數預設。**只有在切換系統預設模型時才動**。

### `ai-service/services/runtime/recursion_failure_handler.py`

- `_DEFAULT_RECURSION_SUMMARY_MODEL_ID` — 獨立 summarization fallback。一般 model 增刪不用動。

### ai-service tests

| 檔案 | 該模型是否硬編？ | 動作 |
|---|---|---|
| `tests/test_model_factory.py` | 每個 canonical id 一支 `test_create_model_<id>` | ADD 要加；REMOVE 要刪；UPDATE 若影響 kwargs 要改 |
| `tests/test_api.py` | `test_models_endpoint` 斷言完整 `model_ids` 陣列 | ADD/REMOVE 必改順序 |
| `tests/test_deepagent_runner_config.py` | 多處 `model_id="<default>"` 引用系統預設 | 切換預設時 replace_all |
| `tests/test_deepagent_runner_streaming.py` | 同上 | 同上 |
| `tests/test_usage_accumulator.py` | 同上 + `report.model_used` 斷言 | 同上 |

## 2. backend（信用點與 API）

### `backend/apps/ai/credits.py`

- `DEFAULT_MODEL_PRICING` — **與 ai-service `PRICING` 一字不差**（contract test 會強制）。
- `DEFAULT_MODEL_ID` — 系統預設改才動。

### `backend/apps/ai/serializers.py`

- `StartRunSerializer.model_id.choices` — **必改**（ADD/REMOVE 都要同步清單）。

### `backend/apps/ai/views.py`

- `ModelListView.MODELS` — 前端選單的權威來源。欄位 `model_id` / `display_name` / `description` / `is_default` 與 ai-service `MODEL_INFO` 一致。

### `backend/apps/ai/models.py`

- `AIExecutionLog.model_used.default=` — 改要配 migration。
- `AIChatRun.model_id.default=` — 改要配 migration。

### Migration

變更任一 `default=` 後：

```bash
python manage.py makemigrations ai --name="<verb>_default_<detail>"
python manage.py migrate ai
```

### backend tests

| 檔案 | 動作 |
|---|---|
| `apps/ai/tests/test_pricing_alignment.py` | 不改（AST 比對自動檢查）|
| `apps/ai/tests/test_model_contract.py` | `model_ids` 兩處斷言照 serializer.choices 與 MODELS 同步 |
| `apps/ai/tests/test_credits.py` | 若刪掉的模型在測試中被引用（如 `deepseek-r1`），要 rewrite 斷言；pricing 變化需重算 credits 期望值 |

## 3. frontend

### `frontend/src/features/chatbot/hooks/useChatbot.ts`

- `FALLBACK_MODELS` — backend 不可用時的 fallback 清單，欄位與 `ModelListView.MODELS` 同步。
- `DEFAULT_MODEL_ID` — 系統預設。

### `frontend/src/features/chatbot/hooks/useChatbot.test.ts`

- `baseRun().modelId` 預設字串 — 切預設時 update。

### `frontend/src/features/chatbot/components/chat-ui/__stories__/ComposerBar.stories.tsx`

- `args.models` 列出用於 Storybook 展示的假清單；ADD/REMOVE 同步即可。

### `frontend/src/features/contest/screens/settings/ContestAiGradingScreen.tsx`

- `EXCLUDED_MODEL_IDS` — 在競賽 AI 批改畫面被排除的 model ids。新模型若「不適合批改」則加入；下架的 id 從 set 移除。

### `frontend/src/features/contest/screens/settings/grading/useAiQuestionGrading.ts`

- `AI_GRADING_DEFAULT_MODEL_ID` — 批改畫面的預設；**該值不可在 `EXCLUDED_MODEL_IDS`** 裡。REMOVE 該 id 時必須換成另一個模型。

### `frontend/src/shared/ai/ModelSelect.tsx`

- `normalizeModelLabel` — 只會自動去掉 `(Thinking)` 後綴。新模型 display_name **不要帶** `(Thinking)`；要標示 thinking 用 description。

## 4. 操作快速 checklist

### ADD 新模型
- [ ] `ai-service::_MODEL_MAP` / `MODEL_MAX_INPUT_TOKENS` / `MODEL_SUMMARY_TRIM_TOKENS` / `PRICING` / `MODEL_INFO`
- [ ] `backend::credits.DEFAULT_MODEL_PRICING` / `serializers.choices` / `views.ModelListView.MODELS`
- [ ] `frontend::useChatbot.FALLBACK_MODELS` / `ComposerBar.stories`
- [ ] 新增 `tests/test_model_factory.py::test_create_model_<id>`
- [ ] 更新 `backend::test_model_contract.py` 清單
- [ ] 更新 `ai-service::test_api.py::test_models_endpoint` 清單
- [ ] Pricing contract test / model_factory test / api test / tsc 全綠
- [ ] 真實 API smoke

### UPDATE pricing
- [ ] `ai-service::PRICING` + `backend::DEFAULT_MODEL_PRICING`（同一 commit）
- [ ] `test_credits.py` 重算期望 credits
- [ ] `test_pricing_alignment.py` 綠

### REMOVE 模型
- [ ] 確認無前後端預設仍指它；該模型為預設時先換預設 + migration
- [ ] 從所有 touch points 刪 entry（照前述表）
- [ ] 受影響的 tests 內 `model_id="<舊>"` 替換為仍存在的 id
- [ ] 若要留相容層：`_MODEL_MAP` 加 alias `"<舊>": "<新 provider string>"`（否則讀到舊 id 會 fallback 到 `_DEFAULT_MODEL_ID` + warning log）
- [ ] Migration（若有動 field default）
- [ ] 全套測試 + smoke
