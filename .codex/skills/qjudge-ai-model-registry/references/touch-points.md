# Model Registry Touch Points

## AI service: authoritative catalog and runtime

### `ai-service/domain/model_registry.py`

- `MODEL_INFO`: canonical ID, display name, description, and `is_default`.
- `MODEL_IDS`: derived validation set. Do not maintain a second literal ID list.

### `ai-service/infrastructure/agent/model_factory.py`

| Symbol | Add | Update | Remove |
| --- | --- | --- | --- |
| `_MODEL_MAP` | Add canonical ID to provider string | Change for an upstream rename | Remove after stored-run compatibility is handled |
| OpenAI rate/reasoning maps | Add only when applicable | Update with provider constraints | Remove |
| Context and summary maps | Required | Update policy | Remove |
| `_DEEPSEEK_THINKING_MODEL_IDS` | Add thinking models | Update mode | Remove |
| `_DEFAULT_MODEL_ID` | Change only for the system default | Align with metadata | Replace before removing the default |
| `create_model()` | Add a branch only for a new provider family | Update provider kwargs | Remove unused provider logic |

Thinking-enabled DeepSeek models use `ReasoningPreservingChatDeepSeek`. OpenAI reasoning variants use the Responses API settings in the factory.

### API and tests

- `ai-service/api/schemas.py`: `StartRunRequest` validates against `MODEL_IDS`.
- `ai-service/api/routers/system.py`: `GET /v1/models` returns `MODEL_INFO`.
- `ai-service/tests/test_model_factory.py`: provider mapping and registry/factory equality.
- `ai-service/tests/test_api.py`: accepted/rejected IDs and catalog order.
- `ai-service/tests/unit/test_provider_endpoint_config.py`: provider endpoint configuration.

## Django compatibility BFF

- `backend/apps/ai/serializers.py`: the request field has no choices and defers model validation to the AI Service.
- `backend/apps/ai/views.py`: `ModelListView` proxies `/v1/models`; it has no local catalog.
- `backend/apps/ai/tests/test_model_contract.py`: validates deferral and the compatibility default.
- `backend/apps/ai/tests/test_bff_contract.py`: validates forwarding.

The Django AI app no longer owns AI domain models, pricing, or credits. Model catalog changes do not require Django model migrations.

## Frontend consumers

- `frontend/src/infrastructure/copilot/qJudgeCopilotModelCatalog.ts`: maps API metadata to `CopilotModel`.
- `frontend/src/shared/copilot/react/CopilotProvider.tsx`: selects the API default, then the first entry.
- `frontend/src/features/contest/screens/settings/ContestAiGradingScreen.tsx`: grading exclusions.
- `frontend/src/features/contest/screens/settings/grading/useAiQuestionGrading.ts`: grading default.
- `frontend/src/features/chatbot/components/chat-ui/__stories__/ComposerBar.stories.tsx`: story fixture, not a runtime registry.

## Change checklist

### Add or update

- Update `MODEL_INFO` and the factory maps.
- Update only tests and consumers that intentionally name the model.
- Verify factory creation, request validation, `/v1/models`, BFF forwarding, grading eligibility, and frontend typecheck.

### Remove or rename

- Inspect stored AI-service runs for the old ID.
- Add an Alembic data migration if stored rows require rewriting.
- Replace system, summarization, and grading defaults before removal.
- Verify legacy IDs are rejected after migration and the catalog has no stale entry.
