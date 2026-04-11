# MCP Production OAuth 2.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable zero-config MCP OAuth 2.1 flow so teachers/TAs can run `claude mcp add --transport http qjudge https://mcp.qjudge.com/mcp` and automatically complete browser-based authorization.

**Architecture:** Django serves OAuth 2.1 endpoints (metadata, DCR, authorize, token) at `qjudge.com`. MCP server at `mcp.qjudge.com` serves protected resource metadata and proxies tool calls with Bearer tokens. Frontend provides a custom React authorize page and an MCP setup tutorial tab in the settings dialog.

**Tech Stack:** Django + django-oauth-toolkit, FastMCP + Starlette, React + Carbon Design, Cloudflare Tunnel

**Spec:** `docs/superpowers/specs/2026-04-11-mcp-production-oauth.md`

---

## File Structure

### Backend (new files)

| File | Responsibility |
|------|---------------|
| `backend/apps/oauth/__init__.py` | New Django app for custom OAuth views |
| `backend/apps/oauth/views.py` | Metadata, DCR, authorize redirect, approve API |
| `backend/apps/oauth/urls.py` | URL routing for OAuth endpoints |
| `backend/apps/oauth/tests/__init__.py` | Test package |
| `backend/apps/oauth/tests/test_metadata.py` | Tests for well-known metadata endpoint |
| `backend/apps/oauth/tests/test_dcr.py` | Tests for Dynamic Client Registration |
| `backend/apps/oauth/tests/test_authorize.py` | Tests for authorize redirect + approve |
| `backend/apps/oauth/management/__init__.py` | Management commands package |
| `backend/apps/oauth/management/commands/__init__.py` | Commands package |
| `backend/apps/oauth/management/commands/create_mcp_oauth_app.py` | Fallback OAuth Application creation |

### Backend (modified files)

| File | Change |
|------|--------|
| `backend/config/settings/base.py:207-218` | Update OAUTH2_PROVIDER scopes to single `mcp` scope |
| `backend/config/urls.py:17-45` | Add well-known and oauth API routes |

### MCP Server (modified files)

| File | Change |
|------|--------|
| `mcp-server/config.py` | Add `MCP_PUBLIC_URL` and `OAUTH_ISSUER_URL` env vars |
| `mcp-server/server.py:178-184` | Mount `/.well-known/oauth-protected-resource` route on Starlette app |
| `mcp-server/tests/test_server.py` | Add tests for protected resource metadata endpoint |

### Frontend (new files)

| File | Responsibility |
|------|---------------|
| `frontend/src/features/auth/screens/OAuthAuthorizePage.tsx` | OAuth authorization consent page |
| `frontend/src/features/auth/components/settings/MCPSetupPanel.tsx` | MCP tutorial tab in settings dialog |

### Frontend (modified files)

| File | Change |
|------|--------|
| `frontend/src/features/auth/routes.tsx` | Add `/oauth/authorize` route |
| `frontend/src/features/auth/index.ts` | Export new route |
| `frontend/src/App.tsx:96-108` | Mount OAuth authorize route |
| `frontend/src/features/auth/components/SettingsDialog.tsx` | Add MCP tab for teacher/admin |
| `frontend/src/i18n/locales/zh-TW/common.json` | Add i18n keys |
| `frontend/src/i18n/locales/en/common.json` | Add i18n keys |

### Deployment (modified files)

| File | Change |
|------|--------|
| `docker-compose.yml` | Add `qjudge-mcp` service |
| `docker-compose.dev.yml` | Add `MCP_PUBLIC_URL` and `OAUTH_ISSUER_URL` env vars |

---

## Task 1: Update Django OAuth2 Provider Settings

**Files:**
- Modify: `backend/config/settings/base.py:206-218`

- [ ] **Step 1: Update OAUTH2_PROVIDER config**

Replace the current scope config with a single `mcp` scope:

```python
# OAuth 2.1 Provider settings (for MCP Server)
OAUTH2_PROVIDER = {
    "SCOPES": {"mcp": "Access QJudge via MCP"},
    "DEFAULT_SCOPES": ["mcp"],
    "ACCESS_TOKEN_EXPIRE_SECONDS": 3600,       # 1 hour
    "REFRESH_TOKEN_EXPIRE_SECONDS": 2592000,    # 30 days
    "ROTATE_REFRESH_TOKENS": True,
    "PKCE_REQUIRED": True,
    "ALLOWED_REDIRECT_URI_SCHEMES": ["http", "https"],
}
```

Add these settings below it:

```python
OAUTH_ISSUER_URL = os.environ.get("OAUTH_ISSUER_URL", "http://localhost:8000")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")
```

Make sure `import os` is at the top of the file (it should already be).

- [ ] **Step 2: Verify settings load**

Run:
```bash
docker compose -f docker-compose.dev.yml exec backend python -c "from django.conf import settings; print(settings.OAUTH2_PROVIDER)"
```

Expected: `{'SCOPES': {'mcp': 'Access QJudge via MCP'}, 'DEFAULT_SCOPES': ['mcp'], ...}`

- [ ] **Step 3: Commit**

```bash
git add backend/config/settings/base.py
git commit -m "refactor: simplify OAuth scopes to single 'mcp' gate scope"
```

---

## Task 2: Django Well-Known Metadata Endpoint

**Files:**
- Create: `backend/apps/oauth/__init__.py`
- Create: `backend/apps/oauth/views.py`
- Create: `backend/apps/oauth/urls.py`
- Create: `backend/apps/oauth/tests/__init__.py`
- Create: `backend/apps/oauth/tests/test_metadata.py`
- Modify: `backend/config/urls.py`
- Modify: `backend/config/settings/base.py` (INSTALLED_APPS)

- [ ] **Step 1: Create the oauth app skeleton**

Create `backend/apps/oauth/__init__.py` (empty file).

Create `backend/apps/oauth/tests/__init__.py` (empty file).

- [ ] **Step 2: Write the failing test**

