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
