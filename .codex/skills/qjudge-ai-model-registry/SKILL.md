---
name: qjudge-ai-model-registry
description: Use when adding a QJudge AI provider adapter, changing how models are configured per host, or editing deploy/ai/models.yml.
---

# QJudge AI Model Configuration

## Ownership

| Concern | Source of truth |
| --- | --- |
| Models offered on one host, default, self-hosted endpoints | `deploy/ai/models.yml` (copy `deploy/ai/models.example.yml`) |
| Provider credentials | `deploy/ai/keys.env`; env name is `<PROVIDER>_API_KEY` with `-` replaced by `_` |
| Built-in OpenAI and DeepSeek calls | `ai-service/infrastructure/agent/provider_adapters.py` |
| Configuration validation | `ai-service/infrastructure/agent/model_config.py` |
| Runtime availability and effective default | `ai-service/infrastructure/agent/model_catalog.py` |
| Public catalog | AI service `GET /v1/models` |

The AI service owns model validation. Django forwards optional model IDs and errors; the frontend reads the catalog. Neither keeps a production model list or default. Self-hosted providers use the OpenAI-compatible adapter and need an endpoint URL. See [AI deployment operations](../../../docs/operations/ai-model-configuration.md).

## Change one host's models

1. Edit only that host's ignored `deploy/ai/models.yml` and `deploy/ai/keys.env`. Keep credentials out of YAML and Git. `default` is optional; the first available model is used if it is omitted or temporarily unavailable.
2. Validate in the AI image: `python -m infrastructure.agent.model_config` (inside `ai-service`, with `deploy/ai` mounted at `/etc/qjudge-ai`). It lists all static configuration problems. It does not probe self-hosted endpoints.
3. Recreate both `ai-service` and `ai-worker` so their process-local catalogs reload. Check `/v1/models` through the BFF and the AI service logs for endpoint probe failures.

A host-specific model change needs no code release. Empty `models: []` disables AI features without stopping the website. A missing or invalid config returns `MODEL_CONFIG_INVALID` for model listing and run start. A removed or unavailable ID returns `MODEL_NOT_AVAILABLE` at run start.

## Add a built-in provider

1. Add the provider to `BUILTIN_PROVIDERS`, its profile lookup branch in `builtin_max_input_tokens`, and its call branch in `build_chat_model` in `provider_adapters.py`. Add the SDK dependency if required.
2. Cover normal calls, reasoning options, key handling and profile lookup in `tests/test_provider_adapters.py`. Add configuration and catalog tests for provider-specific validation.
3. Keep the YAML field shape unchanged. Update the example only when a provider option needs explaining.

For OpenAI reasoning models, use the Responses API settings in the adapter. Thinking-enabled DeepSeek uses `ReasoningPreservingChatDeepSeek` to echo prior `reasoning_content`.

## Rename or remove a host model ID

Historical runs retain and display their original `model_id`; do not rewrite stored runs or add an alias automatically. Verify the current catalog, default selection and run-start rejection for the removed ID. If a separate product requirement calls for historical rewriting, design that migration explicitly.

QJudge stores raw token usage but has no active model pricing or credit-conversion registry. Do not recreate pricing tables during a model change; see `references/cost-math.md`.

## Verification

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T ai-service \
  python -m pytest -q tests/test_provider_adapters.py tests/test_model_config.py \
  tests/test_model_catalog.py tests/test_model_factory.py tests/test_api.py

.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend \
  python -m pytest -q --ds=config.settings.test \
  apps/ai/tests/test_start_run_serializer.py apps/ai/tests/test_bff_contract.py

.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run typecheck
python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy
```

The backend tests shown do not need a database. A real provider smoke test needs explicit authorization and usable credentials. Read `references/touch-points.md` for the full file map.
