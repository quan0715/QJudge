"""Production framework errors for the migrated users slice."""
from django.http import JsonResponse
from django.views.defaults import server_error
from apps.core.api.envelope import error_meta


def contract_server_error(request):
    if any(request.path == prefix or request.path.startswith(prefix + "/") for prefix in
           ("/api/v1/users", "/api/v1/auth", "/api/v1/action-links")):
        return JsonResponse({"errors": [{"code": "internal_error", "message": "Internal server error.",
                                        "field": None, "details": {}}], "meta": error_meta(request)}, status=500)
    return server_error(request)
