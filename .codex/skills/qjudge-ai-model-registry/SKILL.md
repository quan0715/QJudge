---
name: qjudge-ai-model-registry
description: 新增 / 更新 / 下架 AI 模型（ai-service + backend + frontend 全域）的操作 skill。涵蓋 canonical id、provider string、pricing、token 限制、預設值、migration、tests 與前端 fallback / 預設的一次性落點。
---

# QJudge AI Model Registry Owner

## Quick start

1. 決定操作類型：**ADD** / **UPDATE**（pricing、context、display）/ **REMOVE**。
2. 對照 `references/touch-points.md` 全部 touch point 逐一檢查。
3. 依 `references/cost-math.md` 驗算 credits / USD。
4. 驗證：pricing contract test、ai-service 端對端 smoke、前端 tsc、migration 套用。

## 責任邊界（Owner Scope）

- ✅ Canonical model id（`openai-nano` / `deepseek-v4` 等）。
- ✅ `ai-service/services/model_factory.py` 所有 lookup table（`_MODEL_MAP`、`PRICING`、`MODEL_MAX_INPUT_TOKENS`、`MODEL_SUMMARY_TRIM_TOKENS`、`MODEL_INFO`）。
- ✅ `backend/apps/ai/credits.py::DEFAULT_MODEL_PRICING`（與 ai-service `PRICING` 有 CI contract test 把關）。
- ✅ Backend `serializers.StartRunSerializer` choices、`ModelListView.MODELS`、`models.py` 預設、對應 Django migration。
- ✅ Frontend `FALLBACK_MODELS`、grading 預設、stories、ModelSelect label。
- ✅ 更動預設模型時的 deepagent_runner 介面 `model_id=` 預設。
- ❌ 不負責 credits 換算公式（`usage_to_credits`）本身；只負責 pricing 餵料。
- ❌ 不負責 provider SDK 整合細節（`ChatOpenAI` / `ChatDeepSeek` 初始化選項只動該 model 專用欄位）。
- ❌ 不負責 UI 視覺（交 `qjudge-ui-carbon-owner`）；只動 `MODEL_INFO.display_name` / `description`。

## 核心規則

- Canonical id 是前後端與 SDK 邊界的唯一識別；**provider model string 只出現在 `_MODEL_MAP` 一個地方**，其他檔案一律用 canonical id。
- `ai-service::PRICING` 與 `backend::DEFAULT_MODEL_PRICING` **永遠一致**，由 `backend/apps/ai/tests/test_pricing_alignment.py` AST 比對。兩邊要同一次 commit 改完。
- Pricing 單位：**cents per 1M tokens**（亦即 USD/1M × 100）。cache-hit input 目前未在 PRICING 表中追蹤（僅以 cache-miss 結算）。
- 變更 `backend/apps/ai/models.py` 的 `default=` 字串 **必須跟一支 Django migration**。
- 新模型顯示名稱：以 canonical id 為底（例：`deepseek-v4`、`gpt-5-nano`）；後端 `MODEL_INFO` / `ModelListView.MODELS` 與前端 `FALLBACK_MODELS` 三份 metadata **欄位一字不差**（`model_id` / `display_name` / `description` / `is_default`）。
- Frontend `ModelSelect.normalizeModelLabel` 會 trim 並 fallback 到 `gpt-5-nano`，**不會修改 display_name**。要在 label 直接顯示 thinking / variant（例：`deepseek-v4 (thinking)`）是預期做法。
- **DeepSeek V4 thinking mode 與多輪對話的接法**：thinking ON 時 API 要求每輪 assistant 訊息都把上一輪的 `reasoning_content` 回傳，LangChain 的 `AIMessage` 序列化預設會丟掉。解法已內建在 `model_factory.py::ReasoningPreservingChatDeepSeek`：覆寫 `_get_request_payload` 在送出前從 `additional_kwargs["reasoning_content"]` 讀回並填入對應的 assistant message dict。新增需 thinking 的 DeepSeek 模型（例如 `deepseek-v4-pro`）時**必須**使用該子類別；純聊天模型用原生 `ChatDeepSeek` 並以 `extra_body={"thinking": {"type": "disabled"}}` 關閉即可。

## 操作流程

### ADD 新模型

按 `references/touch-points.md` 的「ADD」欄逐項補齊，最後跑 `references/verify.sh` 的四個驗證。

### UPDATE 既有模型

只有 pricing / context / display 變動時：

1. `ai-service::PRICING` + `backend::DEFAULT_MODEL_PRICING` 同步更新。
2. 若 context 改變：`MODEL_MAX_INPUT_TOKENS`、必要時 `MODEL_SUMMARY_TRIM_TOKENS`。
3. `MODEL_INFO` / `ModelListView.MODELS` / `FALLBACK_MODELS` 三份 metadata 同步。
4. Pricing 變動必跑 `apps/ai/tests/test_pricing_alignment.py` 與 `apps/ai/tests/test_credits.py`；credits 預期值可能需要重算。
5. 不需要 migration（field default 字串沒變）。

### REMOVE / 下架模型

1. 先決定 **「誰要取代它」** 作為預設 fallback：
   - 原本是 system default（`_DEFAULT_MODEL_ID`、`models.py::default=`、`deepagent_runner` 3 個介面的 `model_id=` 預設）—改指向取代者並寫 migration。
   - 原本是 grading 預設（`AI_GRADING_DEFAULT_MODEL_ID`）—改指向合理的推理模型。
   - 歷史 session 若 DB 中有 `model_id="<舊>"` row，讀回時會 fallback 到 `_DEFAULT_MODEL_ID`（`ModelFactory.resolve_model_string` 含 warning log），不會壞；若要優雅 alias，在 `_MODEL_MAP` 加一行 `"<舊>": "<新 provider string>"` 當相容層。
2. 從所有 touch point 移除 entry（見 `references/touch-points.md` 的「REMOVE」欄）。
3. 相關 tests 裡硬編的 `model_id="<舊>"` 要換成 **仍存在的模型 id**，並重算 credits 期望值。
4. 跑 `references/verify.sh`。

## 驗證清單（照序）

1. `backend pytest apps/ai/tests/test_credits.py test_model_contract.py test_pricing_alignment.py` — pricing 契約與 credits 數學。
2. `ai-service pytest tests/test_model_factory.py` （**isolated run**，避免 stub 污染）— 每個 canonical id 的創建 kwargs。
3. `ai-service pytest tests/test_api.py` — `/api/models` 端點回傳順序與欄位。
4. `frontend tsc --noEmit` — 前端 types。
5. **真實 API smoke**（ADD 或 provider 變動時必跑）：
   ```bash
   bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T ai-service \
     python -c "
   import asyncio
   from services.model_factory import ModelFactory
   m = ModelFactory.create_model('<new-canonical-id>')
   asyncio.run(m.ainvoke('Reply only: OK'))
   "
   ```
6. 若動過 `backend/apps/ai/models.py::default=`：
   ```bash
   bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend \
     python manage.py makemigrations ai --name="<desc>" && \
     python manage.py migrate ai
   ```

## 參考

- `references/touch-points.md` — 每個檔案、每個 symbol 的欄位對照表（ADD/UPDATE/REMOVE 三欄）。
- `references/cost-math.md` — credits 計算公式、典型輪次對照、常見 pricing table。
