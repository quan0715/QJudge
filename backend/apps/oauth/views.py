import json
import secrets
import string
from datetime import timedelta
from urllib.parse import urlencode, urlparse, quote

from django.conf import settings
from django.contrib.auth import get_user_model
from django.http import JsonResponse
from django.shortcuts import redirect
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST
from oauth2_provider.models import Application, Grant
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import AccessToken

User = get_user_model()


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
            "scopes_supported": ["mcp"],
            "token_endpoint_auth_methods_supported": ["none"],
        }
    )


def _generate_client_id(length=32):
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _get_user_from_jwt_cookie(request):
    """Read JWT from HttpOnly cookie and return the user, or None."""
    cookie_name = getattr(settings, "JWT_AUTH_COOKIE", "access_token")
    raw_token = request.COOKIES.get(cookie_name)
    if not raw_token:
        return None
    try:
        validated = AccessToken(raw_token)
        user_id = validated.get("user_id")
        return User.objects.get(pk=user_id)
    except Exception:
        return None


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

    if "authorization_code" not in grant_types:
        return JsonResponse(
            {
                "error": "invalid_client_metadata",
                "error_description": "authorization_code grant type is required",
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

    allowed_schemes = {"http", "https", "cursor", "vscode"}
    for uri in redirect_uris:
        parsed = urlparse(uri)
        if parsed.scheme not in allowed_schemes:
            return JsonResponse(
                {
                    "error": "invalid_client_metadata",
                    "error_description": f"Invalid redirect_uri: {uri}",
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


@require_GET
def authorize_redirect(request):
    """Redirect to frontend OAuth authorize page, using JWT cookie for auth."""
    frontend_url = getattr(settings, "FRONTEND_URL", settings.OAUTH_ISSUER_URL)
    user = _get_user_from_jwt_cookie(request)

    if not user:
        # Not logged in — redirect to frontend login with next= full backend URL
        full_url = request.build_absolute_uri()
        return redirect(f"{frontend_url}/login?next={quote(full_url, safe='')}")

    params = request.GET.urlencode()
    # Look up client name from Application for the consent page
    client_id = request.GET.get("client_id")
    if client_id:
        try:
            app = Application.objects.get(client_id=client_id)
            params += f"&client_name={quote(app.name, safe='')}"
        except Application.DoesNotExist:
            pass
    return redirect(f"{frontend_url}/oauth/authorize?{params}")


class ApproveAuthorizationView(APIView):
    """Create authorization code and return redirect URL.

    Uses DRF authentication chain (CookieJWT / OAuth2 / JWT header).
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        body = request.data

        client_id = body.get("client_id")
        redirect_uri = body.get("redirect_uri")
        state = body.get("state", "")
        code_challenge = body.get("code_challenge", "")
        code_challenge_method = body.get("code_challenge_method", "")
        scope = body.get("scope", "mcp")
        deny = body.get("deny", False)

        if not client_id or not redirect_uri:
            return Response(
                {"error": "invalid_request", "error_description": "client_id and redirect_uri are required"},
                status=400,
            )

        try:
            application = Application.objects.get(client_id=client_id)
        except Application.DoesNotExist:
            return Response(
                {"error": "invalid_client", "error_description": "Unknown client_id"},
                status=400,
            )

        # Validate redirect_uri is registered
        allowed_uris = application.redirect_uris.split()
        if redirect_uri not in allowed_uris:
            return Response(
                {"error": "invalid_request", "error_description": "redirect_uri not registered"},
                status=400,
            )

        # Handle deny
        if deny:
            params = {"error": "access_denied", "error_description": "User denied the request"}
            if state:
                params["state"] = state
            return Response({"redirect_uri": f"{redirect_uri}?{urlencode(params)}"})

        # Create authorization grant (code)
        code = secrets.token_urlsafe(32)
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
        return Response({"redirect_uri": f"{redirect_uri}?{urlencode(params)}"})