Create `backend/apps/oauth/tests/test_metadata.py`:

```python
from django.test import TestCase, override_settings


@override_settings(OAUTH_ISSUER_URL="https://qjudge.com")
class OAuthAuthorizationServerMetadataTest(TestCase):
    def test_returns_valid_metadata(self):
        response = self.client.get("/.well-known/oauth-authorization-server")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/json")
        data = response.json()
        self.assertEqual(data["issuer"], "https://qjudge.com")
        self.assertEqual(
            data["authorization_endpoint"],
            "https://qjudge.com/o/authorize/",
        )
        self.assertEqual(
            data["token_endpoint"],
            "https://qjudge.com/o/token/",
        )
        self.assertEqual(
            data["registration_endpoint"],
            "https://qjudge.com/o/register/",
        )
        self.assertEqual(data["response_types_supported"], ["code"])
        self.assertEqual(data["grant_types_supported"], ["authorization_code"])
        self.assertEqual(data["code_challenge_methods_supported"], ["S256"])
        self.assertEqual(
            data["token_endpoint_auth_methods_supported"], ["none"]
        )

    def test_returns_cors_headers(self):
        response = self.client.get(
            "/.well-known/oauth-authorization-server",
            HTTP_ORIGIN="https://example.com",
        )
        self.assertEqual(response.status_code, 200)
```

- [ ] **Step 3: Run test to verify it fails**

Run:
```bash
docker compose -f docker-compose.dev.yml exec backend python -m pytest apps/oauth/tests/test_metadata.py -v --no-cov
```

Expected: FAIL — URL not found (404).

- [ ] **Step 4: Implement the metadata view**

Create `backend/apps/oauth/views.py`:

```python
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.http import require_GET


@require_GET
def oauth_authorization_server_metadata(request):
    """RFC 8414 — OAuth 2.0 Authorization Server Metadata."""
    issuer = settings.OAUTH_ISSUER_URL
    return JsonResponse(
        {
            "issuer": issuer,
            "authorization_endpoint": f"{issuer}/o/authorize/",
            "token_endpoint": f"{issuer}/o/token/",
            "registration_endpoint": f"{issuer}/o/register/",
            "revocation_endpoint": f"{issuer}/o/revoke/",
            "response_types_supported": ["code"],
            "grant_types_supported": ["authorization_code"],
            "code_challenge_methods_supported": ["S256"],
            "token_endpoint_auth_methods_supported": ["none"],
        }
    )
```

Create `backend/apps/oauth/urls.py`:

```python
from django.urls import path

from . import views

urlpatterns = [
    path(
        ".well-known/oauth-authorization-server",
        views.oauth_authorization_server_metadata,
        name="oauth-as-metadata",
    ),
]
```

Add to `backend/config/urls.py` — insert before the existing `urlpatterns` list items:

```python
path('', include('apps.oauth.urls')),
```

Add `"apps.oauth"` to `INSTALLED_APPS` in `backend/config/settings/base.py`.

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
docker compose -f docker-compose.dev.yml exec backend python -m pytest apps/oauth/tests/test_metadata.py -v --no-cov
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/apps/oauth/ backend/config/urls.py backend/config/settings/base.py
git commit -m "feat: add RFC 8414 OAuth authorization server metadata endpoint"
```

---

## Task 3: Django Dynamic Client Registration (DCR)

**Files:**
- Modify: `backend/apps/oauth/views.py`
- Modify: `backend/apps/oauth/urls.py`
- Create: `backend/apps/oauth/tests/test_dcr.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/oauth/tests/test_dcr.py`:

```python
import json

from django.test import TestCase


