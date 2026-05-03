# QJudge MCP Maintenance Guide

This document is the maintenance entry point for the QJudge MCP server and its
ChatGPT App widget integration.

## Runtime Shape

- MCP server: `mcp-server/server.py`
- Transport: Streamable HTTP
- Internal container URL: `http://qjudge-mcp:9000`
- Local host URL: `http://localhost:9002`
- Dev public URL: `https://mcp-dev.quan.wtf`
- Dev MCP endpoint: `https://mcp-dev.quan.wtf/mcp`
- OAuth issuer: `https://q-judge-dev.quan.wtf`
- Widget resource URI: `ui://widget/classroom-list-v2.html`
- Widget bundle path in container: `/app/mcp-widgets/mcp-classroom-list.js`

ChatGPT currently sends MCP requests to both `/mcp` and `/`. The server keeps
`/mcp` as the canonical route and registers `/` as a compatibility alias.

## Environment

The dev tunnel expects these environment values:

```bash
FRONTEND_URL=https://q-judge-dev.quan.wtf
OAUTH_ISSUER_URL=https://q-judge-dev.quan.wtf
MCP_PUBLIC_URL=https://mcp-dev.quan.wtf
```

The Cloudflare tunnel routes should point to:

```text
q-judge-dev.quan.wtf -> http://frontend:5173
mcp-dev.quan.wtf     -> http://qjudge-mcp:9000
```

Do not print full compose config in shared logs because it expands secrets.
When checking runtime values, inspect only the specific safe variables needed.

## Build And Restart

The MCP container reads the built widget bundle from the frontend build output.
Build the frontend before restarting the MCP server:

```bash
npm --prefix frontend run build
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d --build qjudge-mcp
```

If only the mounted widget bundle changed and `server.py` did not change, a
restart is enough:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev restart qjudge-mcp
```

If `server.py`, `config.py`, or the Docker image content changed, rebuild.

## OAuth Flow

The frontend dev server proxies OAuth discovery and token routes to Django:

- `/.well-known/*`
- `/o/*`

Keep the Vite proxy route as `^/o/`, not `/o`. A broad `/o` proxy also catches
frontend routes such as `/oauth/authorize` and breaks ChatGPT login redirects.

Expected unauthenticated MCP response:

```bash
curl -i https://mcp-dev.quan.wtf/mcp
```

The response should be `401` with a `WWW-Authenticate` header containing:

```text
resource_metadata="https://mcp-dev.quan.wtf/.well-known/oauth-protected-resource"
```

The protected resource metadata should advertise:

```text
resource=https://mcp-dev.quan.wtf/
authorization_servers=["https://q-judge-dev.quan.wtf/"]
```

## Widget Contract

The classroom widget is registered as an MCP resource:

```text
ui://widget/classroom-list-v2.html
```

The resource MIME type must stay:

```text
text/html;profile=mcp-app
```

The widget is intentionally self-contained. Do not introduce external Vite
chunks, React shared chunks, CDN scripts, or relative asset imports unless the
resource loader is also changed to inline those assets. ChatGPT loads the
`ui://` HTML resource, so relative paths such as `../assets/index-*.js` can
leave the iframe blank.

When changing widget HTML or bridge behavior in a way ChatGPT may cache, bump
the URI version, for example:

```text
ui://widget/classroom-list-v3.html
```

Update every `openai/outputTemplate` and `_meta.ui.resourceUri` reference to
the new URI.

## Tools

The UI entry tools are:

- `show_qjudge_classrooms_ui`: fetches manageable classrooms and renders the
  widget in one call.
- `render_classroom_list`: renders a widget from an already fetched classroom
  list.

Both tools return:

- `structuredContent.classrooms` for the model and widget
- `_meta.ui.resourceUri`
- `_meta["openai/outputTemplate"]`

Keep tool descriptions action-oriented. ChatGPT relies on these descriptions
to decide when to use the widget instead of writing a Markdown table.

## Verification

Run the focused MCP tests:

```bash
mcp-server/.venv/bin/python -m pytest mcp-server/tests/test_server.py
```

Verify the built widget is self-contained:

```bash
rg -n "^import|from[\\\"']\\.\\." frontend/dist/mcp-widgets/mcp-classroom-list.js
```

No matches should be returned.

Verify the container can read the widget:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T qjudge-mcp \
  ls -l /app/mcp-widgets/mcp-classroom-list.js
```

Verify the resource content from inside the container:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T qjudge-mcp python - <<'PY'
import server

html = server.serve_classroom_list_widget()
print("template_uri=", server.CLASSROOM_LIST_TEMPLATE_URI)
print("has_bundle_missing=", "UI bundle not found" in html)
print("has_external_import=", 'from"../assets/' in html or "from'../assets/" in html)
print("has_tool_output_reader=", "toolOutput" in html)
PY
```

Expected:

```text
template_uri= ui://widget/classroom-list-v2.html
has_bundle_missing= False
has_external_import= False
has_tool_output_reader= True
```

## Troubleshooting

`UI bundle not found`

- Run `npm --prefix frontend run build`.
- Confirm `frontend/dist/mcp-widgets/mcp-classroom-list.js` exists.
- Confirm the compose mount exists:
  `./frontend/dist/mcp-widgets:/app/mcp-widgets:ro`.

Blank iframe

- Check that the widget bundle has no external `import` statements.
- Check that the resource URI was bumped after changing the widget.
- Start a new ChatGPT conversation or reconnect the app to avoid cached widget
  HTML.

OAuth redirects to `http://backend:8000/oauth/authorize`

- Confirm Vite proxy uses `^/o/`, not `/o`.
- Confirm OAuth browser-facing routes stay on the frontend hostname.

ChatGPT POSTs `/` and gets `404`

- Keep the root route alias in `server.py`.
- `/mcp` remains canonical, but `/` must route to the same Streamable HTTP app.

Unauthenticated `/mcp` does not return `401`

- Check `MCP_PUBLIC_URL`.
- Check `OAUTH_ISSUER_URL`.
- Check `.well-known/oauth-protected-resource`.
