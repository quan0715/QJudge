# AI Model Configuration Touch Points

| File | Role |
| --- | --- |
| `deploy/ai/models.example.yml` | Versioned example; `qjudge init` copies it to the ignored per-host `models.yml` |
| `deploy/ai/models.yml` | Enabled models, optional default, endpoint URLs on this host |
| `deploy/ai/keys.env` | Provider API keys, loaded only by `ai-service` and `ai-worker` |
| `deploy/compose.yml` | Read-only `/etc/qjudge-ai` bind and optional `keys.env` env file for both AI processes |
| `deploy/qjudge_cli/release.py` | `MODEL_CONFIG_CHECK` runs the new image's validator after build and before database startup or backup |
| `ci/ai/models.yml` | E2E model catalog pointed at the fake OpenAI-compatible adapter |
| `ai-service/domain/model_catalog.py` | Configuration and availability types and public errors |
| `ai-service/infrastructure/agent/model_config.py` | YAML parsing, static validation, CLI |
| `ai-service/infrastructure/agent/model_catalog.py` | Process-local catalog, context limits, endpoint probes, effective default |
| `ai-service/infrastructure/agent/provider_adapters.py` | Built-in OpenAI/DeepSeek and compatible client construction |
| `ai-service/infrastructure/agent/model_factory.py` | Creates a configured client and stamps context metadata |
| `ai-service/api/routers/system.py` | `GET /v1/models` lists available models |
| `ai-service/api/routers/runs.py` | Resolves optional requested ID before starting a run |
| `backend/apps/ai/serializers.py`, `views.py` | Optional ID passthrough; upstream code passthrough |
| `frontend/src/shared/ai/modelAvailabilityNotice.ts` | Maps catalog and run failures to blocking or recoverable UI notices |
| `frontend/src/features/contest/screens/settings/ContestAiGradingScreen.tsx` | Uses catalog default for grading |

`models.yml` is process-cached. Recreate both AI services after editing it. The CLI checks structure and keys; `/v1/models` and logs reveal self-hosted endpoint connectivity and `max_model_len` probe failures. A real model response requires a separate provider smoke test.
