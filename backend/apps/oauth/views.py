import json
import secrets
import string

from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST
from oauth2_provider.models import Application


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
