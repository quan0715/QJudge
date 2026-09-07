---
name: qjudge-ai-model-registry
description: Use when adding, updating, removing, renaming, or changing the default of a QJudge AI model across the AI service, Django compatibility BFF, and frontend model consumers.
---

# QJudge AI Model Registry Owner

## Current ownership

The AI service owns the live model catalog and validation.

| Concern | Source of truth |
| --- | --- |
| Public IDs and display metadata | `ai-service/domain/model_registry.py` |
| Provider string, SDK options, context limits | `ai-service/infrastructure/agent/model_factory.py` |
| Request validation | `ai-service/api/schemas.py` using `MODEL_IDS` |
| Public catalog | AI service `GET /v1/models` |
| Django compatibility API | `backend/apps/ai/serializers.py` and `backend/apps/ai/views.py` |
| Frontend catalog | `QJudgeCopilotModelCatalog` loads the API dynamically |
| Grading eligibility/default | `ContestAiGradingScreen.tsx` and `useAiQuestionGrading.ts` |

The backend intentionally does not duplicate the model enum or display metadata. It defers authoritative model validation to the AI Service. The frontend has no production fallback model registry.

## Change contract

1. Update `MODEL_INFO`. Keep exactly one `is_default: True` entry; `MODEL_IDS` is derived from it.
2. Update the matching factory entries: `_MODEL_MAP`, provider-specific settings, `MODEL_MAX_INPUT_TOKENS`, `MODEL_SUMMARY_TRIM_TOKENS`, and `_DEEPSEEK_THINKING_MODEL_IDS` when applicable.
3. Keep `_DEFAULT_MODEL_ID`, the default row in `MODEL_INFO`, and Django `StartRunSerializer.model_id.default` aligned.
4. Review `recursion_failure_handler.py`; change its independent summarization fallback only when that policy changes.
5. Update frontend grading exclusions/defaults and Storybook fixtures when the changed ID appears there. Runtime model options continue to come from the API.

Provider strings live only in `_MODEL_MAP`. Application, API, and UI boundaries use canonical IDs.

Removing or renaming an ID is not an alias operation: `ModelFactory.resolve_model_string()` rejects unknown IDs. Inspect stored AI-service runs before removal and add an Alembic data migration when historical rows need rewriting.

QJudge currently records raw token usage but has no active model pricing or credit-conversion registry. Do not recreate removed Django pricing tables as part of a model change. Read `references/cost-math.md` only for this cost-accounting boundary.

## Verification

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T ai-service \
  pytest tests/test_model_factory.py tests/test_api.py tests/unit/test_provider_endpoint_config.py

.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  pytest apps/ai/tests/test_model_contract.py apps/ai/tests/test_bff_contract.py

.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test \
  npm run typecheck
```

For a new provider model or changed provider string, run a real provider smoke test only with explicit authorization and available credentials.

## Reference

Read `references/touch-points.md` for add, update, and remove paths.