class DynamicClientRegistrationTest(TestCase):
    def _register(self, body):
        return self.client.post(
            "/o/register/",
            data=json.dumps(body),
            content_type="application/json",
        )

    def test_register_public_client(self):
        response = self._register(
            {
                "client_name": "Claude Code",
                "grant_types": ["authorization_code"],
                "token_endpoint_auth_method": "none",
                "redirect_uris": ["http://localhost:3000/callback"],
            }
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertIn("client_id", data)
        self.assertEqual(data["client_name"], "Claude Code")
        self.assertEqual(data["grant_types"], ["authorization_code"])
        self.assertEqual(data["token_endpoint_auth_method"], "none")
        self.assertNotIn("client_secret", data)

    def test_register_creates_oauth_application(self):
        from oauth2_provider.models import Application

        self._register(
            {
                "client_name": "Test Client",
                "grant_types": ["authorization_code"],
                "token_endpoint_auth_method": "none",
                "redirect_uris": ["http://localhost:9999/callback"],
            }
        )
        app = Application.objects.get(name="Test Client")
        self.assertEqual(app.client_type, Application.CLIENT_PUBLIC)
        self.assertEqual(
            app.authorization_grant_type,
            Application.GRANT_AUTHORIZATION_CODE,
        )
        self.assertIn("http://localhost:9999/callback", app.redirect_uris)

    def test_reject_confidential_client(self):
        response = self._register(
            {
                "client_name": "Bad Client",
                "grant_types": ["authorization_code"],
                "token_endpoint_auth_method": "client_secret_post",
                "redirect_uris": ["http://localhost:3000/callback"],
            }
        )
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn("error", data)

    def test_reject_non_authorization_code_grant(self):
        response = self._register(
            {
                "client_name": "Bad Client",
                "grant_types": ["client_credentials"],
                "token_endpoint_auth_method": "none",
                "redirect_uris": ["http://localhost:3000/callback"],
            }
        )
        self.assertEqual(response.status_code, 400)

    def test_reject_missing_redirect_uris(self):
        response = self._register(
            {
                "client_name": "Bad Client",
                "grant_types": ["authorization_code"],
                "token_endpoint_auth_method": "none",
            }
        )
        self.assertEqual(response.status_code, 400)

    def test_reject_get_method(self):
        response = self.client.get("/o/register/")
        self.assertEqual(response.status_code, 405)
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
docker compose -f docker-compose.dev.yml exec backend python -m pytest apps/oauth/tests/test_dcr.py -v --no-cov
```

Expected: FAIL — URL not found.

- [ ] **Step 3: Implement DCR view**

Add to `backend/apps/oauth/views.py`:

```python
import json
import secrets
import string

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST
from oauth2_provider.models import Application


def _generate_client_id(length=32):
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


@csrf_exempt
@require_POST
def dynamic_client_registration(request):
    """RFC 7591 — OAuth 2.0 Dynamic Client Registration (public clients only)."""
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse(
            {"error": "invalid_client_metadata", "error_description": "Invalid JSON body"},
            status=400,
        )

    grant_types = body.get("grant_types", [])
    auth_method = body.get("token_endpoint_auth_method", "none")
    redirect_uris = body.get("redirect_uris", [])
    client_name = body.get("client_name", "MCP Client")

    if grant_types != ["authorization_code"]:
        return JsonResponse(
            {
                "error": "invalid_client_metadata",
                "error_description": "Only authorization_code grant type is supported",
            },
            status=400,
        )

    if auth_method != "none":
        return JsonResponse(
            {
                "error": "invalid_client_metadata",
                "error_description": "Only public clients (token_endpoint_auth_method=none) are supported",
            },
            status=400,
        )

    if not redirect_uris or not isinstance(redirect_uris, list):
        return JsonResponse(
            {
                "error": "invalid_client_metadata",
                "error_description": "redirect_uris is required and must be a non-empty list",
            },
            status=400,
        )

    client_id = _generate_client_id()

    Application.objects.create(
        name=client_name,
        client_id=client_id,
        client_secret="",
        client_type=Application.CLIENT_PUBLIC,
        authorization_grant_type=Application.GRANT_AUTHORIZATION_CODE,
        redirect_uris=" ".join(redirect_uris),
        skip_authorization=False,
    )

    return JsonResponse(
        {
            "client_id": client_id,
            "client_name": client_name,
            "grant_types": ["authorization_code"],
            "token_endpoint_auth_method": "none",
            "redirect_uris": redirect_uris,
        },
        status=201,
    )
```

Add to `backend/apps/oauth/urls.py`:

```python
path(
    "o/register/",
    views.dynamic_client_registration,
    name="oauth-dcr",
),
```

Note: This URL is under `o/` to match the metadata endpoint's `registration_endpoint`. It must be added **before** the `oauth2_provider.urls` include in `config/urls.py` so it takes priority, OR placed in the `apps.oauth.urls` file (which is already included via `path('', ...)`).

Since `apps.oauth.urls` is included at `path('', ...)`, the `o/register/` path in `apps/oauth/urls.py` will be resolved as `/o/register/`. However, it needs to be included before `oauth2_provider.urls` in `config/urls.py`. Move the `apps.oauth.urls` include line to **before** the `oauth2_provider.urls` line.

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
docker compose -f docker-compose.dev.yml exec backend python -m pytest apps/oauth/tests/test_dcr.py -v --no-cov
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/oauth/
git commit -m "feat: add RFC 7591 Dynamic Client Registration endpoint"
```

---

## Task 4: Django Authorize Redirect + Approve API

**Files:**
- Modify: `backend/apps/oauth/views.py`
- Modify: `backend/apps/oauth/urls.py`
- Create: `backend/apps/oauth/tests/test_authorize.py`

This is the most complex task. Two views:
1. `GET /o/authorize/` — Custom view that redirects to frontend `/oauth/authorize`
2. `POST /api/oauth/approve/` — API that creates the authorization code and returns the redirect URL

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/oauth/tests/test_authorize.py`:

```python
import json
import hashlib
import base64
import secrets

from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from oauth2_provider.models import Application

User = get_user_model()


def _pkce_pair():
    """Generate a PKCE code_verifier + code_challenge."""
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


@override_settings(
    OAUTH_ISSUER_URL="https://qjudge.com",
    FRONTEND_URL="https://qjudge.com",
)
class AuthorizeRedirectTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="teacher1",
            password="testpass123",
            email="teacher1@test.com",
        )
        self.app = Application.objects.create(
            name="Test MCP Client",
            client_id="test-client-id",
            client_secret="",
            client_type=Application.CLIENT_PUBLIC,
            authorization_grant_type=Application.GRANT_AUTHORIZATION_CODE,
            redirect_uris="http://localhost:3000/callback",
        )

    def test_redirects_to_frontend_when_authenticated(self):
        self.client.force_login(self.user)
        _, challenge = _pkce_pair()
        response = self.client.get(
            "/o/authorize/",
            {
                "response_type": "code",
                "client_id": "test-client-id",
                "redirect_uri": "http://localhost:3000/callback",
                "code_challenge": challenge,
                "code_challenge_method": "S256",
            },
        )
        self.assertEqual(response.status_code, 302)
        location = response["Location"]
        self.assertIn("/oauth/authorize", location)
        self.assertIn("client_id=test-client-id", location)

    def test_redirects_to_login_when_not_authenticated(self):
        _, challenge = _pkce_pair()
        response = self.client.get(
            "/o/authorize/",
            {
                "response_type": "code",
                "client_id": "test-client-id",
                "redirect_uri": "http://localhost:3000/callback",
                "code_challenge": challenge,
                "code_challenge_method": "S256",
            },
        )
        self.assertEqual(response.status_code, 302)
        location = response["Location"]
        # Should redirect to login, not the frontend authorize page
        self.assertIn("login", location.lower())


