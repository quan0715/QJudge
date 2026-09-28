# Configure AI models on a QJudge host

QJudge reads a host-specific catalog from `deploy/ai/models.yml`. The AI service owns the list exposed by `GET /v1/models`; the frontend and Django BFF use its effective default. The site stays available when AI settings are invalid, while AI model listing and run creation report `MODEL_CONFIG_INVALID`.

## Files

| File | Purpose |
| --- | --- |
| `deploy/ai/models.example.yml` | Versioned starting template |
| `deploy/ai/models.yml` | Ignored host-specific catalog; created by `deploy/qjudge init` |
| `deploy/ai/keys.env` | Ignored provider credentials, loaded only by `ai-service` and `ai-worker` |

An empty `models: []` is valid and disables AI features. Fill it before enabling AI. The `default` field is optional; when the configured default is temporarily unavailable, QJudge selects the first available model. Model IDs remain in historical runs after a model is removed.

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
  - id: campus-gemma
    provider: campus-vllm
    model: Gemma4-31B
    display_name: Campus Gemma
    max_input_tokens: 131072
endpoints:
  campus-vllm:
    base_url: http://10.0.0.5:8000/v1
```

`openai` and `deepseek` are built in. Other provider names need a matching `endpoints.<name>.base_url` with an HTTP(S) OpenAI-compatible endpoint. The key name is the uppercased provider name with `-` changed to `_`, then `_API_KEY`: for example `OPENAI_API_KEY` or `CAMPUS_VLLM_API_KEY`. Put these in `deploy/ai/keys.env`, never in YAML. Built-in providers require a nonempty key. A self-hosted endpoint may omit it; the client sends `EMPTY` as the SDK placeholder.

Set `default` to an entry's `id`. If `model` is omitted, the same value is sent to the provider. The configured [`deepseek-flash` API model](https://api-docs.deepseek.com/quick_start/pricing/) serves DeepSeek V4.1 Flash. Old DeepSeek V4 entries should be removed from a host catalog; historical run records retain their original model IDs.

For OpenAI, use [`gpt-6-luna`](https://developers.openai.com/api/docs/models/gpt-6-luna) with `reasoning_effort: medium` to route tool calls through the Responses API. The example limits input to 272,000 tokens to stay within Luna's short-context price tier. Retire `openai-nano`, `openai-mini`, and `openai-mini-medium` from a host catalog when switching to Luna. `openai-gemma4-31b` is a self-hosted vLLM model despite its ID; keep or remove it according to whether that endpoint is still offered. A valid `OPENAI_API_KEY` is required before adding Luna to a live catalog.

`max_input_tokens` must be positive. Built-in providers may omit it only when the installed LangChain profile has a context limit. For a self-hosted model, QJudge checks `/models` for `max_model_len` when no limit is configured; a missing or unreachable model is omitted from the available catalog and retried after 60 seconds. A static validation pass does not establish endpoint connectivity or successful generation.

## Validate and apply

After `qjudge init`, edit the catalog and keys on the target host. `deploy/qjudge upgrade <ref>` builds the new image and validates model configuration before starting the database or backing it up; an invalid file aborts while the previous services keep running.

To validate an already built image on the host, set `QJUDGE_VERSION` to its deployed image tag (for example `sha-<12-character-commit-prefix>`):

```sh
QJUDGE_VERSION=sha-123456789abc docker compose --project-directory deploy --env-file deploy/.env \
  -f deploy/compose.yml -f deploy/compose.build.yml \
  run --rm --no-deps ai-service python -m infrastructure.agent.model_config
```

The command reports all static problems and exits nonzero on failure. After editing `deploy/ai/` on a running host, recreate both AI processes to reload their cached catalogs:

```sh
QJUDGE_VERSION=sha-123456789abc docker compose --project-directory deploy --env-file deploy/.env \
  -f deploy/compose.yml -f deploy/compose.build.yml \
  up -d --no-deps --force-recreate ai-service ai-worker
```

Check AI service logs and the authenticated model list afterward. Verify a real native AI response separately when provider credentials and authorization are available.

## Move an existing installation

Copy each configured provider key from `deploy/.env` into `deploy/ai/keys.env`; move any `OPENAI_BASE_URL` or `DEEPSEEK_BASE_URL` to `endpoints.openai.base_url` or `endpoints.deepseek.base_url`. Convert `VLLM_BASE_URL` to a named self-hosted endpoint and set the corresponding model's `provider`. Keep existing model IDs if historical runs should show familiar names. Then delete `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `VLLM_API_KEY` and `VLLM_BASE_URL` from `deploy/.env`; `deploy/qjudge check` and `upgrade` reject them until they are gone. A release older than the catalog reads its credentials only from those entries, so `deploy/qjudge rollback` to such a release starts it without AI credentials.
