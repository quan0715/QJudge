# Configuring AI Models & Services

QJudge provides an AI Assistant and AI-assisted grading to help instructors draft questions, design grading criteria, and provide guided problem-solving hints to students. This is an **optional feature**: if AI is not configured on your server, all core coding evaluations, classroom rosters, and exams continue to function completely normally.

If you are using a university server or cloud VM, connect to the host via SSH and navigate to the QJudge project directory. Model catalogs and API keys are configured directly on this host—no manual entry in the web UI is required.

## Two Core Configuration Files

QJudge splits AI configuration into two files to balance version control management and secret security:

| File Path | Purpose |
| :--- | :--- |
| `deploy/ai/models.yml` | Defines available models, the default model, and custom endpoint URLs |
| `deploy/ai/keys.env` | Stores API keys for each provider, kept separate from code and version control |

## Step 1: Select & Configure Models (models.yml)

If `models.yml` does not exist yet in your directory, copy it from the provided template:

```bash
cp deploy/ai/models.example.yml deploy/ai/models.yml
```

Open `deploy/ai/models.yml` to edit. Here is an overview of the key fields:

- `default`: The model ID selected by default when users open the interface.
- `models`: The list of models provided by this host. For each model:
  - `id`: Unique identifier used for internal system routing and chat histories (e.g. `deepseek-flash`, `gpt-6-luna`).
  - `provider`: Provider identifier. Natively supports `openai` and `deepseek`; for self-hosted models, enter the endpoint name defined under `endpoints`.
  - `display_name`: The friendly name displayed in web menus for instructors and students (e.g. `DeepSeek V4.1 Flash`).
  - `model`: The model name sent to the upstream API (can be omitted if identical to `id`).
  - `max_input_tokens`: Maximum context length (recommended to prevent errors on excessively long prompts).
  - `reasoning_effort`: Reasoning thought depth (`low`, `medium`, or `high`, for models supporting extended thinking).
- `endpoints`: If using self-hosted API endpoints in your campus lab, specify their service base URLs here.

### Common Configuration Scenarios

#### Scenario A: Commercial Cloud Models (DeepSeek or OpenAI)

The most common approach is connecting directly to commercial provider APIs:

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

#### Scenario B: Campus or On-Premise Self-Hosted Endpoints (vLLM / Ollama)

If your institution runs local GPU servers with vLLM or Ollama serving an OpenAI-compatible API:

```yaml
default: campus-gemma
models:
  - id: campus-gemma
    provider: campus-vllm
    model: Gemma4-31B
    display_name: Campus Gemma 31B
    max_input_tokens: 131072
endpoints:
  campus-vllm:
    base_url: http://10.0.0.5:8000/v1
```

> **Tip**: Any inference framework supporting OpenAI-compatible endpoints (including `/v1/chat/completions`)—such as vLLM, TGI, Ollama, LocalAI, or LiteLLM—can be used as a custom endpoint.

#### Scenario C: Disabling AI Features Entirely

To disable all AI features and hide model selectors across the platform:

```yaml
models: []
```

## Step 2: Configure API Keys (keys.env)

API keys are consolidated in `deploy/ai/keys.env`. Do not write secrets into `models.yml`.

The environment variable naming rule is: **`<PROVIDER>_API_KEY`** (provider name in uppercase, replacing hyphens `-` with underscores `_`).

Create or edit `deploy/ai/keys.env`:

```env
# Commercial Provider API Keys
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxx

# Self-Hosted Endpoint Key (leave empty if your local server does not require authentication)
CAMPUS_VLLM_API_KEY=your-token-if-needed
```

## Step 3: Validate Configuration and Restart

After editing, run the configuration validation command on your host to check YAML syntax and schema:

```bash
docker compose -p qjudge exec ai-service python -m infrastructure.agent.model_config
```

If the terminal reports no errors, your configuration is valid. Restart the AI containers to apply the changes immediately (main services do not experience downtime):

```bash
docker compose -p qjudge restart ai-service ai-worker
```

When upgrading QJudge later with `deploy/qjudge upgrade`, this configuration will also be validated automatically.

## Step 4: Verify in the Web Interface

1. Log into QJudge as a teacher or administrator.
2. Navigate to problem creation/editing, or open the AI Assistant panel on the right.
3. Verify that the model dropdown correctly lists the `display_name` you configured.
4. Send a test message (such as "Explain the time complexity of binary search") to confirm the AI responds normally.

If the interface reports that the model is unavailable or misconfigured, inspect the container logs:

```bash
docker compose -p qjudge logs ai-service --tail=50
```

[Previous: Ingress & Optional Features](#/docs/deployment-options) · [Next: Configuring MCP Connections](#/docs/mcp-setup)