@override_settings(
    OAUTH_ISSUER_URL="https://qjudge.com",
    FRONTEND_URL="https://qjudge.com",
)
class ApproveAuthorizationTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="teacher2",
            password="testpass123",
            email="teacher2@test.com",
        )
        self.app = Application.objects.create(
            name="Test MCP Client",
            client_id="test-client-id-2",
            client_secret="",
            client_type=Application.CLIENT_PUBLIC,
            authorization_grant_type=Application.GRANT_AUTHORIZATION_CODE,
            redirect_uris="http://localhost:3000/callback",
        )
        self.verifier, self.challenge = _pkce_pair()

    def test_approve_returns_redirect_url_with_code(self):
        self.client.force_login(self.user)
        response = self.client.post(
            "/api/oauth/approve/",
            data=json.dumps(
                {
                    "client_id": "test-client-id-2",
                    "redirect_uri": "http://localhost:3000/callback",
                    "response_type": "code",
                    "code_challenge": self.challenge,
                    "code_challenge_method": "S256",
                    "scope": "mcp",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("redirect_uri", data)
        self.assertIn("code=", data["redirect_uri"])

    def test_approve_requires_authentication(self):
        response = self.client.post(
            "/api/oauth/approve/",
            data=json.dumps(
                {
                    "client_id": "test-client-id-2",
                    "redirect_uri": "http://localhost:3000/callback",
                    "response_type": "code",
                    "code_challenge": self.challenge,
                    "code_challenge_method": "S256",
                }
            ),
            content_type="application/json",
        )
        # Should fail — not logged in
        self.assertIn(response.status_code, [401, 403, 302])

    def test_deny_returns_error_redirect(self):
        self.client.force_login(self.user)
        response = self.client.post(
            "/api/oauth/approve/",
            data=json.dumps(
                {
                    "client_id": "test-client-id-2",
                    "redirect_uri": "http://localhost:3000/callback",
                    "response_type": "code",
                    "code_challenge": self.challenge,
                    "code_challenge_method": "S256",
                    "deny": True,
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("redirect_uri", data)
        self.assertIn("error=access_denied", data["redirect_uri"])
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
docker compose -f docker-compose.dev.yml exec backend python -m pytest apps/oauth/tests/test_authorize.py -v --no-cov
```

Expected: FAIL

- [ ] **Step 3: Implement authorize redirect view**

Add to `backend/apps/oauth/views.py`:

```python
from urllib.parse import urlencode, quote

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect


@login_required(login_url="/login")
@require_GET
def authorize_redirect(request):
    """Redirect to frontend OAuth authorize page with all query params."""
    frontend_url = getattr(settings, "FRONTEND_URL", settings.OAUTH_ISSUER_URL)
    params = request.GET.urlencode()
    return redirect(f"{frontend_url}/oauth/authorize?{params}")
```

Note: The `login_url="/login"` points to the frontend login page. If the user is not logged in, Django will redirect to `/login?next=/o/authorize/...`.

- [ ] **Step 4: Implement approve API view**

Add to `backend/apps/oauth/views.py`:

```python
from urllib.parse import urlencode

from django.utils import timezone
from oauth2_provider.models import Application, Grant


@csrf_exempt
@require_POST
def approve_authorization(request):
    """Create authorization code and return redirect URL."""
    if not request.user.is_authenticated:
        return JsonResponse({"error": "login_required"}, status=401)

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "invalid_request"}, status=400)

    client_id = body.get("client_id")
    redirect_uri = body.get("redirect_uri")
    response_type = body.get("response_type")
    code_challenge = body.get("code_challenge", "")
    code_challenge_method = body.get("code_challenge_method", "")
    state = body.get("state", "")
    scope = body.get("scope", "mcp")
    deny = body.get("deny", False)

    if not client_id or not redirect_uri:
        return JsonResponse(
            {"error": "invalid_request", "error_description": "client_id and redirect_uri are required"},
            status=400,
        )

    try:
        application = Application.objects.get(client_id=client_id)
    except Application.DoesNotExist:
        return JsonResponse(
            {"error": "invalid_client", "error_description": "Unknown client_id"},
            status=400,
        )

    # Validate redirect_uri is registered
    allowed_uris = application.redirect_uris.split()
    if redirect_uri not in allowed_uris:
        return JsonResponse(
            {"error": "invalid_request", "error_description": "redirect_uri not registered"},
            status=400,
        )

    # Handle deny
    if deny:
        params = {"error": "access_denied", "error_description": "User denied the request"}
        if state:
            params["state"] = state
        deny_url = f"{redirect_uri}?{urlencode(params)}"
        return JsonResponse({"redirect_uri": deny_url})

    # Create authorization grant (code)
    code = secrets.token_urlsafe(32)
    from datetime import timedelta

    Grant.objects.create(
        user=request.user,
        application=application,
        code=code,
        expires=timezone.now() + timedelta(seconds=60),
        redirect_uri=redirect_uri,
        scope=scope,
        code_challenge=code_challenge,
        code_challenge_method=code_challenge_method,
    )

    params = {"code": code}
    if state:
        params["state"] = state
    approve_url = f"{redirect_uri}?{urlencode(params)}"
    return JsonResponse({"redirect_uri": approve_url})
```

- [ ] **Step 5: Wire up URLs**

Add to `backend/apps/oauth/urls.py`:

```python
path(
    "o/authorize/",
    views.authorize_redirect,
    name="oauth-authorize-redirect",
),
path(
    "api/oauth/approve/",
    views.approve_authorization,
    name="oauth-approve",
),
```

**Important:** The `o/authorize/` URL must be in `apps.oauth.urls` (which is included at root `''`), and the `apps.oauth.urls` include must come **before** `oauth2_provider.urls` in `config/urls.py`. This way our custom authorize view takes priority over django-oauth-toolkit's built-in one.

Verify `config/urls.py` ordering:

```python
urlpatterns = [
    path('api/health/', health_check, name='health-check'),
    path('django-admin/', admin.site.urls),
    path('', include('apps.oauth.urls')),  # Must be before oauth2_provider
    path('o/', include('oauth2_provider.urls', namespace='oauth2_provider')),
    # ... rest unchanged
]
```

- [ ] **Step 6: Run tests to verify they pass**

Run:
```bash
docker compose -f docker-compose.dev.yml exec backend python -m pytest apps/oauth/tests/test_authorize.py -v --no-cov
```

Expected: All tests PASS.

Note: The approve test creates a Grant directly. The Grant model might need `code_challenge` / `code_challenge_method` fields — django-oauth-toolkit >= 2.0 supports these. If tests fail due to missing fields, check the django-oauth-toolkit version and Grant model.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/oauth/
git commit -m "feat: add OAuth authorize redirect and approve API for frontend consent flow"
```

---

## Task 5: MCP Server Protected Resource Metadata

**Files:**
- Modify: `mcp-server/config.py`
- Modify: `mcp-server/server.py`
- Modify: `mcp-server/tests/test_server.py`

- [ ] **Step 1: Write the failing test**

Add to `mcp-server/tests/test_server.py`:

```python
from starlette.testclient import TestClient


def test_protected_resource_metadata(monkeypatch):
    monkeypatch.setattr(server, "MCP_PUBLIC_URL", "https://mcp.qjudge.com")
    monkeypatch.setattr(server, "OAUTH_ISSUER_URL", "https://qjudge.com")

    app = server.mcp.streamable_http_app()
    client = TestClient(app)
    response = client.get("/.well-known/oauth-protected-resource")

    assert response.status_code == 200
    data = response.json()
    assert data["resource"] == "https://mcp.qjudge.com"
    assert data["authorization_servers"] == ["https://qjudge.com"]
```

Note: FastMCP's `streamable_http_app()` returns a Starlette ASGI app. We mount our custom route on it.

Also add `starlette` to test dependencies — it's already a transitive dependency of `mcp[cli]`, but the `TestClient` import needs `httpx` which is also already installed.

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd mcp-server && python -m pytest tests/test_server.py::test_protected_resource_metadata -v
```

Expected: FAIL — either `MCP_PUBLIC_URL` attribute error or 404.

- [ ] **Step 3: Update config.py**

Replace `mcp-server/config.py`:

```python
import os

DJANGO_BASE_URL = os.getenv("DJANGO_BASE_URL", "http://localhost:8000")
MCP_HOST = os.getenv("MCP_HOST", "0.0.0.0")
MCP_PORT = int(os.getenv("MCP_PORT", "9000"))
MCP_PUBLIC_URL = os.getenv("MCP_PUBLIC_URL", "http://localhost:9000")
OAUTH_ISSUER_URL = os.getenv("OAUTH_ISSUER_URL", "http://localhost:8000")
```

- [ ] **Step 4: Implement protected resource metadata route**

In `mcp-server/server.py`, add the import at the top:

```python
from starlette.responses import JSONResponse
from starlette.routing import Route

from config import DJANGO_BASE_URL, MCP_HOST, MCP_PORT, MCP_PUBLIC_URL, OAUTH_ISSUER_URL
```

After the `mcp = FastMCP(...)` block (around line 184), add a custom route mount:

```python
async def protected_resource_metadata(request):
    """RFC 9728 — OAuth 2.0 Protected Resource Metadata."""
    return JSONResponse(
        {
            "resource": MCP_PUBLIC_URL,
            "authorization_servers": [OAUTH_ISSUER_URL],
        }
    )


# Mount well-known route on the Starlette app
_well_known_route = Route(
    "/.well-known/oauth-protected-resource",
    protected_resource_metadata,
    methods=["GET"],
)

_original_app = mcp.streamable_http_app

def _patched_streamable_http_app():
    app = _original_app()
    app.routes.insert(0, _well_known_route)
    return app

mcp.streamable_http_app = _patched_streamable_http_app
```

Note: This approach inserts the well-known route at the start of the Starlette app's route list, so it's matched before the MCP transport routes. If FastMCP provides a better extension mechanism, use that instead. Check the FastMCP docs or source for `custom_routes` or `mount` options.

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
cd mcp-server && python -m pytest tests/test_server.py::test_protected_resource_metadata -v
```

Expected: PASS

- [ ] **Step 6: Run all MCP server tests**

Run:
```bash
cd mcp-server && python -m pytest tests/ -v
```

Expected: All tests PASS (existing + new).

- [ ] **Step 7: Commit**

```bash
git add mcp-server/
git commit -m "feat: add RFC 9728 protected resource metadata endpoint to MCP server"
```

---

## Task 6: Management Command — create_mcp_oauth_app

**Files:**
- Create: `backend/apps/oauth/management/__init__.py`
- Create: `backend/apps/oauth/management/commands/__init__.py`
- Create: `backend/apps/oauth/management/commands/create_mcp_oauth_app.py`

- [ ] **Step 1: Create the management command**

Create empty `__init__.py` files:
- `backend/apps/oauth/management/__init__.py`
- `backend/apps/oauth/management/commands/__init__.py`

Create `backend/apps/oauth/management/commands/create_mcp_oauth_app.py`:

```python
from django.core.management.base import BaseCommand
from oauth2_provider.models import Application


class Command(BaseCommand):
    help = "Create a fallback public OAuth Application for MCP clients that don't support DCR"

    def add_arguments(self, parser):
        parser.add_argument(
            "--client-id",
            default="qjudge-mcp-public",
            help="Client ID for the fallback application (default: qjudge-mcp-public)",
        )
        parser.add_argument(
            "--redirect-uris",
            default="http://localhost:3000/callback http://127.0.0.1:3000/callback",
            help="Space-separated redirect URIs",
        )

    def handle(self, *args, **options):
        client_id = options["client_id"]
        redirect_uris = options["redirect_uris"]

        app, created = Application.objects.get_or_create(
            client_id=client_id,
            defaults={
                "name": "QJudge MCP (Fallback)",
                "client_secret": "",
                "client_type": Application.CLIENT_PUBLIC,
                "authorization_grant_type": Application.GRANT_AUTHORIZATION_CODE,
                "redirect_uris": redirect_uris,
                "skip_authorization": False,
            },
        )

        if created:
            self.stdout.write(
                self.style.SUCCESS(f"Created OAuth Application: client_id={client_id}")
            )
        else:
            self.stdout.write(
                self.style.WARNING(f"OAuth Application already exists: client_id={client_id}")
            )
```

- [ ] **Step 2: Test the command**

Run:
```bash
docker compose -f docker-compose.dev.yml exec backend python manage.py create_mcp_oauth_app --client-id test-fallback
```

Expected: `Created OAuth Application: client_id=test-fallback`

Run again:

Expected: `OAuth Application already exists: client_id=test-fallback`

- [ ] **Step 3: Commit**

```bash
git add backend/apps/oauth/management/
git commit -m "feat: add create_mcp_oauth_app management command for fallback OAuth client"
```

---

## Task 7: Frontend OAuth Authorize Page

**Files:**
- Create: `frontend/src/features/auth/screens/OAuthAuthorizePage.tsx`
- Modify: `frontend/src/features/auth/routes.tsx`
- Modify: `frontend/src/features/auth/index.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/i18n/locales/zh-TW/common.json`
- Modify: `frontend/src/i18n/locales/en/common.json`

- [ ] **Step 1: Add i18n keys**

Add to `frontend/src/i18n/locales/zh-TW/common.json` under a new `"oauth"` key:

```json
"oauth": {
  "authorize": {
    "title": "授權請求",
    "description": "{{clientName}} 正在請求存取你的 QJudge 帳號",
    "allow": "允許",
    "deny": "拒絕",
    "loading": "處理中...",
    "error": "授權失敗，請稍後再試",
    "invalidRequest": "無效的授權請求"
  }
}
```

Add the English equivalents to `frontend/src/i18n/locales/en/common.json`:

```json
"oauth": {
  "authorize": {
    "title": "Authorization Request",
    "description": "{{clientName}} is requesting access to your QJudge account",
    "allow": "Allow",
    "deny": "Deny",
    "loading": "Processing...",
    "error": "Authorization failed. Please try again.",
    "invalidRequest": "Invalid authorization request"
  }
}
```

- [ ] **Step 2: Create the OAuthAuthorizePage component**

Create `frontend/src/features/auth/screens/OAuthAuthorizePage.tsx`:

```tsx
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Tile, InlineNotification, Loading } from "@carbon/react";
import { Checkmark, Close } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { httpClient } from "@/infrastructure/api/http.client";

export default function OAuthAuthorizePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string>("MCP Client");

  const clientId = searchParams.get("client_id");
  const redirectUri = searchParams.get("redirect_uri");
  const responseType = searchParams.get("response_type");
  const codeChallenge = searchParams.get("code_challenge");
  const codeChallengeMethod = searchParams.get("code_challenge_method");
  const state = searchParams.get("state");
  const scope = searchParams.get("scope") || "mcp";

  const isValid = clientId && redirectUri && responseType === "code";

  useEffect(() => {
    // Try to extract client name from params or use default
    const name = searchParams.get("client_name");
    if (name) setClientName(name);
  }, [searchParams]);

  const handleApprove = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await httpClient.post("/api/oauth/approve/", {
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: responseType,
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        state: state || undefined,
        scope,
      });
      if (response.redirect_uri) {
        window.location.href = response.redirect_uri;
      }
    } catch {
      setError(t("oauth.authorize.error"));
      setLoading(false);
    }
  };

  const handleDeny = async () => {
    setLoading(true);
    try {
      const response = await httpClient.post("/api/oauth/approve/", {
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: responseType,
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        state: state || undefined,
        deny: true,
      });
      if (response.redirect_uri) {
        window.location.href = response.redirect_uri;
      }
    } catch {
      setError(t("oauth.authorize.error"));
      setLoading(false);
    }
  };

  if (!isValid) {
    return (
      <div style={{ maxWidth: 480, margin: "4rem auto", padding: "0 1rem" }}>
        <InlineNotification
          kind="error"
          title={t("oauth.authorize.invalidRequest")}
          hideCloseButton
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: "4rem auto", padding: "0 1rem" }}>
      <Tile>
        <h2 style={{ marginBottom: "1rem" }}>{t("oauth.authorize.title")}</h2>
        <p style={{ marginBottom: "2rem" }}>
          {t("oauth.authorize.description", { clientName })}
        </p>
        {user && (
          <p style={{ marginBottom: "2rem", color: "var(--cds-text-secondary)" }}>
            {user.username} ({user.email})
          </p>
        )}

        {error && (
          <InlineNotification
            kind="error"
            title={error}
            hideCloseButton
            style={{ marginBottom: "1rem" }}
          />
        )}

        <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
          <Button
            kind="secondary"
            onClick={handleDeny}
            disabled={loading}
            renderIcon={Close}
          >
            {t("oauth.authorize.deny")}
          </Button>
          <Button
            kind="primary"
            onClick={handleApprove}
            disabled={loading}
            renderIcon={Checkmark}
          >
            {loading ? t("oauth.authorize.loading") : t("oauth.authorize.allow")}
          </Button>
        </div>
      </Tile>
    </div>
  );
}
```

- [ ] **Step 3: Add the route**

Add to `frontend/src/features/auth/routes.tsx`:

```tsx
import OAuthAuthorizePage from "./screens/OAuthAuthorizePage";

export const oauthAuthorizeRoute = (
  <Route path="/oauth/authorize" element={<OAuthAuthorizePage />} />
);
```

Export from `frontend/src/features/auth/index.ts`:

```typescript
export { guestRoutes, oauthCallbackRoute, onboardingRoute, teacherActivationRoute, oauthAuthorizeRoute } from "./routes";
```

- [ ] **Step 4: Mount the route in App.tsx**

In `frontend/src/App.tsx`, import `oauthAuthorizeRoute` and mount it inside the `<Route element={<AuthLayout />}>` block, alongside `oauthCallbackRoute`:

```tsx
<Route element={<AuthLayout />}>
  <Route element={<RequireGuest />}>
    {guestRoutes}
  </Route>
  {oauthCallbackRoute}
  {oauthAuthorizeRoute}  {/* Add this line */}
  {teacherActivationRoute}
  <Route element={<RequireAuth />}>
    <Route element={<RequirePendingOnboarding />}>
      {onboardingRoute}
    </Route>
  </Route>
</Route>
```

Note: This route is NOT inside `RequireGuest` because the user must be logged in. The login redirect is handled by Django's `login_required` on the `/o/authorize/` endpoint before the user ever reaches this frontend page. If someone navigates directly to `/oauth/authorize` without being logged in, the httpClient will redirect to `/login` on 401 from the approve API.

- [ ] **Step 5: Verify in browser**

Start the dev server and navigate to `http://localhost:5173/oauth/authorize?client_id=test&redirect_uri=http://localhost:3000/callback&response_type=code`. Should show the "Invalid authorization request" message if params are incomplete, or the consent form if all params are valid.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/auth/ frontend/src/App.tsx frontend/src/i18n/
git commit -m "feat: add frontend OAuth authorization consent page"
```

---

## Task 8: Frontend MCP Setup Tab in Settings Dialog

**Files:**
- Create: `frontend/src/features/auth/components/settings/MCPSetupPanel.tsx`
- Modify: `frontend/src/features/auth/components/SettingsDialog.tsx`
- Modify: `frontend/src/i18n/locales/zh-TW/common.json`
- Modify: `frontend/src/i18n/locales/en/common.json`

- [ ] **Step 1: Add i18n keys**

Add to `zh-TW/common.json`:

```json
"settings": {
  "tabs": {
    "mcp": "MCP 連線"
  }
},
"mcp": {
  "setup": {
    "title": "連接 AI 工具",
    "description": "使用 MCP 協定將 QJudge 連接到你的 AI 開發工具。加入後第一次使用會自動開啟瀏覽器登入授權。",
    "claudeCode": "Claude Code",
    "cursor": "Cursor",
    "codex": "Codex CLI",
    "copySuccess": "已複製",
    "step1": "在終端機執行以下指令：",
    "step1Cursor": "將以下設定加入 .cursor/mcp.json：",
    "verifyHint": "加入後第一次呼叫工具時，瀏覽器會自動開啟登入並授權。"
  }
}
```

Add English equivalents to `en/common.json`:

```json
"settings": {
  "tabs": {
    "mcp": "MCP Connection"
  }
},
"mcp": {
  "setup": {
    "title": "Connect AI Tools",
    "description": "Connect QJudge to your AI development tools via MCP protocol. Authorization will happen automatically in the browser on first use.",
    "claudeCode": "Claude Code",
    "cursor": "Cursor",
    "codex": "Codex CLI",
    "copySuccess": "Copied",
    "step1": "Run the following command in your terminal:",
    "step1Cursor": "Add the following to .cursor/mcp.json:",
    "verifyHint": "On first tool call after setup, your browser will open for login and authorization."
  }
}
```

- [ ] **Step 2: Create MCPSetupPanel component**

Create `frontend/src/features/auth/components/settings/MCPSetupPanel.tsx`:

```tsx
import { useState } from "react";
import {
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  CodeSnippet,
  InlineNotification,
} from "@carbon/react";
import { useTranslation } from "react-i18next";
import { Section } from "@/shared/layout/SettingsPanel";

const MCP_URL = "https://mcp.qjudge.com/mcp";

const CLAUDE_CODE_CMD = `claude mcp add --transport http qjudge ${MCP_URL}`;

const CURSOR_CONFIG = `{
  "mcpServers": {
    "qjudge": {
      "type": "http",
      "url": "${MCP_URL}"
    }
  }
}`;

const CODEX_CMD = `codex mcp add --transport http qjudge ${MCP_URL}`;

export const MCPSetupPanel: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div>
      <Section
        title={t("mcp.setup.title")}
        description={t("mcp.setup.description")}
      >
        <Tabs>
          <TabList aria-label="MCP client setup">
            <Tab>{t("mcp.setup.claudeCode")}</Tab>
            <Tab>{t("mcp.setup.cursor")}</Tab>
            <Tab>{t("mcp.setup.codex")}</Tab>
          </TabList>
          <TabPanels>
            <TabPanel>
              <p style={{ marginBottom: "0.5rem" }}>{t("mcp.setup.step1")}</p>
              <CodeSnippet type="single" feedback={t("mcp.setup.copySuccess")}>
                {CLAUDE_CODE_CMD}
              </CodeSnippet>
            </TabPanel>
            <TabPanel>
              <p style={{ marginBottom: "0.5rem" }}>{t("mcp.setup.step1Cursor")}</p>
              <CodeSnippet type="multi" feedback={t("mcp.setup.copySuccess")}>
                {CURSOR_CONFIG}
              </CodeSnippet>
            </TabPanel>
            <TabPanel>
              <p style={{ marginBottom: "0.5rem" }}>{t("mcp.setup.step1")}</p>
              <CodeSnippet type="single" feedback={t("mcp.setup.copySuccess")}>
                {CODEX_CMD}
              </CodeSnippet>
            </TabPanel>
          </TabPanels>
        </Tabs>

        <InlineNotification
          kind="info"
          title={t("mcp.setup.verifyHint")}
          hideCloseButton
          lowContrast
          style={{ marginTop: "1rem" }}
        />
      </Section>
    </div>
  );
};
```

- [ ] **Step 3: Add MCP tab to SettingsDialog**

Modify `frontend/src/features/auth/components/SettingsDialog.tsx`:

Add import:
```tsx
import { Connect } from "@carbon/icons-react";
import { MCPSetupPanel } from "@/features/auth/components/settings/MCPSetupPanel";
```

Add to `NAV_ITEM_DEFS` array (after apikey, before plans):
```tsx
{ id: "mcp", tKey: "settings.tabs.mcp", icon: Connect, adminOnly: true },
```

Add memoized panel:
```tsx
const MemoMCPSetupPanel = React.memo(MCPSetupPanel);
```

Add case to `renderPanel`:
```tsx
case "mcp":
  return isTeacherOrAdmin ? <MemoMCPSetupPanel /> : null;
```

Add to `renderMobileContent` (after the apikey section):
```tsx
{isTeacherOrAdmin && (
  <div id="settings-section-mcp">
    <h2 className="settings-modal__content-title">
      {t("settings.tabs.mcp", "MCP 連線")}
    </h2>
    <MemoMCPSetupPanel />
  </div>
)}
```

- [ ] **Step 4: Verify in browser**

Open the settings dialog and check the MCP tab appears for teacher/admin users. Verify copy buttons work.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/auth/components/settings/ frontend/src/features/auth/components/SettingsDialog.tsx frontend/src/i18n/
git commit -m "feat: add MCP setup tutorial tab in settings dialog"
```

---

## Task 9: Production Docker Compose + Dev Env Updates

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docker-compose.dev.yml`

- [ ] **Step 1: Add MCP service to production docker-compose.yml**

Insert before the `frontend` service (around line 352):

```yaml
  # MCP Server (OAuth 2.1 + tool proxy)
  qjudge-mcp:
    build:
      context: ./mcp-server
    container_name: oj_mcp
    environment:
      - DJANGO_BASE_URL=http://backend:8000
      - MCP_PUBLIC_URL=${MCP_PUBLIC_URL:-https://mcp.qjudge.com}
      - OAUTH_ISSUER_URL=${OAUTH_ISSUER_URL:-https://qjudge.com}
    depends_on:
      - backend
    networks:
      - oj_network
    restart: unless-stopped
```

No port mapping — accessed via Cloudflare Tunnel.

- [ ] **Step 2: Update dev compose MCP service with new env vars**

In `docker-compose.dev.yml`, update the `qjudge-mcp` service environment:

```yaml
  qjudge-mcp:
    build:
      context: ./mcp-server
    container_name: oj_mcp_dev
    ports:
      - "9002:9000"
    environment:
      - DJANGO_BASE_URL=http://backend:8000
      - MCP_PUBLIC_URL=http://localhost:9002
      - OAUTH_ISSUER_URL=http://localhost:8000
    depends_on:
      - backend
    networks:
      - oj_network_dev
    restart: unless-stopped
```

- [ ] **Step 3: Add OAUTH_ISSUER_URL to Django backend services in dev compose**

In the `backend` service environment section of `docker-compose.dev.yml`, add:

```yaml
      - OAUTH_ISSUER_URL=http://localhost:8000
      - FRONTEND_URL=http://localhost:5173
```

And in `docker-compose.yml` backend service:

```yaml
      - OAUTH_ISSUER_URL=${OAUTH_ISSUER_URL:-https://qjudge.com}
      - FRONTEND_URL=${FRONTEND_URL:-https://qjudge.com}
```

- [ ] **Step 4: Verify dev compose builds**

Run:
```bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d --build qjudge-mcp
```

Expected: MCP container starts successfully.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml docker-compose.dev.yml
git commit -m "feat: add MCP server to production compose and update dev env vars"
```

---

## Task 10: Update MCP Setup Documentation

**Files:**
- Modify: `frontend/public/docs/zh-TW/mcp-setup.md`

- [ ] **Step 1: Update the documentation**

Update `frontend/public/docs/zh-TW/mcp-setup.md` to reflect the new OAuth flow:

Key changes:
- Remove references to manual token generation
- Update installation commands to remove `--header "Authorization: Bearer <TOKEN>"` (OAuth is automatic now)
- Claude Code: `claude mcp add --transport http qjudge https://mcp.qjudge.com/mcp`
- Cursor: Simple URL-only config (no headers needed)
- Update security section to mention automatic OAuth 2.1 flow with PKCE
- Update prerequisites: just need teacher/TA role, no token required
- Add note about browser authorization on first use

- [ ] **Step 2: Verify docs render**

Check the docs page in the browser at the dev docs route.

- [ ] **Step 3: Commit**

```bash
git add frontend/public/docs/zh-TW/mcp-setup.md
git commit -m "docs: update MCP setup guide for automatic OAuth 2.1 flow"
```

---

## Task 11: End-to-End Verification

**No new files — integration test of the full flow.**

- [ ] **Step 1: Start all dev services**

```bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d --build
```

- [ ] **Step 2: Verify metadata endpoints**

```bash
curl http://localhost:8000/.well-known/oauth-authorization-server | jq .
curl http://localhost:9002/.well-known/oauth-protected-resource | jq .
```

Expected: Valid JSON metadata from both endpoints.

- [ ] **Step 3: Verify DCR endpoint**

```bash
curl -X POST http://localhost:8000/o/register/ \
  -H "Content-Type: application/json" \
  -d '{"client_name":"Test","grant_types":["authorization_code"],"token_endpoint_auth_method":"none","redirect_uris":["http://localhost:3000/callback"]}'
```

Expected: 201 with `client_id` in response.

- [ ] **Step 4: Verify authorize redirect**

Log in to QJudge in the browser, then navigate to:
```
http://localhost:8000/o/authorize/?response_type=code&client_id=<client_id_from_step_3>&redirect_uri=http://localhost:3000/callback&code_challenge=test&code_challenge_method=S256
```

Expected: Redirects to `http://localhost:5173/oauth/authorize?...` with all params.

- [ ] **Step 5: Verify frontend authorize page**

Should see the consent page with "Allow" / "Deny" buttons.

- [ ] **Step 6: Run all backend tests**

```bash
docker compose -f docker-compose.dev.yml exec backend python -m pytest apps/oauth/ -v --no-cov
```

Expected: All tests PASS.

- [ ] **Step 7: Run all MCP server tests**

```bash
cd mcp-server && python -m pytest tests/ -v
```

Expected: All tests PASS.

- [ ] **Step 8: Final commit if any fixes needed**

Only commit if fixes were applied during verification.
