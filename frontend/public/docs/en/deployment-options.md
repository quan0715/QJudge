# Ingress & Optional Features

This page covers how to expose QJudge to the public internet, as well as configurations for third-party OAuth, Email, AI providers, and MCP. All settings are defined in `deploy/.env`; after making changes, run `deploy/qjudge check` and re-run `upgrade` with your current version as outlined in Section 8 of the [Deployment Guide](deployment.md).

## Ingress Architecture

The `frontend` container is the sole HTTP ingress, binding to `FRONTEND_BIND_ADDRESS:FRONTEND_PORT` (defaults to `127.0.0.1:8080`). It serves web assets and reverse-proxies `/api`, `/o`, `/.well-known`, `/admin`, `/django-admin`, `/static`, `/media`, and `/mcp` to their respective backend services. Therefore, your main domain requires only a single reverse proxy rule.

Any reverse proxy placed in front of QJudge must:

- Preserve the original `Host` header (including port) and URI.
- Append to `X-Forwarded-For` and set `X-Forwarded-Proto`. When the public origin is HTTPS, the backend relies on `X-Forwarded-Proto` to detect encryption; omitting it results in infinite redirect loops.
- Disable request/response buffering for uploads and streaming responses. When bundled storage uses the main site, the proxy must also allow its upload sizes (the example uses `client_max_body_size 0`).
- For bundled LiveKit, forward WebSocket `Upgrade`/`Connection` headers and allow long connections.

Run `deploy/qjudge ingress --nginx` to print an Nginx configuration meeting these requirements.

## Reverse Proxy on the Same Host

Keep the defaults: leave `FRONTEND_BIND_ADDRESS` blank (defaults to `127.0.0.1`) and configure your reverse proxy to forward requests to `http://127.0.0.1:8080`. Since the frontend container only accepts local traffic, `QJUDGE_TRUSTED_PROXIES` can be left empty.

## Reverse Proxy on a Separate Host

For instance, when your VPS and reverse proxy communicate across a private network:

```text
FRONTEND_BIND_ADDRESS=10.0.0.5
QJUDGE_TRUSTED_PROXIES=10.0.0.2
```

- Set `FRONTEND_BIND_ADDRESS` to the internal IP of the VPS. The reverse proxy connects to `http://10.0.0.5:8080`.
- Set `QJUDGE_TRUSTED_PROXIES` to the IP or CIDR of the reverse proxy (separate multiple values with commas). The frontend only accepts `X-Forwarded-For` headers from these trusted addresses. If the bind address is non-local, this setting is mandatory, and `check` will reject insecure values such as `0.0.0.0/0`.
- Use host firewalls to restrict access to `FRONTEND_PORT` so only the reverse proxy can connect. Bundled MinIO (`9000`) and LiveKit (`7880`, `5349`) also bind to this address and should be similarly restricted.

After editing, run `upgrade` to apply changes. If bundled addons are running, run `deploy/qjudge addon storage up` / `addon media up` so they rebind to the new IP.

## Cloudflare Tunnel

If you prefer not to expose public HTTP ports on your server, use Cloudflare Tunnel:

```text
COMPOSE_PROFILES=tunnel
TUNNEL_TOKEN=<token provided by Cloudflare>
```

The `cloudflared` container belongs to the primary Compose project and is started automatically by `upgrade`. Run `deploy/qjudge ingress` to view the public hostnames you need to configure in Cloudflare: point your main site to `http://frontend:80`, which includes bundled MinIO and LiveKit signaling. Additional tunnel routes are needed only when you explicitly configure another storage or LiveKit domain.

Note: Cloudflare Tunnel only proxies HTTP/WebSocket traffic. Media and TURN ports for live monitoring must still be exposed directly; see [Live Monitoring Configuration](deployment-live-monitoring.md).

## Third-Party Authentication

QJudge natively supports NYCU, GitHub, and Google OAuth. Only configure the providers you wish to use; client IDs and secrets must be provided in pairs:

```text
GITHUB_OAUTH_CLIENT_ID=<client id>
GITHUB_OAUTH_CLIENT_SECRET=<client secret>
```

The callback URL to register in the provider's developer console is:

```text
https://judge.example.edu/auth/<provider>/callback
```

Replace `<provider>` with `nycu`, `github`, or `google`. Setting `AUTH_EMAIL_PASSWORD_ENABLED=false` disables username/password login, leaving OAuth as the sole login method. For a complete guide on acquiring OAuth credentials and callback settings, see [Third-Party Authentication Setup](#/docs/auth-setup).

## Email

Sending transactional emails requires an SMTP server:

```text
EMAIL_HOST=smtp.example.edu
EMAIL_PORT=587
EMAIL_HOST_USER=<username>
EMAIL_HOST_PASSWORD=<password>
DEFAULT_FROM_EMAIL=qjudge@example.edu
```

`EMAIL_HOST_USER` and `EMAIL_HOST_PASSWORD` must be provided together. Connections use TLS.

## AI Providers

The AI assistant feature functions by having QJudge make outbound API calls to model endpoints; your server only needs outbound internet access. Each host defines its available models in `deploy/ai/` (see [Configuring AI Models & Services](#/docs/ai-setup) for detailed field specifications and local model configurations):

| File | Purpose |
| --- | --- |
| `deploy/ai/models.yml` | Available models, default model selection, and custom endpoints; generated by `deploy/qjudge init` from `models.example.yml` |
| `deploy/ai/keys.env` | Provider API keys, loaded only into `ai-service` and `ai-worker` |

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
endpoints:
  campus-vllm:
    base_url: http://10.0.0.5:8000/v1
```

- `openai` and `deepseek` are built-in providers. Other names are treated as custom OpenAI-compatible endpoints and require a `base_url` under `endpoints`.
- API keys are named by converting the provider name to uppercase, replacing `-` with `_`, and suffixing `_API_KEY` (e.g. `OPENAI_API_KEY`, `CAMPUS_VLLM_API_KEY`). Store them in `keys.env`, not in YAML.
- When `model` is omitted, the model name sent to the API matches `id`. `default` is optional; if the default model is temporarily unavailable, the system automatically falls back to the first available model. Setting `models: []` disables AI capabilities entirely.
- `max_input_tokens` defines the context window limit.
- `reasoning_effort` can be set to `low`, `medium`, or `high` (supported on compatible cloud models).

If AI configuration errors occur, all other platform features continue operating normally; the AI assistant simply indicates a configuration error, with details logged in `ai-service`.

To apply changes in `deploy/ai/`, re-run `upgrade` and restart the two AI containers:

```bash
deploy/qjudge upgrade "$(sed -n 's/^current=//p' deploy/.version)"
docker compose -p qjudge restart ai-service ai-worker
```

To validate the configuration without restarting:

```bash
docker compose -p qjudge exec ai-service python -m infrastructure.agent.model_config
```

## Remote MCP

External AI tools connect via `<origin>/mcp` (e.g. `https://judge.example.edu/mcp`). This route and its OAuth metadata are routed automatically by the frontend container—no additional domains or ports are required. For client setup instructions, see [MCP Connection Setup](#/docs/mcp-setup).
